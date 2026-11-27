import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { onboardingOffboardingWorkflows } from '@alliance-hcm/database';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  HELPDESK_ADAPTER_TOKEN,
  HELPDESK_QUEUE_NAME,
  HelpdeskAdapter,
  HelpdeskTicketPayload,
} from './adapters/helpdesk-adapter.interface';
import { HelpdeskService } from './helpdesk.service';

export { HELPDESK_QUEUE_NAME };

@Injectable()
@Processor(HELPDESK_QUEUE_NAME)
export class HelpdeskProcessor extends WorkerHost {
  private readonly logger = new Logger(HelpdeskProcessor.name);

  constructor(
    @Inject(HELPDESK_ADAPTER_TOKEN) private readonly adapter: HelpdeskAdapter,
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly helpdeskService?: HelpdeskService,
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

    const mailSummary = await this.helpdeskService?.notifyItMailbox(ticket.ticketId, job.data);

    await this.auditService.record({
      actorId: 'bullmq-helpdesk-worker',
      action: `HELPDESK_TICKET_DISPATCHED_${job.name.toUpperCase()}`,
      entity: 'onboarding_offboarding_workflows',
      entityId: job.data.workflowId,
      newValues: {
        ticketId: ticket.ticketId,
        provider: ticket.provider,
        status: ticket.status,
        recipients: mailSummary?.recipients ?? [],
        emailsSentCount: mailSummary?.emailsSentCount ?? 0,
      },
    });

    return { ticketId: ticket.ticketId, status: ticket.status };
  }
}
