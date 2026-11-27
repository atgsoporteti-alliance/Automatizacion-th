import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq } from 'drizzle-orm';
import { employees, onboardingOffboardingWorkflows } from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  canApproveDsiGate,
  OperationalArea,
  sanitizeEmployeeForRole,
  WorkflowStep,
  WorkflowType,
} from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import { CandidatePortalService } from '../candidate-portal/candidate-portal.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import {
  ApproveDsiWorkflowDto,
  ApproveThWorkflowDto,
  CancelNoShowDto,
  ReturnToCandidateDto,
  TriggerHelpdeskDto,
  UpdateItStatusDto,
} from './dto/workflow-actions.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly ruleEngine: RuleEngineService,
    private readonly helpdeskService: HelpdeskService,
    @Optional() private readonly jwtService?: JwtService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly candidatePortalService?: CandidatePortalService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  async findAll(
    filters?: {
      flowType?: WorkflowType;
      currentStep?: WorkflowStep;
      operationalArea?: OperationalArea;
    },
    user?: AuthenticatedUserProfile,
  ) {
    const whereClauses = [];
    if (filters?.flowType) {
      whereClauses.push(eq(onboardingOffboardingWorkflows.flowType, filters.flowType));
    }
    if (filters?.currentStep) {
      whereClauses.push(eq(onboardingOffboardingWorkflows.currentStep, filters.currentStep));
    }

    const rows = await this.database.db.query.onboardingOffboardingWorkflows.findMany({
      where: whereClauses.length > 0 ? and(...whereClauses) : undefined,
      with: {
        employee: {
          with: {
            documents: true,
            consentSignatures: true,
          },
        },
        clearances: true,
      },
      orderBy: [desc(onboardingOffboardingWorkflows.updatedAt)],
    });

    const now = Date.now();
    let enriched = rows.map((wf) => ({
      ...wf,
      employee: user ? sanitizeEmployeeForRole(wf.employee, user.role) : wf.employee,
      isOutOfSla:
        wf.isOutOfSla ||
        (Boolean(wf.slaDeadline) &&
          wf.currentStep !== 'COMPLETED' &&
          wf.currentStep !== 'CANCELLED_NO_SHOW' &&
          new Date(wf.slaDeadline!).getTime() < now),
    }));

    if (user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
      enriched = enriched.filter((wf) =>
        canAccessOperationalArea(user.operationalArea, wf.employee.operationalArea),
      );
    }

    if (filters?.operationalArea) {
      return enriched.filter((wf) => wf.employee.operationalArea === filters.operationalArea);
    }

    return enriched;
  }

  async getKpis(user?: AuthenticatedUserProfile) {
    const all = await this.findAll(undefined, user);

    const activeOnboardings = all.filter(
      (wf) =>
        wf.flowType === 'ONBOARDING' &&
        wf.currentStep !== 'COMPLETED' &&
        wf.currentStep !== 'CANCELLED_NO_SHOW',
    ).length;

    const pendingApprovals = all.filter(
      (wf) => wf.currentStep === 'TH_REVIEW' || wf.currentStep === 'DSI_LEADER_APPROVAL',
    ).length;

    const outOfSlaAlerts = all.filter((wf) => wf.isOutOfSla).length;

    const pendingOffboardingClearances = all.filter(
      (wf) => wf.flowType === 'OFFBOARDING' && wf.currentStep !== 'COMPLETED',
    ).length;

    return {
      activeOnboardings,
      pendingApprovals,
      outOfSlaAlerts,
      pendingOffboardingClearances,
      totalWorkflows: all.length,
    };
  }

  async approveByTh(
    workflowId: string,
    dto: ApproveThWorkflowDto,
    actorId = 'th-analyst',
    requestOrigin?: string,
  ) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} no encontrado`);
    }

    const evaluation = this.ruleEngine.evaluateOperationalArea(
      dto.operationalArea,
      workflow.employee.preferredNameCredentials,
    );

    const corporateEmail = dto.corporateEmail ?? evaluation.suggestedCorporateEmail;

    // Actualizar datos organizacionales del colaborador
    await this.database.db
      .update(employees)
      .set({
        operationalArea: dto.operationalArea,
        jobTitle: dto.jobTitle,
        costCenter: dto.costCenter,
        reportingManagerEmail: dto.reportingManagerEmail,
        hireDate: dto.hireDate,
        corporateEmail,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, workflow.employeeId));

    const provisioningPayload = {
      area: evaluation.area,
      template: evaluation.rule.helpdeskTemplate,
      category: evaluation.rule.helpdeskCategory,
      items: evaluation.provisioningItems,
      corporateEmail,
    };

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        currentStep: evaluation.nextStepAfterThApproval,
        slaDeadline: evaluation.slaDeadline,
        isOutOfSla: false,
        provisioningPayload,
        notes:
          dto.notes ??
          (evaluation.shouldDispatchHelpdeskImmediately
            ? `Aprobado por TH para área ${dto.operationalArea}. Ticket encolado a Helpdesk.`
            : 'Aprobado por TH. En espera de aprobación obligatoria del Líder DSI.'),
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, workflowId))
      .returning();

    let dispatchResult: unknown = null;
    if (evaluation.shouldDispatchHelpdeskImmediately) {
      dispatchResult = await this.helpdeskService.enqueueProvisioning({
        workflowId: workflow.id,
        employeeId: workflow.employeeId,
        employeeFullName: workflow.employee.fullName,
        nationalId: workflow.employee.nationalId,
        corporateEmail,
        operationalArea: dto.operationalArea,
        flowType: 'ONBOARDING',
        urgency: workflow.urgency,
        template: evaluation.rule.helpdeskTemplate,
        category: evaluation.rule.helpdeskCategory,
        provisioningItems: evaluation.provisioningItems,
        notes: dto.notes,
        requestOrigin,
      });
    }

    await this.auditService.record({
      actorId,
      action: 'TH_APPROVED_ONBOARDING',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflowId,
      oldValues: { currentStep: workflow.currentStep },
      newValues: {
        currentStep: updatedWorkflow.currentStep,
        operationalArea: dto.operationalArea,
        requiresDsiLeaderApproval: !evaluation.shouldDispatchHelpdeskImmediately,
      },
    });

    await this.candidatePortalService?.markHiringApproved({
      workflowId: workflow.id,
      employeeId: workflow.employeeId,
      candidateEmail: workflow.employee.personalEmail,
      nationalId: workflow.employee.nationalId,
      actorId,
    });

    return {
      workflow: updatedWorkflow,
      ruleEvaluation: evaluation,
      dispatchResult,
    };
  }

  async approveByDsiLeader(
    workflowId: string,
    dto: ApproveDsiWorkflowDto,
    user?: AuthenticatedUserProfile,
    requestOrigin?: string,
  ) {
    if (user && !canApproveDsiGate(user)) {
      throw new ForbiddenException(
        'Solo el Líder de DSI o un Super Administrador puede aprobar la puerta DSI_LEADER_APPROVAL.',
      );
    }

    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} no encontrado`);
    }

    if (workflow.currentStep !== 'DSI_LEADER_APPROVAL') {
      throw new BadRequestException(
        `El workflow no está esperando aprobación de Líder DSI (estado actual: ${workflow.currentStep})`,
      );
    }

    const evaluation = this.ruleEngine.evaluateOperationalArea(
      'DSI',
      workflow.employee.preferredNameCredentials,
    );

    const corporateEmail =
      workflow.employee.corporateEmail ?? evaluation.suggestedCorporateEmail;

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        currentStep: 'HELPDESK_TICKET_CREATED',
        dsiApprovedBy: dto.approverEmail,
        dsiApprovedAt: new Date(),
        notes: dto.notes ?? `Aprobado por Líder DSI (${dto.approverEmail}).`,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, workflowId))
      .returning();

    const dispatchResult = await this.helpdeskService.enqueueProvisioning({
      workflowId: workflow.id,
      employeeId: workflow.employeeId,
      employeeFullName: workflow.employee.fullName,
      nationalId: workflow.employee.nationalId,
      corporateEmail,
      operationalArea: 'DSI',
      flowType: 'ONBOARDING',
      urgency: workflow.urgency,
      template: evaluation.rule.helpdeskTemplate,
      category: evaluation.rule.helpdeskCategory,
      provisioningItems: evaluation.provisioningItems,
      notes: dto.notes,
      requestOrigin,
    });

    await this.auditService.record({
      actorId: dto.approverEmail,
      action: 'DSI_LEADER_APPROVED',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflowId,
      oldValues: { currentStep: 'DSI_LEADER_APPROVAL' },
      newValues: { currentStep: 'HELPDESK_TICKET_CREATED', dsiApprovedBy: dto.approverEmail },
    });

    await this.candidatePortalService?.syncWorkflowModification({
      workflowId: workflow.id,
      employeeId: workflow.employeeId,
      candidateEmail: workflow.employee.personalEmail,
      nationalId: workflow.employee.nationalId,
      type: 'STAGE_CHANGE',
      title: 'Aprobación técnica Líder DSI completada',
      message: 'El Líder DSI aprobó tu perfil técnico y se generó el ticket hacia Helpdesk IT.',
      step: 'HELPDESK_TICKET_CREATED',
    });

    return {
      workflow: updatedWorkflow,
      dispatchResult,
    };
  }

  async cancelNoShow(workflowId: string, dto: CancelNoShowDto) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} no encontrado`);
    }

    const reason = dto.reason ?? 'Candidato reportado como No-Show el Día 1.';

    if (workflow.helpdeskTicketId) {
      await this.helpdeskService.cancelTicket(workflow.helpdeskTicketId, reason);
    }

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        currentStep: 'CANCELLED_NO_SHOW',
        helpdeskTicketStatus: workflow.helpdeskTicketId ? 'CANCELLED' : null,
        isOutOfSla: false,
        notes: reason,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, workflowId))
      .returning();

    await this.database.db
      .update(employees)
      .set({
        status: 'NO_SHOW',
        updatedAt: new Date(),
      })
      .where(eq(employees.id, workflow.employeeId));

    await this.auditService.record({
      actorId: dto.actorEmail ?? 'th-analyst',
      action: 'WORKFLOW_CANCELLED_NO_SHOW',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflowId,
      oldValues: { currentStep: workflow.currentStep, employeeStatus: workflow.employee.status },
      newValues: { currentStep: 'CANCELLED_NO_SHOW', employeeStatus: 'NO_SHOW', reason },
    });

    return updatedWorkflow;
  }

  async returnToCandidate(
    workflowId: string,
    dto: ReturnToCandidateDto,
    actorId = 'th-analyst',
    requestOrigin?: string,
  ) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} no encontrado`);
    }

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        currentStep: 'CANDIDATE_PENDING',
        isOutOfSla: false,
        notes: dto.reason,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, workflowId))
      .returning();

    const token = this.jwtService
      ? await this.jwtService.signAsync(
          {
            sub: workflow.employee.personalEmail,
            name: workflow.employee.fullName,
            nationalId: workflow.employee.nationalId,
            employeeId: workflow.employeeId,
            workflowId: workflow.id,
            correctionNote: dto.reason,
            purpose: 'PRE_ONBOARDING',
          },
          {
            secret:
              this.config?.get<string>('JWT_SECRET', 'alliance-hcm-dev-jwt-secret') ??
              'alliance-hcm-dev-jwt-secret',
            expiresIn: '72h',
          },
        )
      : '';

    const webUrl = resolveFrontendOrigin({
      configuredWebUrl: this.config?.get<string>('WEB_URL'),
      requestOrigin,
      nodeEnv: this.config?.get<string>('NODE_ENV', 'development'),
    });

    const correctionMagicLink = `${webUrl}/pre-ingreso/${token}`;

    await this.auditService.record({
      actorId,
      action: 'TH_RETURNED_PRE_ONBOARDING',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflowId,
      oldValues: { currentStep: workflow.currentStep },
      newValues: { currentStep: 'CANDIDATE_PENDING', reason: dto.reason },
    });

    await this.candidatePortalService?.syncWorkflowModification({
      workflowId,
      employeeId: workflow.employeeId,
      candidateEmail: workflow.employee.personalEmail,
      nationalId: workflow.employee.nationalId,
      type: 'MODIFICATION',
      title: 'Talento Humano devolvió el Pre-Registro para corrección',
      message: dto.reason,
      correctionToken: token || undefined,
      step: 'CANDIDATE_PENDING',
    });

    const emailRes = await this.mailService?.sendPreOnboardingReturnEmail({
      to: workflow.employee.personalEmail,
      candidateName: workflow.employee.fullName,
      correctionNote: dto.reason,
      correctionMagicLink,
    });

    return {
      workflow: updatedWorkflow,
      correctionMagicLink,
      correctionNote: dto.reason,
      emailSent: Boolean(emailRes?.sent),
    };
  }

  async triggerHelpdeskTicket(
    workflowId: string,
    user: AuthenticatedUserProfile,
    dto?: TriggerHelpdeskDto,
    requestOrigin?: string,
  ) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} no encontrado`);
    }

    if (workflow.currentStep === 'CANCELLED_NO_SHOW') {
      throw new BadRequestException('No es posible generar un ticket sobre un workflow cancelado.');
    }
    if (workflow.currentStep === 'CANDIDATE_PENDING') {
      throw new BadRequestException(
        'El colaborador aún no ha enviado su formulario de Pre-Ingreso.',
      );
    }
    if (workflow.flowType === 'ONBOARDING' && workflow.currentStep === 'TH_REVIEW') {
      throw new BadRequestException(
        'Talento Humano debe aprobar primero el área operativa antes de generar el ticket Helpdesk.',
      );
    }
    if (workflow.currentStep === 'DSI_LEADER_APPROVAL') {
      throw new BadRequestException(
        'Por regla del área DSI, primero debe aprobarse la puerta DSI_LEADER_APPROVAL antes de generar el ticket Helpdesk.',
      );
    }

    const area: OperationalArea = workflow.employee.operationalArea ?? 'CUSTOMER';
    const noteText = dto?.notes?.trim() || workflow.notes || undefined;

    const payload =
      workflow.flowType === 'OFFBOARDING'
        ? {
            workflowId: workflow.id,
            employeeId: workflow.employeeId,
            employeeFullName: workflow.employee.fullName,
            nationalId: workflow.employee.nationalId,
            corporateEmail: workflow.employee.corporateEmail ?? workflow.employee.personalEmail,
            operationalArea: area,
            flowType: 'OFFBOARDING' as const,
            urgency: workflow.urgency,
            template:
              workflow.urgency === 'CRITICAL_IMMEDIATE'
                ? 'TPL_OFFB_CRITICAL_IMMEDIATE'
                : 'TPL_OFFB_STANDARD_CUTOFF',
            category:
              workflow.urgency === 'CRITICAL_IMMEDIATE'
                ? 'Offboarding - Immediate Access Revocation'
                : 'Offboarding - Scheduled Access Revocation',
            provisioningItems: [
              'Revocación de sesiones corporativas (Correo, SSO, VPN)',
              'Bloqueo de accesos Git, CRM y licencias asignadas',
              'Entrega / inventario de hardware corporativo',
            ],
            notes: noteText,
            requestOrigin,
          }
        : (() => {
            const evaluation = this.ruleEngine.evaluateOperationalArea(
              area,
              workflow.employee.preferredNameCredentials,
            );
            const existingPayload = workflow.provisioningPayload as
              | { items?: string[] }
              | null
              | undefined;
            return {
              workflowId: workflow.id,
              employeeId: workflow.employeeId,
              employeeFullName: workflow.employee.fullName,
              nationalId: workflow.employee.nationalId,
              corporateEmail: workflow.employee.corporateEmail ?? evaluation.suggestedCorporateEmail,
              operationalArea: area,
              flowType: 'ONBOARDING' as const,
              urgency: workflow.urgency,
              template: evaluation.rule.helpdeskTemplate,
              category: evaluation.rule.helpdeskCategory,
              provisioningItems:
                existingPayload?.items && existingPayload.items.length > 0
                  ? existingPayload.items
                  : evaluation.provisioningItems,
              notes: noteText,
              requestOrigin,
            };
          })();

    const result = await this.helpdeskService.dispatchDirectTicket({
      payload,
      existingTicketId: workflow.helpdeskTicketId,
      currentStep: workflow.currentStep,
      actorEmail: user.email,
    });

    if (workflow.flowType === 'ONBOARDING') {
      await this.candidatePortalService?.syncWorkflowModification({
        workflowId: workflow.id,
        employeeId: workflow.employeeId,
        candidateEmail: workflow.employee.personalEmail,
        nationalId: workflow.employee.nationalId,
        type: 'STAGE_CHANGE',
        title: `Ticket Helpdesk IT ${result.ticketId} ${result.isResend ? 'notificado' : 'generado'}`,
        message: `Se generó el ticket ${result.ticketId} en base de datos y se envió alerta por correo a Mesa de Ayuda IT.`,
        step: result.workflow?.currentStep ?? 'IT_PROVISIONING',
      });
    }

    return result;
  }

  async updateItStatus(
    workflowId: string,
    user: AuthenticatedUserProfile,
    dto: UpdateItStatusDto,
  ) {
    return this.helpdeskService.updateStatusByWorkflowId({
      workflowId,
      status: dto.status,
      actorEmail: user.email,
      corporateEmailAssigned: dto.corporateEmailAssigned,
      notes: dto.notes,
    });
  }
}
