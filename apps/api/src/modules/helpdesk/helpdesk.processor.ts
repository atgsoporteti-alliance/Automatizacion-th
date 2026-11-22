import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { onboardingOffboardingWorkflows } from '@alliance-hcm/database';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  HELPDESK_ADAPTER_TOKEN,
  HelpdeskAdapter,
  HelpdeskTicketPayload,
} from './adapters/helpdesk-adapter.interface';

export const HELPDESK_QUEUE_NAME = 'helpdesk-provisioning';

@Injectable()
@Processor(HELPDESK_QUEUE_NAME)
export class HelpdeskProcessor extends WorkerHost {
  private readonly logger = new Logger(HelpdeskProcessor.name);

  constructor(
    @Inject(HELPDESK_ADAPTER_TOKEN) private readonly adapter: HelpdeskAdapter,
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async process(job: Job<HelpdeskTicketPayload>): Promise<{ ticketId: string; status: string }> {
    this.logger.log(`Procesando job BullMQ [${job.name}] id=${job.id} workflow=${job.data.workflowId}`);

    const ticket = await this.adapter.createTicket(job.data);

    await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        helpdeskTicketId: ticket.ticketId,
        helpdeskTicketStatus: ticket.status,
        currentStep: 'IT_PROVISIONING',
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, job.data.workflowId));

    await this.auditService.record({
      actorId: 'bullmq-helpdesk-worker',
      action: `HELPDESK_TICKET_DISPATCHED_${job.name.toUpperCase()}`,
      entity: 'onboarding_offboarding_workflows',
      entityId: job.data.workflowId,
      newValues: {
        ticketId: ticket.ticketId,
        provider: ticket.provider,
        status: ticket.status,
      },
    });

    return { ticketId: ticket.ticketId, status: ticket.status };
  }
}
