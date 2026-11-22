import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HelpdeskAdapter,
  HelpdeskTicketPayload,
  HelpdeskTicketResponse,
} from './helpdesk-adapter.interface';

@Injectable()
export class ManageEngineAdapter implements HelpdeskAdapter {
  private readonly logger = new Logger(ManageEngineAdapter.name);
  private readonly mockEnabled: boolean;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.mockEnabled = this.config.get<string>('HELPDESK_MOCK_ENABLED', 'true') === 'true';
    this.apiUrl = this.config.get<string>(
      'SERVICEDESK_API_URL',
      'https://servicedesk.alliance.local/api/v3',
    );
    this.apiKey = this.config.get<string>('SERVICEDESK_API_KEY', '');
  }

  async createTicket(payload: HelpdeskTicketPayload): Promise<HelpdeskTicketResponse> {
    if (this.mockEnabled) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const ticketId = `SDP-${new Date().getFullYear()}-${suffix}`;
      this.logger.log(
        `[MOCK ServiceDesk Plus] Ticket creado ${ticketId} | Flujo=${payload.flowType} | Área=${payload.operationalArea} | Colaborador=${payload.employeeFullName}`,
      );
      return {
        ticketId,
        status: 'OPEN',
        externalUrl: `${this.apiUrl.replace('/api/v3', '')}/WorkOrder.do?woMode=viewWO&woID=${ticketId}`,
        provider: 'MOCK_SDP',
        createdAt: new Date().toISOString(),
      };
    }

    const inputData = {
      request: {
        subject: `[Alliance HCM][${payload.flowType}][${payload.operationalArea}] ${payload.employeeFullName}`,
        description: [
          `Workflow ID: ${payload.workflowId}`,
          `Cédula: ${payload.nationalId}`,
          `Correo Corporativo: ${payload.corporateEmail}`,
          `Urgencia: ${payload.urgency}`,
          `Ítems a aprovisionar / revocar:`,
          ...payload.provisioningItems.map((item) => `- ${item}`),
          payload.notes ? `Notas: ${payload.notes}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        priority: { name: payload.urgency === 'CRITICAL_IMMEDIATE' ? 'High' : 'Normal' },
        category: { name: payload.category },
        template: { name: payload.template },
      },
    };

    const formBody = new URLSearchParams({ input_data: JSON.stringify(inputData) });
    const response = await fetch(`${this.apiUrl}/requests`, {
      method: 'POST',
      headers: {
        authtoken: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ManageEngine ServiceDesk Plus error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      request?: { id?: string; status?: { name?: string } };
    };
    const ticketId = data.request?.id ?? `SDP-${Date.now()}`;

    return {
      ticketId,
      status: data.request?.status?.name ?? 'OPEN',
      externalUrl: `${this.apiUrl.replace('/api/v3', '')}/WorkOrder.do?woMode=viewWO&woID=${ticketId}`,
      provider: 'MANAGEENGINE_SDP',
      createdAt: new Date().toISOString(),
    };
  }

  async cancelTicket(ticketId: string, reason: string): Promise<{ ticketId: string; status: string }> {
    if (this.mockEnabled) {
      this.logger.log(`[MOCK ServiceDesk Plus] Ticket ${ticketId} cancelado. Motivo: ${reason}`);
      return { ticketId, status: 'CANCELLED' };
    }

    const inputData = {
      request: {
        status: { name: 'Cancelled' },
        closure_info: { closure_comments: reason },
      },
    };

    const formBody = new URLSearchParams({ input_data: JSON.stringify(inputData) });
    const response = await fetch(`${this.apiUrl}/requests/${ticketId}`, {
      method: 'PUT',
      headers: {
        authtoken: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    if (!response.ok) {
      throw new Error(`No se pudo cancelar ticket ${ticketId} en ServiceDesk Plus`);
    }

    return { ticketId, status: 'CANCELLED' };
  }
}
