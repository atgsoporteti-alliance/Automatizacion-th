import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { desc, eq, or } from 'drizzle-orm';
import {
  candidateMeetings,
  candidateNotifications,
  candidateProcesses,
} from '@alliance-hcm/database';
import {
  CANDIDATE_PORTAL_VISIBILITY_DAYS,
  CANDIDATE_STAGE_LABELS,
  CandidateNotificationType,
  CandidateStage,
  computeCandidatePortalVisibility,
  MEETING_STATUS_LABELS,
  WORKFLOW_STEP_LABELS,
  WorkflowStep,
} from '@alliance-hcm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import {
  CreateCandidateMeetingDto,
  CreateCandidateProcessDto,
  UpdateCandidateMeetingDto,
  UpdateCandidateStageDto,
} from './dto/candidate-portal.dto';

@Injectable()
export class CandidatePortalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private buildUrls(accessToken: string, preOnboardingToken: string | null, requestOrigin?: string) {
    const webUrl = resolveFrontendOrigin({
      configuredWebUrl: this.config.get<string>('WEB_URL'),
      requestOrigin,
      nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
    });
    return {
      portalUrl: `${webUrl}/candidato/${accessToken}`,
      preOnboardingUrl: preOnboardingToken ? `${webUrl}/pre-ingreso/${preOnboardingToken}` : null,
    };
  }

  private async signPreOnboardingToken(params: {
    processId: string;
    email: string;
    name: string;
    nationalId?: string | null;
    employeeId?: string | null;
    workflowId?: string | null;
    correctionNote?: string;
  }): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: params.email,
        name: params.name,
        nationalId: params.nationalId ?? null,
        candidateProcessId: params.processId,
        ...(params.employeeId && params.workflowId
          ? {
              employeeId: params.employeeId,
              workflowId: params.workflowId,
              correctionNote: params.correctionNote,
            }
          : {}),
        purpose: 'PRE_ONBOARDING',
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'alliance-hcm-dev-jwt-secret'),
        expiresIn: '72h',
      },
    );
  }

  async addNotification(params: {
    processId: string;
    type: CandidateNotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const [created] = await this.database.db
      .insert(candidateNotifications)
      .values({
        processId: params.processId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata ?? {},
      })
      .returning();
    return created;
  }

  async listProcesses(requestOrigin?: string) {
    const rows = await this.database.db.query.candidateProcesses.findMany({
      with: {
        employee: {
          columns: {
            id: true,
            fullName: true,
            nationalId: true,
            personalEmail: true,
            operationalArea: true,
            status: true,
          },
        },
        workflow: {
          columns: {
            id: true,
            currentStep: true,
            helpdeskTicketId: true,
            notes: true,
            updatedAt: true,
          },
        },
        meetings: {
          orderBy: (m, { asc }) => [asc(m.scheduledAt)],
        },
        notifications: {
          orderBy: (n, { desc: descOrder }) => [descOrder(n.createdAt)],
        },
      },
      orderBy: [desc(candidateProcesses.updatedAt)],
    });

    const now = new Date();
    return rows.map((proc) => ({
      ...proc,
      ...this.buildUrls(proc.accessToken, proc.preOnboardingToken, requestOrigin),
      visibility: computeCandidatePortalVisibility(proc.hiringApprovedAt, now),
    }));
  }

  async createProcess(dto: CreateCandidateProcessDto, actorId: string, requestOrigin?: string) {
    const accessToken = randomBytes(24).toString('base64url');
    const [created] = await this.database.db
      .insert(candidateProcesses)
      .values({
        accessToken,
        candidateName: dto.candidateName.trim(),
        candidateEmail: dto.candidateEmail.trim().toLowerCase(),
        nationalId: dto.nationalId?.trim() || null,
        appliedRole: dto.appliedRole?.trim() || null,
        stage: 'REGISTERED',
      })
      .returning();

    await this.addNotification({
      processId: created.id,
      type: 'STAGE_CHANGE',
      title: 'Bienvenido al Portal de Selección Alliance',
      message: `Se inició tu proceso${created.appliedRole ? ` para ${created.appliedRole}` : ''}. Carga tu hoja de vida para continuar con las entrevistas.`,
    });

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_PROCESS_CREATED',
      entity: 'candidate_processes',
      entityId: created.id,
      newValues: {
        candidateEmail: created.candidateEmail,
        appliedRole: created.appliedRole,
      },
    });

    const urls = this.buildUrls(created.accessToken, null, requestOrigin);
    const emailRes = await this.mailService?.sendCandidatePortalInviteEmail({
      to: created.candidateEmail,
      candidateName: created.candidateName,
      appliedRole: created.appliedRole,
      portalUrl: urls.portalUrl,
    });

    return {
      ...created,
      ...urls,
      emailSent: Boolean(emailRes?.sent),
      visibility: computeCandidatePortalVisibility(null),
    };
  }

  async addMeeting(processId: string, dto: CreateCandidateMeetingDto, actorId: string) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc) {
      throw new NotFoundException(`Proceso de candidato ${processId} no encontrado`);
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Fecha/hora de reunión inválida.');
    }

    const [meeting] = await this.database.db
      .insert(candidateMeetings)
      .values({
        processId,
        title: dto.title.trim(),
        meetingType: dto.meetingType?.trim() || 'Entrevista TH',
        scheduledAt,
        meetingUrl: dto.meetingUrl?.trim() || null,
        location: dto.location?.trim() || null,
        interviewerName: dto.interviewerName?.trim() || null,
        status: 'SCHEDULED',
        notes: dto.notes?.trim() || null,
      })
      .returning();

    const shouldAdvanceToSelection = proc.stage === 'REGISTERED' || proc.stage === 'CV_UPLOADED';
    if (shouldAdvanceToSelection) {
      await this.database.db
        .update(candidateProcesses)
        .set({ stage: 'IN_SELECTION', updatedAt: new Date() })
        .where(eq(candidateProcesses.id, processId));
    }

    const formattedDate = scheduledAt.toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await this.addNotification({
      processId,
      type: 'MEETING',
      title: `Reunión programada: ${meeting.title}`,
      message: `${meeting.meetingType} el ${formattedDate}${meeting.interviewerName ? ` con ${meeting.interviewerName}` : ''}.${meeting.meetingUrl ? ' Enlace disponible en la sección Reuniones.' : ''}`,
      metadata: { meetingId: meeting.id, scheduledAt: meeting.scheduledAt.toISOString() },
    });

    await this.mailService?.sendCandidateMeetingEmail({
      to: proc.candidateEmail,
      candidateName: proc.candidateName,
      title: meeting.title,
      meetingType: meeting.meetingType,
      scheduledAtLabel: formattedDate,
      meetingUrl: meeting.meetingUrl,
      location: meeting.location,
      interviewerName: meeting.interviewerName,
      notes: meeting.notes,
      isUpdate: false,
    });

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_MEETING_CREATED',
      entity: 'candidate_meetings',
      entityId: meeting.id,
      newValues: { processId, title: meeting.title, scheduledAt: meeting.scheduledAt },
    });

    return meeting;
  }

  async updateMeeting(meetingId: string, dto: UpdateCandidateMeetingDto, actorId: string) {
    const existing = await this.database.db.query.candidateMeetings.findFirst({
      where: eq(candidateMeetings.id, meetingId),
    });
    if (!existing) {
      throw new NotFoundException(`Reunión ${meetingId} no encontrada`);
    }

    const nextScheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : existing.scheduledAt;
    if (dto.scheduledAt && Number.isNaN(nextScheduledAt.getTime())) {
      throw new BadRequestException('Fecha/hora de reunión inválida.');
    }

    const [updated] = await this.database.db
      .update(candidateMeetings)
      .set({
        status: dto.status,
        scheduledAt: nextScheduledAt,
        meetingUrl: dto.meetingUrl !== undefined ? dto.meetingUrl.trim() || null : existing.meetingUrl,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(candidateMeetings.id, meetingId))
      .returning();

    await this.addNotification({
      processId: existing.processId,
      type: 'MEETING',
      title: `Actualización de reunión: ${existing.title}`,
      message: `Estado cambiado a ${MEETING_STATUS_LABELS[dto.status]}.${updated.notes ? ` Nota: ${updated.notes}` : ''}`,
      metadata: { meetingId: updated.id, status: updated.status },
    });

    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, existing.processId),
    });
    if (proc) {
      await this.mailService?.sendCandidateMeetingEmail({
        to: proc.candidateEmail,
        candidateName: proc.candidateName,
        title: updated.title,
        meetingType: updated.meetingType,
        scheduledAtLabel: nextScheduledAt.toLocaleString('es-CO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        statusLabel: MEETING_STATUS_LABELS[dto.status],
        meetingUrl: updated.meetingUrl,
        location: updated.location,
        interviewerName: updated.interviewerName,
        notes: updated.notes,
        isUpdate: true,
      });
    }

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_MEETING_UPDATED',
      entity: 'candidate_meetings',
      entityId: meetingId,
      oldValues: { status: existing.status },
      newValues: { status: updated.status },
    });

    return updated;
  }

  async enablePreOnboarding(processId: string, actorId: string, requestOrigin?: string) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc) {
      throw new NotFoundException(`Proceso de candidato ${processId} no encontrado`);
    }

    const preOnboardingToken = await this.signPreOnboardingToken({
      processId: proc.id,
      email: proc.candidateEmail,
      name: proc.candidateName,
      nationalId: proc.nationalId,
    });

    const nextStage: CandidateStage =
      proc.stage === 'HIRED_APPROVED' ? 'HIRED_APPROVED' : 'PRE_ONBOARDING';

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({
        preOnboardingToken,
        stage: nextStage,
        updatedAt: new Date(),
      })
      .where(eq(candidateProcesses.id, processId))
      .returning();

    await this.addNotification({
      processId,
      type: 'PRE_ONBOARDING',
      title: 'Pre-Registro de ingreso habilitado',
      message:
        'Talento Humano habilitó tu formulario de Pre-Registro (24 campos, documentos y firma Ley 1581). Puedes completarlo desde este portal.',
    });

    const urls = this.buildUrls(updated.accessToken, preOnboardingToken, requestOrigin);
    if (urls.preOnboardingUrl) {
      await this.mailService?.sendPreOnboardingEnabledEmail({
        to: updated.candidateEmail,
        candidateName: updated.candidateName,
        preOnboardingUrl: urls.preOnboardingUrl,
        portalUrl: urls.portalUrl,
      });
    }

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_PRE_ONBOARDING_ENABLED',
      entity: 'candidate_processes',
      entityId: processId,
      newValues: { stage: nextStage },
    });

    return {
      process: updated,
      preOnboardingToken,
      ...urls,
    };
  }

  async updateStage(processId: string, dto: UpdateCandidateStageDto, actorId: string) {
    if (dto.stage === 'HIRED_APPROVED') {
      return this.markHiringApproved({
        processId,
        actorId,
        note: dto.note,
      });
    }

    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc) {
      throw new NotFoundException(`Proceso de candidato ${processId} no encontrado`);
    }

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({ stage: dto.stage, updatedAt: new Date() })
      .where(eq(candidateProcesses.id, processId))
      .returning();

    await this.addNotification({
      processId,
      type: 'STAGE_CHANGE',
      title: `Actualización de etapa: ${CANDIDATE_STAGE_LABELS[dto.stage]}`,
      message:
        dto.note?.trim() ||
        `Tu proceso pasó de ${CANDIDATE_STAGE_LABELS[proc.stage]} a ${CANDIDATE_STAGE_LABELS[dto.stage]}.`,
      metadata: { oldStage: proc.stage, newStage: dto.stage },
    });

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_STAGE_UPDATED',
      entity: 'candidate_processes',
      entityId: processId,
      oldValues: { stage: proc.stage },
      newValues: { stage: dto.stage, note: dto.note },
    });

    return updated;
  }

  /**
   * Marca aprobación de contratación por TH e inicia la ventana temporal de 15 días
   * tras la cual el registro deja de ser visible para el candidato (se conserva para TH).
   */
  async markHiringApproved(params: {
    processId?: string;
    workflowId?: string;
    employeeId?: string;
    candidateEmail?: string;
    nationalId?: string;
    actorId?: string;
    note?: string;
  }) {
    const proc = await this.findMatchingProcess(params);
    if (!proc) return null;

    const now = new Date();
    const approvedAt = proc.hiringApprovedAt ?? now;
    const expiresAt =
      proc.candidateAccessExpiresAt ??
      new Date(approvedAt.getTime() + CANDIDATE_PORTAL_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);

    const isFirstApproval = !proc.hiringApprovedAt;

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({
        stage: 'HIRED_APPROVED',
        hiringApprovedAt: approvedAt,
        candidateAccessExpiresAt: expiresAt,
        employeeId: params.employeeId ?? proc.employeeId,
        workflowId: params.workflowId ?? proc.workflowId,
        updatedAt: now,
      })
      .where(eq(candidateProcesses.id, proc.id))
      .returning();

    if (isFirstApproval) {
      const expiryFormatted = expiresAt.toLocaleDateString('es-CO', {
        dateStyle: 'long',
      });

      await this.addNotification({
        processId: proc.id,
        type: 'HIRING_APPROVED',
        title: 'Contratación aprobada por Talento Humano',
        message:
          params.note?.trim() ||
          `Talento Humano aprobó tu contratación. Este resumen temporal estará disponible para ti durante ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días (hasta el ${expiryFormatted}).`,
        metadata: {
          hiringApprovedAt: approvedAt.toISOString(),
          candidateAccessExpiresAt: expiresAt.toISOString(),
        },
      });

      const urls = this.buildUrls(proc.accessToken, proc.preOnboardingToken);
      await this.mailService?.sendHiringApprovedEmail({
        to: proc.candidateEmail,
        candidateName: proc.candidateName,
        expiresAtLabel: expiryFormatted,
        portalUrl: urls.portalUrl,
        visibilityDays: CANDIDATE_PORTAL_VISIBILITY_DAYS,
      });

      await this.auditService.record({
        actorId: params.actorId ?? 'th-analyst',
        action: 'CANDIDATE_HIRING_APPROVED_15D_TTL',
        entity: 'candidate_processes',
        entityId: proc.id,
        newValues: {
          hiringApprovedAt: approvedAt.toISOString(),
          candidateAccessExpiresAt: expiresAt.toISOString(),
        },
      });
    }

    return updated;
  }

  async syncPreOnboardingSubmission(params: {
    processId?: string;
    employeeId: string;
    workflowId: string;
    candidateName: string;
    candidateEmail: string;
    nationalId: string;
    isCorrection: boolean;
  }) {
    const proc = await this.findMatchingProcess({
      processId: params.processId,
      workflowId: params.workflowId,
      employeeId: params.employeeId,
      candidateEmail: params.candidateEmail,
      nationalId: params.nationalId,
    });
    if (!proc) return null;

    const nextStage: CandidateStage =
      proc.stage === 'HIRED_APPROVED' ? 'HIRED_APPROVED' : 'PRE_ONBOARDING';

    await this.database.db
      .update(candidateProcesses)
      .set({
        employeeId: params.employeeId,
        workflowId: params.workflowId,
        nationalId: params.nationalId,
        candidateName: params.candidateName,
        stage: nextStage,
        updatedAt: new Date(),
      })
      .where(eq(candidateProcesses.id, proc.id));

    await this.addNotification({
      processId: proc.id,
      type: params.isCorrection ? 'MODIFICATION' : 'PRE_ONBOARDING',
      title: params.isCorrection
        ? 'Corrección de pre-registro enviada'
        : 'Pre-registro enviado a Talento Humano',
      message: params.isCorrection
        ? 'Tus cambios y documentos actualizados fueron enviados correctamente para revisión de Talento Humano.'
        : 'Tu expediente de 24 campos y firma Ley 1581 fueron registrados y pasaron a revisión de TH.',
      metadata: { employeeId: params.employeeId, workflowId: params.workflowId },
    });

    return proc;
  }

  async syncWorkflowModification(params: {
    workflowId: string;
    employeeId: string;
    candidateEmail?: string;
    nationalId?: string;
    type: CandidateNotificationType;
    title: string;
    message: string;
    correctionToken?: string;
    step?: WorkflowStep;
  }) {
    const proc = await this.findMatchingProcess({
      workflowId: params.workflowId,
      employeeId: params.employeeId,
      candidateEmail: params.candidateEmail,
      nationalId: params.nationalId,
    });
    if (!proc) return null;

    if (params.correctionToken) {
      await this.database.db
        .update(candidateProcesses)
        .set({
          preOnboardingToken: params.correctionToken,
          stage: proc.stage === 'HIRED_APPROVED' ? 'HIRED_APPROVED' : 'PRE_ONBOARDING',
          updatedAt: new Date(),
        })
        .where(eq(candidateProcesses.id, proc.id));
    }

    await this.addNotification({
      processId: proc.id,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: {
        workflowId: params.workflowId,
        ...(params.step ? { step: params.step, stepLabel: WORKFLOW_STEP_LABELS[params.step] } : {}),
      },
    });

    return proc;
  }

  private async findMatchingProcess(params: {
    processId?: string;
    workflowId?: string;
    employeeId?: string;
    candidateEmail?: string;
    nationalId?: string;
  }) {
    if (params.processId) {
      const byId = await this.database.db.query.candidateProcesses.findFirst({
        where: eq(candidateProcesses.id, params.processId),
      });
      if (byId) return byId;
    }

    const conditions = [];
    if (params.workflowId) conditions.push(eq(candidateProcesses.workflowId, params.workflowId));
    if (params.employeeId) conditions.push(eq(candidateProcesses.employeeId, params.employeeId));
    if (params.candidateEmail) {
      conditions.push(eq(candidateProcesses.candidateEmail, params.candidateEmail.trim().toLowerCase()));
    }
    if (params.nationalId) conditions.push(eq(candidateProcesses.nationalId, params.nationalId.trim()));

    if (conditions.length === 0) return null;

    return this.database.db.query.candidateProcesses.findFirst({
      where: conditions.length === 1 ? conditions[0] : or(...conditions),
      orderBy: [desc(candidateProcesses.createdAt)],
    });
  }

  // --- Endpoints Públicos del Candidato (con caducidad estricta a 15 días tras aprobación TH) ---

  async getPublicPortalByToken(token: string, requestOrigin?: string, now: Date = new Date()) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.accessToken, token),
      with: {
        employee: {
          with: {
            documents: true,
            consentSignatures: true,
          },
        },
        workflow: true,
        meetings: {
          orderBy: (m, { asc }) => [asc(m.scheduledAt)],
        },
        notifications: {
          orderBy: (n, { desc: descOrder }) => [descOrder(n.createdAt)],
        },
      },
    });

    if (!proc) {
      throw new NotFoundException('El enlace al portal de candidato no existe o fue revocado.');
    }

    const visibility = computeCandidatePortalVisibility(proc.hiringApprovedAt, now);

    // Regla estricta: después de 15 días de aprobación TH, el registro ya NO es visible para el candidato
    if (visibility.isExpired) {
      return {
        expired: true,
        candidateName: proc.candidateName,
        appliedRole: proc.appliedRole,
        visibility,
        message: `El acceso temporal de ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días posteriores a la aprobación de contratación ha finalizado. Tu expediente continúa resguardado internamente por Talento Humano.`,
      };
    }

    const urls = this.buildUrls(proc.accessToken, proc.preOnboardingToken, requestOrigin);

    return {
      expired: false,
      visibility,
      process: {
        id: proc.id,
        candidateName: proc.candidateName,
        candidateEmail: proc.candidateEmail,
        nationalId: proc.nationalId,
        appliedRole: proc.appliedRole,
        stage: proc.stage,
        stageLabel: CANDIDATE_STAGE_LABELS[proc.stage],
        cv: proc.cvS3Key
          ? {
              fileName: proc.cvFileName,
              mimeType: proc.cvMimeType,
              fileSize: proc.cvFileSize,
              uploadedAt: proc.cvUploadedAt,
            }
          : null,
        preOnboarding: {
          enabled: Boolean(proc.preOnboardingToken),
          preOnboardingUrl: urls.preOnboardingUrl,
          workflowStep: proc.workflow?.currentStep ?? null,
          workflowStepLabel: proc.workflow?.currentStep
            ? WORKFLOW_STEP_LABELS[proc.workflow.currentStep]
            : null,
          correctionNote:
            proc.workflow?.currentStep === 'CANDIDATE_PENDING' ? proc.workflow.notes : null,
          submittedAt: proc.employee?.createdAt ?? null,
          updatedAt: proc.employee?.updatedAt ?? null,
          documentsCount: proc.employee?.documents?.length ?? 0,
          hasHabeasDataSigned: (proc.employee?.consentSignatures?.length ?? 0) > 0,
          operationalArea: proc.employee?.operationalArea ?? null,
        },
        meetings: proc.meetings,
        notifications: proc.notifications,
        unreadCount: proc.notifications.filter((n) => !n.isRead).length,
      },
    };
  }

  async uploadCandidateCv(
    token: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    now: Date = new Date(),
  ) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.accessToken, token),
    });

    if (!proc) {
      throw new NotFoundException('El enlace al portal de candidato no es válido.');
    }

    const visibility = computeCandidatePortalVisibility(proc.hiringApprovedAt, now);
    if (visibility.isExpired) {
      throw new ForbiddenException(
        `El acceso temporal de ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días ha expirado tras tu contratación.`,
      );
    }
    if (proc.stage === 'HIRED_APPROVED') {
      throw new ForbiddenException(
        'La contratación ya fue aprobada por TH; la hoja de vida quedó en solo lectura.',
      );
    }

    const uploaded = await this.storageService.uploadObject({
      folder: `candidates/${proc.id}/cv`,
      fileName: file.originalname,
      contentType: file.mimetype || 'application/pdf',
      body: file.buffer,
    });

    const nextStage: CandidateStage =
      proc.stage === 'REGISTERED' ? 'CV_UPLOADED' : proc.stage;

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({
        cvFileName: file.originalname,
        cvMimeType: uploaded.mimeType,
        cvFileSize: uploaded.fileSize,
        cvS3Key: uploaded.s3Key,
        cvS3Url: uploaded.publicUrl,
        cvUploadedAt: now,
        stage: nextStage,
        updatedAt: now,
      })
      .where(eq(candidateProcesses.id, proc.id))
      .returning();

    await this.addNotification({
      processId: proc.id,
      type: 'CV_UPLOADED',
      title: proc.cvS3Key ? 'Hoja de vida actualizada' : 'Hoja de vida recibida',
      message: `Se guardó el archivo "${file.originalname}" en Supabase Storage para el proceso de selección.`,
    });

    await this.auditService.record({
      actorId: proc.candidateEmail,
      action: 'CANDIDATE_CV_UPLOADED',
      entity: 'candidate_processes',
      entityId: proc.id,
      newValues: { fileName: file.originalname, s3Key: uploaded.s3Key },
    });

    return updated;
  }

  async getPublicCvContent(token: string, now: Date = new Date()) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.accessToken, token),
    });
    if (!proc || !proc.cvS3Key) {
      throw new NotFoundException('Hoja de vida no encontrada.');
    }

    const visibility = computeCandidatePortalVisibility(proc.hiringApprovedAt, now);
    if (visibility.isExpired) {
      throw new ForbiddenException(
        `El acceso temporal de ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días ha expirado.`,
      );
    }

    const buffer = await this.storageService.getObjectBuffer(proc.cvS3Key);
    return {
      buffer,
      fileName: proc.cvFileName ?? 'hoja-de-vida.pdf',
      mimeType: proc.cvMimeType ?? 'application/pdf',
    };
  }

  async getInternalCvContent(processId: string) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc || !proc.cvS3Key) {
      throw new NotFoundException('Hoja de vida no encontrada para este candidato.');
    }
    const buffer = await this.storageService.getObjectBuffer(proc.cvS3Key);
    return {
      buffer,
      fileName: proc.cvFileName ?? 'hoja-de-vida.pdf',
      mimeType: proc.cvMimeType ?? 'application/pdf',
    };
  }

  async markNotificationsRead(token: string, now: Date = new Date()) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.accessToken, token),
    });
    if (!proc) {
      throw new NotFoundException('Proceso no encontrado.');
    }

    const visibility = computeCandidatePortalVisibility(proc.hiringApprovedAt, now);
    if (visibility.isExpired) {
      throw new ForbiddenException('El acceso temporal de 15 días ha expirado.');
    }

    await this.database.db
      .update(candidateNotifications)
      .set({ isRead: true })
      .where(eq(candidateNotifications.processId, proc.id));

    return { ok: true };
  }
}
