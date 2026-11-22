import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { employees, onboardingOffboardingWorkflows } from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  OperationalArea,
  sanitizeEmployeeForRole,
  WorkflowStep,
  WorkflowType,
} from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import {
  ApproveDsiWorkflowDto,
  ApproveThWorkflowDto,
  CancelNoShowDto,
} from './dto/workflow-actions.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly ruleEngine: RuleEngineService,
    private readonly helpdeskService: HelpdeskService,
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

  async approveByTh(workflowId: string, dto: ApproveThWorkflowDto, actorId = 'th-analyst') {
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
  ) {
    if (user && user.role !== 'SUPER_ADMIN' && user.operationalArea !== 'DSI') {
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
    });

    await this.auditService.record({
      actorId: dto.approverEmail,
      action: 'DSI_LEADER_APPROVED',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflowId,
      oldValues: { currentStep: 'DSI_LEADER_APPROVAL' },
      newValues: { currentStep: 'HELPDESK_TICKET_CREATED', dsiApprovedBy: dto.approverEmail },
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
}
