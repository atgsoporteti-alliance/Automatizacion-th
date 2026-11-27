import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  wizardStep1Schema,
} from '@alliance-hcm/shared';
import { StorageService } from '../../common/storage/storage.service';
import { EmployeesController } from '../employees/employees.controller';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { WorkflowsService } from './workflows.service';

describe('Workflows Helpdesk Trigger, Storage Free Tier, Consent Step 1 & Inline Signature', () => {
  it('bloquea descarga (attachment) en firma Ley 1581 y fuerza Content-Disposition inline', async () => {
    const controller = new EmployeesController({
      getSignatureContent: jest.fn().mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        fileName: 'firma-ley1581-1019.png',
      }),
    } as never);

    const headers: Record<string, string> = {};
    const send = jest.fn();
    await controller.getSignatureContent('emp-1', {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      send,
    } as never);

    expect(headers['Content-Disposition']).toContain('inline;');
    expect(headers['Content-Disposition']).not.toContain('attachment');
    expect(headers['Cache-Control']).toContain('no-store');
    expect(send).toHaveBeenCalled();
  });

  it('valida consentimiento Ley 1581 obligatoriamente en Paso 1 y tope 4 MB de Supabase Free Tier', () => {
    const step1MissingConsent = wizardStep1Schema.safeParse({
      habeasDataAccepted: false,
      fullName: 'Laura Gómez',
      preferredNameCredentials: 'laura.gomez',
      nationalId: '1019234567',
      idIssuePlace: 'Bogotá',
      birthDate: '1998-05-10',
      birthPlace: 'Bogotá',
      maritalStatus: 'SOLTERO',
    });
    expect(step1MissingConsent.success).toBe(false);

    const storage = new StorageService(new ConfigService({}));
    expect(() =>
      storage.validateFile({
        buffer: Buffer.alloc(SUPABASE_FREE_MAX_FILE_SIZE_BYTES + 1024),
        mimeType: 'application/pdf',
        fileName: 'archivo-pesado.pdf',
        allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      storage.validateFile({
        buffer: Buffer.from('binary'),
        mimeType: 'application/x-msdownload',
        fileName: 'virus.exe',
        allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
      }),
    ).toThrow(BadRequestException);
  });

  it('dispara ticket Helpdesk en BD y correo IT sin webhook externo, respetando gate DSI', async () => {
    const sendHelpdeskTicketEmail = jest.fn().mockResolvedValue({ sent: true, messageId: 'm-1' });
    const updateWhereReturning = jest.fn().mockResolvedValue([
      {
        id: 'wf-1',
        currentStep: 'IT_PROVISIONING',
        helpdeskTicketId: 'IT-2026-4401',
        helpdeskTicketStatus: 'OPEN',
      },
    ]);

    const dbMock = {
      db: {
        query: {
          onboardingOffboardingWorkflows: {
            findFirst: jest
              .fn()
              .mockResolvedValueOnce({
                id: 'wf-dsi',
                flowType: 'ONBOARDING',
                currentStep: 'DSI_LEADER_APPROVAL',
                employee: { operationalArea: 'DSI' },
              })
              .mockResolvedValueOnce({
                id: 'wf-1',
                employeeId: 'emp-1',
                flowType: 'ONBOARDING',
                urgency: 'STANDARD',
                currentStep: 'HELPDESK_TICKET_CREATED',
                helpdeskTicketId: null,
                notes: 'Ingreso aprobado',
                employee: {
                  fullName: 'Laura Gómez',
                  preferredNameCredentials: 'laura.gomez',
                  nationalId: '1019234567',
                  personalEmail: 'laura@gmail.com',
                  corporateEmail: 'laura.gomez@alliance.com.co',
                  operationalArea: 'CUSTOMER',
                },
                provisioningPayload: null,
              }),
          },
        },
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ email: 'mesa.it@alliance.com.co' }]),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: updateWhereReturning,
            }),
          }),
        }),
      },
    };

    const helpdesk = new HelpdeskService(
      { add: jest.fn() } as never,
      {
        createTicket: jest.fn().mockResolvedValue({
          ticketId: 'IT-2026-4401',
          status: 'OPEN',
          externalUrl: '',
          provider: 'INTERNAL_IT_EMAIL',
          createdAt: new Date().toISOString(),
        }),
        cancelTicket: jest.fn(),
      },
      dbMock as never,
      { record: jest.fn() } as never,
      { sendHelpdeskTicketEmail } as never,
      new ConfigService({ WEB_URL: 'https://automatizacion-th-web.vercel.app' }),
    );

    const workflows = new WorkflowsService(
      dbMock as never,
      { record: jest.fn() } as never,
      new RuleEngineService(),
      helpdesk,
    );

    const actor = {
      id: 'it-1',
      email: 'mesa.it@alliance.com.co',
      fullName: 'Soporte IT',
      role: 'IT_SUPPORT' as const,
      operationalArea: 'ALL' as const,
      clearanceDepartment: null,
      isActive: true,
    };

    await expect(workflows.triggerHelpdeskTicket('wf-dsi', actor)).rejects.toThrow(
      BadRequestException,
    );

    const dispatched = await workflows.triggerHelpdeskTicket('wf-1', actor);
    expect(dispatched.ticketId).toBe('IT-2026-4401');
    expect(dispatched.emailsSentCount).toBe(1);
    expect(sendHelpdeskTicketEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'mesa.it@alliance.com.co',
        ticketId: 'IT-2026-4401',
        employeeFullName: 'Laura Gómez',
        dashboardUrl: 'https://automatizacion-th-web.vercel.app/dashboard/it',
      }),
    );
  });
});
