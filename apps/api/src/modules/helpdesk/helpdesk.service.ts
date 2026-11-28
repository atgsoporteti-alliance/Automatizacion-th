import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { employees, onboardingOffboardingWorkflows, userProfiles } from '@alliance-hcm/database';
import { WorkflowStep } from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import {
  HELPDESK_ADAPTER_TOKEN,
  HELPDESK_QUEUE_NAME,
  HelpdeskAdapter,
  HelpdeskTicketPayload,
} from './adapters/helpdesk-adapter.interface';
import { HelpdeskWebhookDto } from './dto/helpdesk-webhook.dto';

@Injectable()
export class HelpdeskService {
  private readonly logger = new Logger(HelpdeskService.name);

  constructor(
    @InjectQueue(HELPDESK_QUEUE_NAME) private readonly queue: Queue<HelpdeskTicketPayload>,
    @Inject(HELPDESK_ADAPTER_TOKEN) private readonly adapter: HelpdeskAdapter,
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly config?: ConfigService,
  ) { }

  async resolveItRecipients(): Promise<string[]> {
    const rawEnv =
      this.config?.get<string>('HELPDESK_IT_EMAILS') ??
      this.config?.get<string>('HELPDESK_NOTIFY_EMAIL') ??
      '';
    const configuredEmails = rawEnv
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let dbItEmails: string[] = [];
    if (this.database.db?.select) {
      try {
        const rows = await this.database.db
          .select({ email: userProfiles.email })
          .from(userProfiles)
          .where(and(eq(userProfiles.role, 'IT_SUPPORT'), eq(userProfiles.isActive, true)));
        dbItEmails = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
      } catch (err) {
        this.logger.warn(
          `No se pudieron consultar destinatarios IT_SUPPORT en user_profiles: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const recipients = Array.from(new Set([...configuredEmails, ...dbItEmails]));
    if (recipients.length === 0) {
      const smtpFallback =
        this.config?.get<string>('SMTP_USER') ?? this.config?.get<string>('GMAIL_USER') ?? '';
      if (smtpFallback.trim()) {
        recipients.push(smtpFallback.trim().toLowerCase());
      }
    }
    return recipients;
  }

  async notifyItMailbox(ticketId: string, payload: HelpdeskTicketPayload) {
    const recipients = await this.resolveItRecipients();
    const webUrl = resolveFrontendOrigin({
      configuredWebUrl: this.config?.get<string>('WEB_URL'),
      requestOrigin: payload.requestOrigin,
      nodeEnv: this.config?.get<string>('NODE_ENV', 'development'),
    });
    const dashboardUrl =
      payload.flowType === 'OFFBOARDING'
        ? `${webUrl}/dashboard/offboarding`
        : `${webUrl}/dashboard/it`;

    let emailsSentCount = 0;
    const dispatchedTo: Array<{ email: string; sent: boolean; reason?: string }> = [];

    for (const email of recipients) {
      const res = await this.mailService?.sendHelpdeskTicketEmail({
        to: email,
        ticketId,
        flowType: payload.flowType,
        urgency: payload.urgency,
        employeeFullName: payload.employeeFullName,
        nationalId: payload.nationalId,
        corporateEmail: payload.corporateEmail,
        operationalArea: payload.operationalArea,
        template: payload.template,
        category: payload.category,
        provisioningItems: payload.provisioningItems,
        notes: payload.notes,
        dashboardUrl,
      });
      const sent = Boolean(res?.sent);
      if (sent) emailsSentCount++;
      dispatchedTo.push({
        email,
        sent,
        ...(res?.reason ? { reason: res.reason } : {}),
      });
    }

    return {
      recipients,
      emailsSentCount,
      dispatchedTo,
    };
  }

  async enqueueProvisioning(payload: HelpdeskTicketPayload): Promise<{
    mode: 'QUEUED' | 'DIRECT_FALLBACK';
    ticketId?: string;
    jobId?: string;
    emailsSentCount?: number;
    recipients?: string[];
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
      // Fallback seguro si Redis no está disponible: registrar en BD + enviar correo a IT
      this.logger.warn(
        `Redis/BullMQ no disponible (${error instanceof Error ? error.message : String(error)}). Registrando ticket en BD y enviando correo a Mesa de Ayuda IT.`,
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

      const mailSummary = await this.notifyItMailbox(ticket.ticketId, payload);

      await this.auditService.record({
        actorId: 'helpdesk-direct-dispatcher',
        action: `HELPDESK_TICKET_DISPATCHED_${jobName.toUpperCase()}`,
        entity: 'onboarding_offboarding_workflows',
        entityId: payload.workflowId,
        newValues: {
          ticketId: ticket.ticketId,
          provider: ticket.provider,
          status: ticket.status,
          recipients: mailSummary.recipients,
          emailsSentCount: mailSummary.emailsSentCount,
        },
      });

      return {
        mode: 'DIRECT_FALLBACK',
        ticketId: ticket.ticketId,
        emailsSentCount: mailSummary.emailsSentCount,
        recipients: mailSummary.recipients,
      };
    }
  }

  async dispatchDirectTicket(params: {
    payload: HelpdeskTicketPayload;
    existingTicketId?: string | null;
    currentStep?: WorkflowStep;
    actorEmail?: string;
  }) {
    const isResend = Boolean(params.existingTicketId);
    const ticketId = params.existingTicketId
      ? params.existingTicketId
      : (await this.adapter.createTicket(params.payload)).ticketId;
    const nextStep: WorkflowStep =
      params.currentStep === 'COMPLETED' ? 'COMPLETED' : 'IT_PROVISIONING';

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        helpdeskTicketId: ticketId,
        helpdeskTicketStatus: isResend ? undefined : 'OPEN',
        currentStep: nextStep,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, params.payload.workflowId))
      .returning();

    const mailSummary = await this.notifyItMailbox(ticketId, params.payload);

    await this.auditService.record({
      actorId: params.actorEmail ?? 'helpdesk-manual-trigger',
      action: isResend ? 'HELPDESK_TICKET_EMAIL_RESENT' : 'HELPDESK_TICKET_MANUAL_DISPATCH',
      entity: 'onboarding_offboarding_workflows',
      entityId: params.payload.workflowId,
      newValues: {
        ticketId,
        recipients: mailSummary.recipients,
        emailsSentCount: mailSummary.emailsSentCount,
      },
    });

    return {
      mode: 'EMAIL_AND_DB' as const,
      isResend,
      ticketId,
      workflow: updatedWorkflow,
      ...mailSummary,
    };
  }

  async cancelTicket(ticketId: string, reason: string) {
    return this.adapter.cancelTicket(ticketId, reason);
  }

  async applyTicketStatusTransition(params: {
    workflow: {
      id: string;
      employeeId: string;
      flowType: string;
      currentStep: WorkflowStep;
      helpdeskTicketId: string | null;
      helpdeskTicketStatus: string | null;
      notes: string | null;
      employee: { corporateEmail: string | null };
    };
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
    actorEmail?: string;
    corporateEmailAssigned?: string;
    notes?: string;
  }) {
    let nextStep: WorkflowStep = params.workflow.currentStep;
    if (params.status === 'IN_PROGRESS' || params.status === 'OPEN') {
      nextStep = 'IT_PROVISIONING';
    } else if (params.status === 'RESOLVED' || params.status === 'CLOSED') {
      nextStep = 'COMPLETED';
    } else if (params.status === 'CANCELLED') {
      nextStep = 'CANCELLED_NO_SHOW';
    }

    const [updatedWorkflow] = await this.database.db
      .update(onboardingOffboardingWorkflows)
      .set({
        helpdeskTicketStatus: params.status,
        currentStep: nextStep,
        notes: params.notes ?? params.workflow.notes,
        updatedAt: new Date(),
      })
      .where(eq(onboardingOffboardingWorkflows.id, params.workflow.id))
      .returning();

    if (nextStep === 'COMPLETED' && params.workflow.flowType === 'ONBOARDING') {
      await this.database.db
        .update(employees)
        .set({
          status: 'ACTIVE',
          corporateEmail: params.corporateEmailAssigned ?? params.workflow.employee.corporateEmail,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, params.workflow.employeeId));
    }

    await this.auditService.record({
      actorId: params.actorEmail ?? 'it-support',
      action: 'HELPDESK_TICKET_STATUS_UPDATED',
      entity: 'onboarding_offboarding_workflows',
      entityId: params.workflow.id,
      oldValues: {
        currentStep: params.workflow.currentStep,
        helpdeskTicketStatus: params.workflow.helpdeskTicketStatus,
      },
      newValues: {
        currentStep: updatedWorkflow.currentStep,
        helpdeskTicketStatus: updatedWorkflow.helpdeskTicketStatus,
      },
    });

    return {
      workflowId: updatedWorkflow.id,
      ticketId: updatedWorkflow.helpdeskTicketId,
      helpdeskTicketStatus: updatedWorkflow.helpdeskTicketStatus,
      currentStep: updatedWorkflow.currentStep,
    };
  }

  async updateStatusByWorkflowId(params: {
    workflowId: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
    actorEmail?: string;
    corporateEmailAssigned?: string;
    notes?: string;
  }) {
    const workflow = await this.database.db.query.onboardingOffboardingWorkflows.findFirst({
      where: eq(onboardingOffboardingWorkflows.id, params.workflowId),
      with: { employee: true },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${params.workflowId} no encontrado`);
    }

    return this.applyTicketStatusTransition({
      workflow,
      status: params.status,
      actorEmail: params.actorEmail,
      corporateEmailAssigned: params.corporateEmailAssigned,
      notes: params.notes,
    });
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

    return this.applyTicketStatusTransition({
      workflow,
      status: dto.status,
      actorEmail: dto.technicianEmail ?? 'helpdesk-webhook',
      corporateEmailAssigned: dto.corporateEmailAssigned,
      notes: dto.notes,
    });
  }

  async getHealthSummary(): Promise<{
    queue: {
      status: 'UP' | 'DEGRADED';
      name: string;
      connected: boolean;
      mode: 'BULLMQ_REDIS' | 'DIRECT_FALLBACK';
      redisHost: string;
      redisPort: number;
      latencyMs: number;
      counts: Record<string, number> | null;
      message: string;
    };
    helpdesk: {
      status: 'UP' | 'DEGRADED';
      mode: 'MANAGEENGINE_SDP' | 'INTERNAL_IT_EMAIL' | 'MOCK';
      externalApiEnabled: boolean;
      mockEnabled: boolean;
      serviceDeskUrlConfigured: boolean;
      itRecipientsCount: number;
      itRecipients: string[];
      message: string;
    };
  }> {
    const start = Date.now();
    const redisHost = this.config?.get<string>('REDIS_HOST', 'localhost') ?? 'localhost';
    const redisPort = Number(this.config?.get<string>('REDIS_PORT', '6379') ?? '6379');

    let redisConnected = false;
    let counts: Record<string, number> | null = null;
    let queueError: string | null = null;

    if (this.queue && typeof this.queue.getJobCounts === 'function') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const probe = this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Timeout conectando con Redis/BullMQ (2.5s)')), 2500);
        });
        counts = (await Promise.race([probe, timeout])) as Record<string, number>;
        redisConnected = true;
      } catch (err) {
        queueError = err instanceof Error ? err.message : String(err);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else {
      queueError = 'Cola BullMQ no inicializada';
    }

    const mockEnabled = (this.config?.get<string>('HELPDESK_MOCK_ENABLED', 'true') ?? 'true') === 'true';
    const externalFlag =
      (this.config?.get<string>('HELPDESK_EXTERNAL_API_ENABLED', 'false') ?? 'false') === 'true';
    const externalApiEnabled = !mockEnabled && externalFlag;
    const serviceDeskUrl = this.config?.get<string>('SERVICEDESK_API_URL', '') ?? '';
    const serviceDeskKey = this.config?.get<string>('SERVICEDESK_API_KEY', '') ?? '';
    const serviceDeskUrlConfigured = Boolean(
      serviceDeskUrl && !serviceDeskUrl.includes('servicedesk.alliance.local') && serviceDeskKey,
    );

    const itRecipients = await this.resolveItRecipients().catch(() => []);
    const adapterMode: 'MANAGEENGINE_SDP' | 'INTERNAL_IT_EMAIL' | 'MOCK' = externalApiEnabled
      ? 'MANAGEENGINE_SDP'
      : mockEnabled
        ? 'MOCK'
        : 'INTERNAL_IT_EMAIL';

    return {
      queue: {
        status: redisConnected ? 'UP' : 'DEGRADED',
        name: HELPDESK_QUEUE_NAME,
        connected: redisConnected,
        mode: redisConnected ? 'BULLMQ_REDIS' : 'DIRECT_FALLBACK',
        redisHost,
        redisPort,
        latencyMs: Date.now() - start,
        counts,
        message: redisConnected
          ? `Redis y worker BullMQ (${HELPDESK_QUEUE_NAME}) conectados.`
          : `Redis sin conexión (${queueError ?? 'desconectado'}); los tickets se crean vía DIRECT_FALLBACK.`,
      },
      helpdesk: {
        status: itRecipients.length > 0 || externalApiEnabled ? 'UP' : 'DEGRADED',
        mode: adapterMode,
        externalApiEnabled,
        mockEnabled,
        serviceDeskUrlConfigured,
        itRecipientsCount: itRecipients.length,
        itRecipients,
        message: externalApiEnabled
          ? 'Integración externa con ManageEngine ServiceDesk Plus habilitada.'
          : itRecipients.length > 0
            ? `Tickets registrados en BD (IT-YYYY-XXXX) con aviso a ${itRecipients.length} destinatario(s) IT.`
            : 'Sin destinatarios IT configurados (HELPDESK_IT_EMAILS / perfiles IT_SUPPORT).',
      },
    };
  }
}
