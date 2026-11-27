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
import { asc, desc, eq, ne, or } from 'drizzle-orm';
import {
  candidateCompetencyEvaluations,
  candidateMeetings,
  candidateNotifications,
  candidateProcesses,
} from '@alliance-hcm/database';
import {
  ALLOWED_CV_MIME_TYPES,
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  CANDIDATE_PORTAL_VISIBILITY_DAYS,
  CANDIDATE_STAGE_LABELS,
  CandidateNotificationType,
  CandidateStage,
  computeCandidatePortalVisibility,
  computeCompetencyScoreSummary,
  detectMeetingPlatform,
  EVALUATION_RECOMMENDATION_LABELS,
  HABEAS_DATA_POLICY_VERSION,
  hasMeetingOverlap,
  MEETING_PLATFORM_LABELS,
  MEETING_PLATFORM_LOCATIONS,
  MEETING_STATUS_LABELS,
  OperationalArea,
  parseMeetingUrl,
  WORKFLOW_STEP_LABELS,
  WorkflowStep,
} from '@alliance-hcm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { decodeUploadedFileName } from '../../common/utils/file-header.util';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import {
  CreateCandidateMeetingDto,
  CreateCandidateProcessDto,
  CreateCompetencyEvaluationDto,
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
  ) { }

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
          orderBy: (m, { asc: ascOrder }) => [ascOrder(m.scheduledAt)],
        },
        notifications: {
          orderBy: (n, { desc: descOrder }) => [descOrder(n.createdAt)],
        },
        evaluations: {
          orderBy: (e, { desc: descOrder }) => [descOrder(e.createdAt)],
        },
      },
      orderBy: [desc(candidateProcesses.updatedAt)],
    });

    const now = new Date();
    return rows.map((proc) => {
      const formattedEvaluations = (proc.evaluations ?? []).map((e) => this.formatEvaluation(e));
      return {
        ...proc,
        evaluations: formattedEvaluations,
        evaluationSummary: this.buildEvaluationSummary(formattedEvaluations),
        ...this.buildUrls(proc.accessToken, proc.preOnboardingToken, requestOrigin),
        visibility: computeCandidatePortalVisibility(proc.hiringApprovedAt, now),
      };
    });
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

  private normalizeMeetingInput(
    rawUrl?: string,
    rawLocation?: string,
    fallbackLocation?: string | null,
  ): { meetingUrl: string | null; location: string | null; platformLabel: string | null } {
    const parsed = parseMeetingUrl(rawUrl);
    if (parsed.error) {
      throw new BadRequestException(parsed.error);
    }

    const trimmedLocation = rawLocation?.trim();
    const resolvedPlatform = parsed.platform;
    const platformLabel = resolvedPlatform ? MEETING_PLATFORM_LABELS[resolvedPlatform] : null;
    let location = trimmedLocation || fallbackLocation || null;

    const isGenericVirtualLocation =
      !location ||
      location === 'Virtual · Google Meet / Teams' ||
      location.startsWith('Virtual · ');

    if (
      parsed.url &&
      resolvedPlatform &&
      resolvedPlatform !== 'OTHER' &&
      (!trimmedLocation || isGenericVirtualLocation)
    ) {
      location = MEETING_PLATFORM_LOCATIONS[resolvedPlatform];
    }

    return {
      meetingUrl: parsed.url,
      location,
      platformLabel,
    };
  }

  private async assertNoInterviewerConflict(params: {
    scheduledAt: Date;
    durationMinutes: number;
    interviewerEmail?: string | null;
    interviewerName?: string | null;
    excludeMeetingId?: string;
    allowOverlap?: boolean;
  }) {
    if (params.allowOverlap) return;
    const emailKey = params.interviewerEmail?.trim().toLowerCase();
    const nameKey = params.interviewerName?.trim().toLowerCase();
    if (!emailKey && !nameKey) return;

    const findMany = this.database.db.query.candidateMeetings?.findMany;
    if (!findMany) return;

    const existingMeetings = await findMany({
      where: ne(candidateMeetings.status, 'CANCELLED'),
      with: {
        process: {
          columns: { candidateName: true },
        },
      },
    });

    for (const m of existingMeetings) {
      if (params.excludeMeetingId && m.id === params.excludeMeetingId) continue;
      const sameEmail =
        emailKey && m.interviewerEmail && m.interviewerEmail.trim().toLowerCase() === emailKey;
      const sameName =
        nameKey && m.interviewerName && m.interviewerName.trim().toLowerCase() === nameKey;
      if (!sameEmail && !sameName) continue;

      if (
        hasMeetingOverlap(
          params.scheduledAt,
          params.durationMinutes,
          new Date(m.scheduledAt),
          m.durationMinutes ?? 45,
        )
      ) {
        const formatted = new Date(m.scheduledAt).toLocaleString('es-CO', {
          dateStyle: 'short',
          timeStyle: 'short',
        });
        throw new BadRequestException(
          `Conflicto de agenda: ${m.interviewerName ?? emailKey} ya tiene la entrevista "${m.title}" (${m.process?.candidateName ?? 'candidato'}) el ${formatted}. Cambia el horario o marca "Permitir cruce" si aplica.`,
        );
      }
    }
  }

  async addMeeting(
    processId: string,
    dto: CreateCandidateMeetingDto,
    actorId: string,
    requestOrigin?: string,
  ) {
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

    const durationMinutes = dto.durationMinutes ?? 45;
    await this.assertNoInterviewerConflict({
      scheduledAt,
      durationMinutes,
      interviewerEmail: dto.interviewerEmail,
      interviewerName: dto.interviewerName,
      allowOverlap: dto.allowOverlap,
    });

    const { meetingUrl, location, platformLabel } = this.normalizeMeetingInput(
      dto.meetingUrl,
      dto.location,
    );

    const [meeting] = await this.database.db
      .insert(candidateMeetings)
      .values({
        processId,
        title: dto.title.trim(),
        meetingType: dto.meetingType?.trim() || 'Entrevista TH',
        scheduledAt,
        durationMinutes,
        meetingUrl,
        location,
        interviewerName: dto.interviewerName?.trim() || null,
        interviewerEmail: dto.interviewerEmail?.trim().toLowerCase() || null,
        operationalArea: dto.operationalArea ?? null,
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
      message: `${meeting.meetingType} el ${formattedDate} (${durationMinutes} min)${meeting.interviewerName ? ` con ${meeting.interviewerName}` : ''}.${meeting.meetingUrl ? ` Enlace de ${platformLabel ?? 'videollamada'} disponible en Reuniones.` : ''}`,
      metadata: {
        meetingId: meeting.id,
        scheduledAt: meeting.scheduledAt.toISOString(),
        durationMinutes,
        meetingUrl: meeting.meetingUrl,
      },
    });

    await this.mailService?.sendCandidateMeetingEmail({
      to: proc.candidateEmail,
      candidateName: proc.candidateName,
      title: meeting.title,
      meetingType: meeting.meetingType,
      scheduledAtLabel: `${formattedDate} (${durationMinutes} min)`,
      meetingUrl: meeting.meetingUrl,
      location: meeting.location,
      interviewerName: meeting.interviewerName,
      notes: meeting.notes,
      isUpdate: false,
    });

    if (meeting.interviewerEmail) {
      const webUrl = resolveFrontendOrigin({
        configuredWebUrl: this.config.get<string>('WEB_URL'),
        requestOrigin,
        nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
      });
      await this.mailService?.sendInterviewerScheduledEmail({
        to: meeting.interviewerEmail,
        interviewerName: meeting.interviewerName,
        candidateName: proc.candidateName,
        appliedRole: proc.appliedRole,
        title: meeting.title,
        meetingType: meeting.meetingType,
        scheduledAtLabel: formattedDate,
        durationMinutes,
        meetingUrl: meeting.meetingUrl,
        location: meeting.location,
        dashboardUrl: `${webUrl}/dashboard/entrevistas`,
      });
    }

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_MEETING_CREATED',
      entity: 'candidate_meetings',
      entityId: meeting.id,
      newValues: {
        processId,
        title: meeting.title,
        scheduledAt: meeting.scheduledAt,
        durationMinutes,
        meetingUrl: meeting.meetingUrl,
        location: meeting.location,
        interviewerEmail: meeting.interviewerEmail,
      },
    });

    return meeting;
  }

  async updateMeeting(
    meetingId: string,
    dto: UpdateCandidateMeetingDto,
    actorId: string,
    requestOrigin?: string,
  ) {
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

    const nextDurationMinutes = dto.durationMinutes ?? existing.durationMinutes ?? 45;
    const nextInterviewerEmail =
      dto.interviewerEmail !== undefined
        ? dto.interviewerEmail.trim().toLowerCase() || null
        : existing.interviewerEmail;

    const scheduleOrInterviewerChanged =
      Boolean(dto.scheduledAt) ||
      dto.durationMinutes !== undefined ||
      dto.interviewerEmail !== undefined;

    const nextStatus = dto.status ?? existing.status;
    if (scheduleOrInterviewerChanged && nextStatus !== 'CANCELLED') {
      await this.assertNoInterviewerConflict({
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDurationMinutes,
        interviewerEmail: nextInterviewerEmail,
        interviewerName: existing.interviewerName,
        excludeMeetingId: meetingId,
        allowOverlap: dto.allowOverlap,
      });
    }

    let nextMeetingUrl = existing.meetingUrl;
    let nextLocation = dto.location !== undefined ? dto.location.trim() || null : existing.location;
    let platformLabel: string | null = null;

    if (dto.meetingUrl !== undefined) {
      const normalized = this.normalizeMeetingInput(
        dto.meetingUrl,
        dto.location,
        existing.location,
      );
      nextMeetingUrl = normalized.meetingUrl;
      nextLocation = normalized.location;
      platformLabel = normalized.platformLabel;
    } else if (nextMeetingUrl) {
      platformLabel = MEETING_PLATFORM_LABELS[detectMeetingPlatform(nextMeetingUrl, nextLocation)];
    }

    const [updated] = await this.database.db
      .update(candidateMeetings)
      .set({
        status: nextStatus,
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDurationMinutes,
        meetingUrl: nextMeetingUrl,
        location: nextLocation,
        interviewerEmail: nextInterviewerEmail,
        operationalArea:
          dto.operationalArea !== undefined ? dto.operationalArea : existing.operationalArea,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(candidateMeetings.id, meetingId))
      .returning();

    const changeParts: string[] = [];
    if (dto.status && dto.status !== existing.status) {
      changeParts.push(`Estado: ${MEETING_STATUS_LABELS[nextStatus]}.`);
    }
    if (dto.scheduledAt && nextScheduledAt.getTime() !== existing.scheduledAt.getTime()) {
      changeParts.push(
        `Nueva fecha: ${nextScheduledAt.toLocaleString('es-CO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })} (${nextDurationMinutes} min).`,
      );
    }
    if (dto.meetingUrl !== undefined && updated.meetingUrl !== existing.meetingUrl) {
      changeParts.push(
        updated.meetingUrl
          ? `Enlace de ${platformLabel ?? 'videollamada'} ${existing.meetingUrl ? 'actualizado' : 'agregado'}.`
          : 'Enlace de videollamada removido.',
      );
    }
    if (changeParts.length === 0) {
      changeParts.push(`Estado actual: ${MEETING_STATUS_LABELS[nextStatus]}.`);
    }
    if (updated.notes) {
      changeParts.push(`Nota: ${updated.notes}`);
    }

    await this.addNotification({
      processId: existing.processId,
      type: 'MEETING',
      title: `Actualización de reunión: ${existing.title}`,
      message: changeParts.join(' '),
      metadata: {
        meetingId: updated.id,
        status: updated.status,
        meetingUrl: updated.meetingUrl,
      },
    });

    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, existing.processId),
    });
    if (proc) {
      const formattedDate = nextScheduledAt.toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      await this.mailService?.sendCandidateMeetingEmail({
        to: proc.candidateEmail,
        candidateName: proc.candidateName,
        title: updated.title,
        meetingType: updated.meetingType,
        scheduledAtLabel: `${formattedDate} (${nextDurationMinutes} min)`,
        statusLabel: MEETING_STATUS_LABELS[nextStatus],
        meetingUrl: updated.meetingUrl,
        location: updated.location,
        interviewerName: updated.interviewerName,
        notes: updated.notes,
        isUpdate: true,
      });

      if (dto.interviewerEmail && updated.interviewerEmail) {
        const webUrl = resolveFrontendOrigin({
          configuredWebUrl: this.config.get<string>('WEB_URL'),
          requestOrigin,
          nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
        });
        await this.mailService?.sendInterviewerScheduledEmail({
          to: updated.interviewerEmail,
          interviewerName: updated.interviewerName,
          candidateName: proc.candidateName,
          appliedRole: proc.appliedRole,
          title: updated.title,
          meetingType: updated.meetingType,
          scheduledAtLabel: formattedDate,
          durationMinutes: nextDurationMinutes,
          meetingUrl: updated.meetingUrl,
          location: updated.location,
          dashboardUrl: `${webUrl}/dashboard/entrevistas`,
        });
      }
    }

    await this.auditService.record({
      actorId,
      action: 'CANDIDATE_MEETING_UPDATED',
      entity: 'candidate_meetings',
      entityId: meetingId,
      oldValues: {
        status: existing.status,
        scheduledAt: existing.scheduledAt,
        meetingUrl: existing.meetingUrl,
        location: existing.location,
      },
      newValues: {
        status: updated.status,
        scheduledAt: updated.scheduledAt,
        meetingUrl: updated.meetingUrl,
        location: updated.location,
      },
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
        habeasDataAcceptedAt: proc.habeasDataAcceptedAt ?? null,
        habeasDataPolicyVersion: proc.habeasDataPolicyVersion ?? null,
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

  async acceptPublicConsent(token: string, now: Date = new Date()) {
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

    const acceptedAt = proc.habeasDataAcceptedAt ?? now;
    const policyVersion = proc.habeasDataPolicyVersion ?? HABEAS_DATA_POLICY_VERSION;

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({
        habeasDataAcceptedAt: acceptedAt,
        habeasDataPolicyVersion: policyVersion,
        updatedAt: now,
      })
      .where(eq(candidateProcesses.id, proc.id))
      .returning();

    if (!proc.habeasDataAcceptedAt) {
      await this.auditService.record({
        actorId: proc.candidateEmail,
        action: 'CANDIDATE_DATA_CONSENT_ACCEPTED',
        entity: 'candidate_processes',
        entityId: proc.id,
        newValues: {
          policyVersion,
          acceptedAt: acceptedAt.toISOString(),
        },
      });
    }

    return {
      accepted: true,
      habeasDataAcceptedAt: updated.habeasDataAcceptedAt,
      habeasDataPolicyVersion: updated.habeasDataPolicyVersion,
    };
  }

  async uploadCandidateCv(
    token: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    now: Date = new Date(),
    options?: { acceptConsent?: boolean },
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

    if (!proc.habeasDataAcceptedAt && !options?.acceptConsent) {
      throw new BadRequestException(
        'Debes aceptar primero la autorización de tratamiento de datos (Ley 1581) antes de subir tu hoja de vida.',
      );
    }

    const fileName = decodeUploadedFileName(file.originalname);
    this.storageService.validateFile?.({
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName,
      allowedMimeTypes: ALLOWED_CV_MIME_TYPES,
    });

    const uploaded = await this.storageService.uploadObject({
      folder: `candidates/${proc.id}/cv`,
      fileName,
      contentType: file.mimetype || 'application/pdf',
      body: file.buffer,
    });

    if (proc.cvS3Key && proc.cvS3Key !== uploaded.s3Key) {
      await this.storageService.deleteObject?.(proc.cvS3Key);
    }

    const nextStage: CandidateStage =
      proc.stage === 'REGISTERED' ? 'CV_UPLOADED' : proc.stage;

    const [updated] = await this.database.db
      .update(candidateProcesses)
      .set({
        cvFileName: fileName,
        cvMimeType: uploaded.mimeType,
        cvFileSize: uploaded.fileSize,
        cvS3Key: uploaded.s3Key,
        cvS3Url: uploaded.publicUrl,
        cvUploadedAt: now,
        habeasDataAcceptedAt: proc.habeasDataAcceptedAt ?? now,
        habeasDataPolicyVersion: proc.habeasDataPolicyVersion ?? HABEAS_DATA_POLICY_VERSION,
        stage: nextStage,
        updatedAt: now,
      })
      .where(eq(candidateProcesses.id, proc.id))
      .returning();

    await this.addNotification({
      processId: proc.id,
      type: 'CV_UPLOADED',
      title: proc.cvS3Key ? 'Hoja de vida actualizada' : 'Hoja de vida recibida',
      message: `Se guardó el archivo "${fileName}" en Supabase Storage para el proceso de selección.`,
    });

    await this.auditService.record({
      actorId: proc.candidateEmail,
      action: 'CANDIDATE_CV_UPLOADED',
      entity: 'candidate_processes',
      entityId: proc.id,
      newValues: { fileName, s3Key: uploaded.s3Key },
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

    return this.streamStoredCv(proc);
  }

  async getInternalCvContent(processId: string) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc || !proc.cvS3Key) {
      throw new NotFoundException('Hoja de vida no encontrada para este candidato.');
    }
    return this.streamStoredCv(proc);
  }

  private async streamStoredCv(proc: {
    cvS3Key: string | null;
    cvS3Url?: string | null;
    cvFileName: string | null;
    cvMimeType: string | null;
  }) {
    if (!proc.cvS3Key) {
      throw new NotFoundException('Hoja de vida no encontrada para este candidato.');
    }
    const { buffer, contentType } = await this.storageService.getObjectBuffer(proc.cvS3Key, {
      sourceUrl: proc.cvS3Url,
    });
    return {
      buffer,
      fileName: decodeUploadedFileName(proc.cvFileName ?? 'hoja-de-vida.pdf'),
      mimeType: proc.cvMimeType ?? contentType ?? 'application/pdf',
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

  private formatEvaluation<
    T extends {
      overallScoreScaled100: number;
      recommendation: keyof typeof EVALUATION_RECOMMENDATION_LABELS;
    },
  >(row: T) {
    const overallScore = Number((row.overallScoreScaled100 / 100).toFixed(2));
    const percentageScore = Math.round((row.overallScoreScaled100 / 500) * 100);
    return {
      ...row,
      overallScore,
      percentageScore,
      recommendationLabel: EVALUATION_RECOMMENDATION_LABELS[row.recommendation],
    };
  }

  private buildEvaluationSummary(
    evals: Array<{
      overallScoreScaled100: number;
      recommendation: keyof typeof EVALUATION_RECOMMENDATION_LABELS;
    }>,
  ) {
    if (!evals || evals.length === 0) {
      return {
        count: 0,
        averageScore: null as number | null,
        averagePercentage: null as number | null,
        latestRecommendation: null as keyof typeof EVALUATION_RECOMMENDATION_LABELS | null,
        latestRecommendationLabel: null as string | null,
      };
    }

    const avgScaled =
      evals.reduce((acc, e) => acc + e.overallScoreScaled100, 0) / evals.length;
    const latest = evals[0];
    return {
      count: evals.length,
      averageScore: Number((avgScaled / 100).toFixed(2)),
      averagePercentage: Math.round((avgScaled / 500) * 100),
      latestRecommendation: latest.recommendation,
      latestRecommendationLabel: EVALUATION_RECOMMENDATION_LABELS[latest.recommendation],
    };
  }

  async getInterviewsAgenda(user: AuthenticatedUserProfile, requestOrigin?: string) {
    const allMeetings = await this.database.db.query.candidateMeetings.findMany({
      with: {
        process: {
          columns: {
            id: true,
            accessToken: true,
            candidateName: true,
            candidateEmail: true,
            nationalId: true,
            appliedRole: true,
            stage: true,
            cvS3Key: true,
            cvFileName: true,
          },
        },
      },
      orderBy: [asc(candidateMeetings.scheduledAt)],
    });

    const allEvaluations = await this.database.db.query.candidateCompetencyEvaluations.findMany({
      orderBy: [desc(candidateCompetencyEvaluations.createdAt)],
    });

    const allProcesses = await this.database.db.query.candidateProcesses.findMany({
      orderBy: [desc(candidateProcesses.updatedAt)],
    });

    const formattedEvaluations = allEvaluations.map((ev) => this.formatEvaluation(ev));
    const evalsByProcess = new Map<string, typeof formattedEvaluations>();
    for (const formatted of formattedEvaluations) {
      const list = evalsByProcess.get(formatted.processId) ?? [];
      list.push(formatted);
      evalsByProcess.set(formatted.processId, list);
    }

    const userEmail = user.email.trim().toLowerCase();
    const visibleMeetings = allMeetings.filter((m) => {
      if (user.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
        const areaMatch = canAccessOperationalArea(
          user.operationalArea,
          m.operationalArea ?? null,
        );
        const interviewerMatch = m.interviewerEmail?.trim().toLowerCase() === userEmail;
        return areaMatch || interviewerMatch;
      }
      return true;
    });

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const enrichedMeetings = visibleMeetings.map((m) => {
      const procEvals = evalsByProcess.get(m.processId) ?? [];
      const meetingEval = procEvals.find((e) => e.meetingId === m.id) ?? null;
      return {
        ...m,
        evaluation: meetingEval,
        processEvaluationSummary: this.buildEvaluationSummary(procEvals),
      };
    });

    const candidates = allProcesses
      .filter((p) => p.stage !== 'REJECTED')
      .map((proc) => {
        const procEvals = evalsByProcess.get(proc.id) ?? [];
        const urls = this.buildUrls(proc.accessToken, proc.preOnboardingToken, requestOrigin);
        return {
          id: proc.id,
          candidateName: proc.candidateName,
          candidateEmail: proc.candidateEmail,
          nationalId: proc.nationalId,
          appliedRole: proc.appliedRole,
          stage: proc.stage,
          stageLabel: CANDIDATE_STAGE_LABELS[proc.stage],
          portalUrl: urls.portalUrl,
          hasCv: Boolean(proc.cvS3Key),
          evaluationSummary: this.buildEvaluationSummary(procEvals),
          evaluations: procEvals,
        };
      });

    const kpis = {
      totalInterviews: enrichedMeetings.length,
      scheduledTodayCount: enrichedMeetings.filter(
        (m) =>
          m.status !== 'CANCELLED' &&
          new Date(m.scheduledAt).toISOString().slice(0, 10) === todayKey,
      ).length,
      upcomingCount: enrichedMeetings.filter(
        (m) =>
          m.status !== 'CANCELLED' &&
          m.status !== 'COMPLETED' &&
          new Date(m.scheduledAt).getTime() >= now.getTime() - 3600_000,
      ).length,
      completedCount: enrichedMeetings.filter((m) => m.status === 'COMPLETED').length,
      evaluationsCount: allEvaluations.length,
    };

    return {
      kpis,
      meetings: enrichedMeetings,
      candidates,
    };
  }

  async listEvaluations(processId: string, user?: AuthenticatedUserProfile) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc) {
      throw new NotFoundException(`Proceso de candidato ${processId} no encontrado`);
    }

    const rows = await this.database.db.query.candidateCompetencyEvaluations.findMany({
      where: eq(candidateCompetencyEvaluations.processId, processId),
      with: {
        meeting: {
          columns: { id: true, title: true, meetingType: true, scheduledAt: true },
        },
      },
      orderBy: [desc(candidateCompetencyEvaluations.createdAt)],
    });

    const scoped =
      user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL'
        ? rows.filter(
          (r) =>
            canAccessOperationalArea(user.operationalArea, r.operationalArea ?? null) ||
            r.evaluatorEmail.toLowerCase() === user.email.toLowerCase(),
        )
        : rows;

    const items = scoped.map((r) => this.formatEvaluation(r));
    return {
      processId,
      candidateName: proc.candidateName,
      appliedRole: proc.appliedRole,
      summary: this.buildEvaluationSummary(items),
      items,
    };
  }

  async createEvaluation(
    processId: string,
    dto: CreateCompetencyEvaluationDto,
    user: AuthenticatedUserProfile,
  ) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.id, processId),
    });
    if (!proc) {
      throw new NotFoundException(`Proceso de candidato ${processId} no encontrado`);
    }

    let meeting:
      | {
        id: string;
        processId: string;
        title: string;
        meetingType: string;
        operationalArea: OperationalArea | null;
      }
      | undefined;

    if (dto.meetingId) {
      meeting = await this.database.db.query.candidateMeetings.findFirst({
        where: eq(candidateMeetings.id, dto.meetingId),
      });
      if (!meeting || meeting.processId !== processId) {
        throw new BadRequestException(
          'La entrevista seleccionada no corresponde a este candidato.',
        );
      }
    }

    const scoreSummary = computeCompetencyScoreSummary(dto.scores);
    const derivedArea: OperationalArea | null =
      dto.operationalArea ??
      meeting?.operationalArea ??
      (user.operationalArea && user.operationalArea !== 'ALL'
        ? (user.operationalArea as OperationalArea)
        : null);

    const [created] = await this.database.db
      .insert(candidateCompetencyEvaluations)
      .values({
        processId,
        meetingId: dto.meetingId ?? null,
        evaluatorName: user.fullName,
        evaluatorEmail: user.email,
        evaluatorRole: user.role,
        stageLabel:
          dto.stageLabel?.trim() || meeting?.meetingType || meeting?.title || 'Entrevista TH',
        operationalArea: derivedArea,
        scores: dto.scores.map((s) => ({
          key: s.key.trim(),
          label: s.label.trim(),
          score: Number(s.score),
          weight: s.weight ?? 1,
          ...(s.observation?.trim() ? { observation: s.observation.trim() } : {}),
        })),
        overallScoreScaled100: scoreSummary.overallScoreScaled100,
        recommendation: dto.recommendation,
        strengths: dto.strengths?.trim() || null,
        improvementAreas: dto.improvementAreas?.trim() || null,
        summaryNotes: dto.summaryNotes?.trim() || null,
      })
      .returning();

    if (dto.meetingId && dto.markMeetingCompleted !== false) {
      await this.database.db
        .update(candidateMeetings)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(candidateMeetings.id, dto.meetingId));
    }

    await this.auditService.record({
      actorId: user.email,
      action: 'CANDIDATE_COMPETENCY_EVALUATED',
      entity: 'candidate_competency_evaluations',
      entityId: created.id,
      newValues: {
        processId,
        meetingId: created.meetingId,
        overallScore: scoreSummary.overallScore,
        recommendation: created.recommendation,
      },
    });

    return this.formatEvaluation(created);
  }

  private buildIcsFromMeeting(meeting: {
    id: string;
    title: string;
    meetingType: string;
    scheduledAt: Date;
    durationMinutes?: number | null;
    meetingUrl?: string | null;
    location?: string | null;
    interviewerName?: string | null;
    notes?: string | null;
    process?: {
      candidateName: string;
      appliedRole?: string | null;
    } | null;
  }) {
    const start = new Date(meeting.scheduledAt);
    const durationMin = meeting.durationMinutes ?? 45;
    const end = new Date(start.getTime() + durationMin * 60_000);

    const toIcsDate = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const esc = (s: string) =>
      s
        .replaceAll('\\', '\\\\')
        .replaceAll('\r\n', '\\n')
        .replaceAll('\n', '\\n')
        .replaceAll(';', '\\;')
        .replaceAll(',', '\\,');

    const candidateName = meeting.process?.candidateName ?? 'Candidato';
    const summary = `${meeting.title} · ${candidateName}`;
    const descParts = [
      `Tipo: ${meeting.meetingType}`,
      meeting.process?.appliedRole ? `Cargo: ${meeting.process.appliedRole}` : '',
      meeting.interviewerName ? `Entrevistador: ${meeting.interviewerName}` : '',
      meeting.meetingUrl ? `Enlace videollamada: ${meeting.meetingUrl}` : '',
      meeting.notes ? `Notas: ${meeting.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Alliance HCM//Entrevistas y Competencias//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:alliance-hcm-meeting-${meeting.id}@alliance.com.co`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${esc(summary)}`,
      meeting.location ? `LOCATION:${esc(meeting.location)}` : '',
      `DESCRIPTION:${esc(descParts)}`,
      meeting.meetingUrl ? `URL:${meeting.meetingUrl}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);

    return {
      fileName: `entrevista-${meeting.id.slice(0, 8)}.ics`,
      content: `${lines.join('\r\n')}\r\n`,
    };
  }

  async getMeetingIcs(meetingId: string) {
    const meeting = await this.database.db.query.candidateMeetings.findFirst({
      where: eq(candidateMeetings.id, meetingId),
      with: {
        process: {
          columns: { candidateName: true, appliedRole: true },
        },
      },
    });
    if (!meeting) {
      throw new NotFoundException(`Entrevista ${meetingId} no encontrada.`);
    }
    return this.buildIcsFromMeeting(meeting);
  }

  async getPublicMeetingIcs(token: string, meetingId: string, now: Date = new Date()) {
    const proc = await this.database.db.query.candidateProcesses.findFirst({
      where: eq(candidateProcesses.accessToken, token),
    });
    if (!proc) {
      throw new NotFoundException('Portal de candidato no encontrado.');
    }

    const visibility = computeCandidatePortalVisibility(proc.hiringApprovedAt, now);
    if (visibility.isExpired) {
      throw new ForbiddenException('El acceso temporal de 15 días ha expirado.');
    }

    const meeting = await this.database.db.query.candidateMeetings.findFirst({
      where: eq(candidateMeetings.id, meetingId),
    });
    if (!meeting || meeting.processId !== proc.id) {
      throw new NotFoundException('Entrevista no encontrada en este portal.');
    }

    return this.buildIcsFromMeeting({
      ...meeting,
      process: {
        candidateName: proc.candidateName,
        appliedRole: proc.appliedRole,
      },
    });
  }
}
