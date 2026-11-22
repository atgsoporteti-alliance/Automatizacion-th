import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { employees, onboardingOffboardingWorkflows } from '@alliance-hcm/database';
import { WorkflowStep } from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  HELPDESK_ADAPTER_TOKEN,
  HelpdeskAdapter,
  HelpdeskTicketPayload,
} from './adapters/helpdesk-adapter.interface';
import { HELPDESK_QUEUE_NAME } from './helpdesk.processor';
import { HelpdeskWebhookDto } from './dto/helpdesk-webhook.dto';

@Injectable()
export class HelpdeskService {
  private readonly logger = new Logger(HelpdeskService.name);

  constructor(
    @InjectQueue(HELPDESK_QUEUE_NAME) private readonly queue: Queue<HelpdeskTicketPayload>,
    @Inject(HELPDESK_ADAPTER_TOKEN) private readonly adapter: HelpdeskAdapter,
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async enqueueProvisioning(payload: HelpdeskTicketPayload): Promise<{
    mode: 'QUEUED' | 'DIRECT_FALLBACK';
    ticketId?: string;
    jobId?: string;
  }> {
    const jobName =
      payload.flowType === 'OFFBOARDING'
        ? 'offboarding-revocation'
        : 'onboarding-provisioning';

    try {
      const job = await this.queue.add(jobName, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
      });
      this.logger.log(`Job encolado en BullMQ (${jobName}) id=${job.id}`);
      return { mode: 'QUEUED', jobId: String(job.id) };
    } catch (error) {
      // Fallback seguro si Redis no está disponible en pruebas locales sin Docker
      this.logger.warn(
        `Redis/BullMQ no disponible (${error instanceof Error ? error.message : String(error)}). Ejecutando adaptador Helpdesk en modo directo.`,
      );
      const ticket = await this.adapter.createTicket(payload);
      await this.database.db
        .update(onboardingOffboardingWorkflows)
        .set({
          helpdeskTicketId: ticket.ticketId,
          helpdeskTicketStatus: ticket.status,
          currentStep: 'IT_PROVISIONING',
          updatedAt: new Date(),
        })
        .where(eq(onboardingOffboardingWorkflows.id, payload.workflowId));

      return { mode: 'DIRECT_FALLBACK', ticketId: ticket.ticketId };
    }
  }

  async cancelTicket(ticketId: string, reason: string) {
    return this.adapter.cancelTicket(ticketId, reason);
  }

  async processWebhook(dto: HelpdeskWebhookDto) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.helpdeskTicketId, dto.ticketId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(
        `No se encontró workflow asociado al ticket Helpdesk ${dto.ticketId}`,
      );
    }

    let nextStep: WorkflowStep = workflow.currentStep;
    if (dto.status === 'IN_PROGRESS' || dto.status === 'OPEN') {
      nextStep = 'IT_PROVISIONING';
    } else if (dto.status === 'RESOLVED' || dto.status === 'CLOSED') {
      nextStep = 'COMPLETED';
    } else if (dto.status === 'CANCELLED') {
      nextStep = 'CANCELLED_NO_SHOW';
    }

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        helpdeskTicketStatus: dto.status,
        currentStep: nextStep,
        notes: dto.notes ?? workflow.notes,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, workflow.id))
      .returning();

    // Actualizar estado del colaborador si se completó el aprovisionamiento de Onboarding
    if (nextStep === 'COMPLETED' && workflow.flowType === 'ONBOARDING') {
      await this.database.db
        .update(employees)
        .set({
          status: 'ACTIVE',
          corporateEmail: dto.corporateEmailAssigned ?? workflow.employee.corporateEmail,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, workflow.employeeId));
    }

    await this.auditService.record({
      actorId: dto.technicianEmail ?? 'servicedesk-webhook',
      action: 'HELPDESK_WEBHOOK_STATUS_UPDATE',
      entity: 'onboarding_offboarding_workflows',
      entityId: workflow.id,
      oldValues: {
        currentStep: workflow.currentStep,
        helpdeskTicketStatus: workflow.helpdeskTicketStatus,
      },
      newValues: {
        currentStep: updatedWorkflow.currentStep,
        helpdeskTicketStatus: updatedWorkflow.helpdeskTicketStatus,
      },
    });

    return {
      workflowId: updatedWorkflow.id,
      ticketId: dto.ticketId,
      helpdeskTicketStatus: updatedWorkflow.helpdeskTicketStatus,
      currentStep: updatedWorkflow.currentStep,
    };
  }
}
