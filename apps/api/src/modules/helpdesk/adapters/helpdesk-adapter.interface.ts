import { OperationalArea, WorkflowUrgency } from '@alliance-hcm/shared';

export interface HelpdeskTicketPayload {
  workflowId: string;
  employeeId: string;
  employeeFullName: string;
  nationalId: string;
  corporateEmail: string;
  operationalArea: OperationalArea;
  flowType: 'ONBOARDING' | 'OFFBOARDING' | 'CANCEL_NO_SHOW';
  urgency: WorkflowUrgency;
  template: string;
  category: string;
  provisioningItems: string[];
  notes?: string;
  requestOrigin?: string;
}

export interface HelpdeskTicketResponse {
  ticketId: string;
  status: string;
  externalUrl: string;
  provider: 'MANAGEENGINE_SDP' | 'MOCK_SDP' | 'INTERNAL_IT_EMAIL';
  createdAt: string;
}

export const HELPDESK_QUEUE_NAME = 'helpdesk-provisioning';
export const HELPDESK_ADAPTER_TOKEN = Symbol('HELPDESK_ADAPTER_TOKEN');

export interface HelpdeskAdapter {
  createTicket(payload: HelpdeskTicketPayload): Promise<HelpdeskTicketResponse>;
  cancelTicket(ticketId: string, reason: string): Promise<{ ticketId: string; status: string }>;
}
