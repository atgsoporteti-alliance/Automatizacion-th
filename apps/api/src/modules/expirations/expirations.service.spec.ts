import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  evaluateExpirationStatus,
  shouldSendExpirationAlert,
} from '@alliance-hcm/shared';
import { ExpirationsService } from './expirations.service';

describe('ExpirationsService — Alertas automáticas de vencimiento', () => {
  const refDate = new Date('2026-11-26T12:00:00.000Z');

  it('evalúa correctamente severidades por días restantes (30d, 15d, 7d, vencido y vigente)', () => {
    expect(
      evaluateExpirationStatus({ expiresAt: '2027-01-15', referenceDate: refDate }),
    ).toMatchObject({
      daysRemaining: 50,
      severity: 'OK',
      effectiveStatus: 'ACTIVE',
      thresholdLevel: null,
    });

    expect(
      evaluateExpirationStatus({ expiresAt: '2026-12-20', referenceDate: refDate }),
    ).toMatchObject({
      daysRemaining: 24,
      severity: 'UPCOMING_30',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: 30,
    });

    expect(
      evaluateExpirationStatus({ expiresAt: '2026-12-08', referenceDate: refDate }),
    ).toMatchObject({
      daysRemaining: 12,
      severity: 'WARNING_15',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: 15,
    });

    expect(
      evaluateExpirationStatus({ expiresAt: '2026-11-30', referenceDate: refDate }),
    ).toMatchObject({
      daysRemaining: 4,
      severity: 'URGENT_7',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: 7,
    });

    expect(
      evaluateExpirationStatus({ expiresAt: '2026-11-26', referenceDate: refDate }),
    ).toMatchObject({
      daysRemaining: 0,
      severity: 'EXPIRED',
      effectiveStatus: 'EXPIRED',
      thresholdLevel: 0,
    });
  });

  it('evita envío repetido de correos para el mismo umbral de alerta', () => {
    expect(shouldSendExpirationAlert({ thresholdLevel: 30, lastAlertLevelSent: null })).toBe(true);
    expect(shouldSendExpirationAlert({ thresholdLevel: 30, lastAlertLevelSent: 30 })).toBe(false);
    expect(shouldSendExpirationAlert({ thresholdLevel: 15, lastAlertLevelSent: 30 })).toBe(true);
    expect(shouldSendExpirationAlert({ thresholdLevel: 7, lastAlertLevelSent: 15 })).toBe(true);
    expect(shouldSendExpirationAlert({ thresholdLevel: 0, lastAlertLevelSent: 7 })).toBe(true);
    expect(shouldSendExpirationAlert({ thresholdLevel: 0, lastAlertLevelSent: 0 })).toBe(false);
  });

  it('ejecuta el escaneo consolidado, despacha digest por correo y actualiza lastAlertLevelSent', async () => {
    const activeRows = [
      {
        id: 'exp-1',
        category: 'CONTRACT',
        title: 'Contrato Término Fijo — Laura Gómez',
        employeeId: 'emp-1',
        operationalArea: 'CUSTOMER',
        referenceCode: 'CTR-01',
        providerOrEntity: 'Alliance',
        startsAt: '2026-01-01',
        expiresAt: '2026-12-01',
        alertDaysBefore: 30,
        notifyEmployee: true,
        recipientEmails: ['th@alliance.com.co'],
        status: 'ACTIVE',
        lastAlertLevelSent: null,
        lastAlertSentAt: null,
        employee: {
          id: 'emp-1',
          fullName: 'Laura Gómez',
          personalEmail: 'laura@gmail.com',
          corporateEmail: 'laura.gomez@alliance.com.co',
          reportingManagerEmail: null,
        },
      },
      {
        id: 'exp-2',
        category: 'LICENSE',
        title: 'Licencia Microsoft 365 E3',
        employeeId: null,
        operationalArea: 'DSI',
        referenceCode: 'MS-365',
        providerOrEntity: 'Microsoft',
        startsAt: '2026-01-01',
        expiresAt: '2026-12-08',
        alertDaysBefore: 30,
        notifyEmployee: false,
        recipientEmails: [],
        status: 'EXPIRING_SOON',
        lastAlertLevelSent: 15,
        lastAlertSentAt: new Date('2026-11-23T08:00:00.000Z'),
        employee: null,
      },
    ];

    const updatedSetCalls: Array<Record<string, unknown>> = [];
    const dbMock = {
      db: {
        query: {
          expirationRecords: {
            findMany: jest.fn().mockResolvedValue(activeRows),
          },
        },
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { email: 'th@alliance.com.co', role: 'TH_ADMIN' },
              { email: 'soporte.it@alliance.com.co', role: 'IT_SUPPORT' },
            ]),
          }),
        }),
        update: jest.fn().mockImplementation(() => ({
          set: jest.fn().mockImplementation((vals: Record<string, unknown>) => {
            updatedSetCalls.push(vals);
            return {
              where: jest.fn().mockResolvedValue([]),
            };
          }),
        })),
      },
    };
    const auditMock = { record: jest.fn().mockResolvedValue(undefined) };
    const mailMock = {
      sendExpirationAlertDigestEmail: jest.fn().mockResolvedValue({ sent: true, messageId: 'm1' }),
    };

    const service = new ExpirationsService(
      dbMock as never,
      auditMock as never,
      new ConfigService({ WEB_URL: 'https://automatizacion-th-web.vercel.app' }),
      mailMock as never,
    );

    const report = await service.runAlertScan('th-admin@alliance.com.co', {
      referenceDate: refDate,
    });

    expect(report.checkedCount).toBe(2);
    expect(report.alertsTriggeredCount).toBe(1);
    expect(report.emailsSentCount).toBe(2);
    expect(mailMock.sendExpirationAlertDigestEmail).toHaveBeenCalledTimes(2);
    expect(mailMock.sendExpirationAlertDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'th@alliance.com.co',
        dashboardUrl: 'https://automatizacion-th-web.vercel.app/dashboard/vencimientos',
      }),
    );
    expect(mailMock.sendExpirationAlertDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'laura.gomez@alliance.com.co',
      }),
    );
    expect(updatedSetCalls).toContainEqual(
      expect.objectContaining({ lastAlertLevelSent: 7 }),
    );
  });

  it('restringe IT_SUPPORT a registros LICENSE y valida fecha al renovar', async () => {
    const dbMock = {
      db: {
        query: {
          expirationRecords: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'exp-1',
              category: 'CONTRACT',
              title: 'Contrato Fijo',
              expiresAt: '2026-12-01',
              alertDaysBefore: 30,
              status: 'EXPIRING_SOON',
            }),
          },
        },
      },
    };
    const service = new ExpirationsService(
      dbMock as never,
      { record: jest.fn() } as never,
      new ConfigService({}),
    );

    await expect(
      service.create(
        {
          category: 'CONTRACT',
          title: 'Contrato nuevo',
          expiresAt: '2027-01-31',
        },
        {
          id: 'u-it',
          email: 'it@alliance.com.co',
          fullName: 'IT',
          role: 'IT_SUPPORT',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.renew(
        'exp-1',
        { newExpiresAt: '2020-01-01' },
        {
          id: 'u-th',
          email: 'th@alliance.com.co',
          fullName: 'TH',
          role: 'TH_ADMIN',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
