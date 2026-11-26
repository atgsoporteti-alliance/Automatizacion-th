import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeDurationMinutes,
  computeInclusiveDays,
  formatDurationFromMinutes,
} from '@alliance-hcm/shared';
import { TimeRequestsService } from './time-requests.service';

describe('TimeRequestsService — Incapacidades, licencias, permisos y horas extra', () => {
  it('calcula días calendario inclusive, permisos por horas y horas extra nocturnas', () => {
    expect(computeInclusiveDays('2026-11-26', '2026-11-29')).toBe(4);
    expect(computeInclusiveDays('2026-11-26', '2026-11-25')).toBe(0);

    expect(computeDurationMinutes('18:00', '21:30')).toBe(210);
    expect(formatDurationFromMinutes(210)).toBe('3.5 h');

    // Turno nocturno cruzando medianoche (22:00 -> 02:00 = 4 h)
    expect(computeDurationMinutes('22:00', '02:00')).toBe(240);
    expect(formatDurationFromMinutes(240)).toBe('4 h');
  });

  it('crea incapacidad aprobada por TH y genera alerta automática de retorno en vencimientos', async () => {
    const employee = {
      id: 'emp-1',
      fullName: 'Laura Gómez',
      personalEmail: 'laura@gmail.com',
      corporateEmail: 'laura.gomez@alliance.com.co',
      operationalArea: 'CUSTOMER' as const,
      reportingManagerEmail: 'lider.customer@alliance.com.co',
    };

    const dbMock = {
      db: {
        query: {
          employees: {
            findFirst: jest.fn().mockResolvedValue(employee),
          },
        },
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((vals: Record<string, unknown>) => ({
            returning: jest.fn().mockResolvedValue([{ id: 'tr-1', ...vals }]),
          })),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      },
    };
    const expirationsMock = {
      create: jest.fn().mockResolvedValue({ id: 'exp-99' }),
    };

    const service = new TimeRequestsService(
      dbMock as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      new ConfigService({}),
      expirationsMock as never,
    );

    const created = await service.create(
      {
        employeeId: 'emp-1',
        category: 'INCAPACITY',
        subtype: 'ENFERMEDAD_GENERAL',
        title: 'Incapacidad EPS Sura',
        startDate: '2026-11-26',
        endDate: '2026-11-30',
        medicalEntity: 'EPS Sura',
        createExpirationAlert: true,
        alertDaysBefore: 3,
        autoApproveByTh: true,
      },
      {
        id: 'u-th',
        email: 'th@alliance.com.co',
        fullName: 'Analista TH',
        role: 'TH_ADMIN',
        operationalArea: 'ALL',
        clearanceDepartment: null,
        isActive: true,
      },
    );

    expect(created.status).toBe('APPROVED');
    expect(created.daysCount).toBe(5);
    expect(created.durationLabel).toBe('5 días');
    expect(created.linkedExpirationId).toBe('exp-99');
    expect(expirationsMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'CERTIFICATION',
        expiresAt: '2026-11-30',
        alertDaysBefore: 3,
        employeeId: 'emp-1',
      }),
      expect.anything(),
    );
  });

  it('valida horario obligatorio en horas extra y restringe aprobación final a TH', async () => {
    const dbMock = {
      db: {
        query: {
          employees: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'emp-dsi',
              fullName: 'Carlos DSI',
              personalEmail: 'carlos@gmail.com',
              corporateEmail: 'carlos@alliance.com.co',
              operationalArea: 'DSI',
              reportingManagerEmail: 'lider.dsi@alliance.com.co',
            }),
          },
          timeRequests: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'tr-2',
              employeeId: 'emp-dsi',
              operationalArea: 'DSI',
              category: 'OVERTIME',
              subtype: 'EXTRA_NOCTURNA',
              title: 'Despliegue nocturno',
              status: 'PENDING_TH',
              startDate: '2026-11-26',
              endDate: '2026-11-26',
              startTime: '22:00',
              endTime: '01:00',
              daysCount: 1,
              durationMinutes: 180,
              linkedExpirationId: null,
              pendingExpirationAlert: false,
              alertDaysBefore: 7,
              medicalEntity: null,
              leaderReviewedBy: 'lider.dsi@alliance.com.co',
              leaderReviewedAt: new Date(),
              thReviewedBy: null,
              thReviewedAt: null,
              reviewNote: null,
              employee: {
                id: 'emp-dsi',
                fullName: 'Carlos DSI',
                personalEmail: 'carlos@gmail.com',
                corporateEmail: 'carlos@alliance.com.co',
                operationalArea: 'DSI',
                reportingManagerEmail: 'lider.dsi@alliance.com.co',
              },
            }),
          },
        },
        update: jest.fn().mockImplementation(() => ({
          set: jest.fn().mockImplementation((vals: Record<string, unknown>) => ({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([
                {
                  id: 'tr-2',
                  category: 'OVERTIME',
                  subtype: 'EXTRA_NOCTURNA',
                  title: 'Despliegue nocturno',
                  startDate: '2026-11-26',
                  endDate: '2026-11-26',
                  startTime: '22:00',
                  endTime: '01:00',
                  daysCount: 1,
                  durationMinutes: 180,
                  linkedExpirationId: null,
                  ...vals,
                },
              ]),
            }),
          })),
        })),
      },
    };
    const mailMock = {
      sendTimeRequestEmail: jest.fn().mockResolvedValue({ sent: true }),
    };

    const service = new TimeRequestsService(
      dbMock as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      new ConfigService({ WEB_URL: 'https://automatizacion-th-web.vercel.app' }),
      undefined,
      mailMock as never,
    );

    await expect(
      service.create({
        employeeId: 'emp-dsi',
        category: 'OVERTIME',
        subtype: 'EXTRA_DIURNA',
        title: 'Extra sin horas',
        startDate: '2026-11-26',
      }),
    ).rejects.toThrow(BadRequestException);

    // AREA_LEADER no puede dar aprobación final sobre PENDING_TH
    await expect(
      service.review(
        'tr-2',
        { decision: 'APPROVE' },
        {
          id: 'u-leader',
          email: 'lider.dsi@alliance.com.co',
          fullName: 'Líder DSI',
          role: 'AREA_LEADER',
          operationalArea: 'DSI',
          clearanceDepartment: null,
          isActive: true,
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    // TH sí aprueba finalmente y envía correo de confirmación
    const approved = await service.review(
      'tr-2',
      { decision: 'APPROVE', note: 'Aprobado para nómina.' },
      {
        id: 'u-th',
        email: 'th@alliance.com.co',
        fullName: 'TH Admin',
        role: 'TH_ADMIN',
        operationalArea: 'ALL',
        clearanceDepartment: null,
        isActive: true,
      },
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.surchargePercent).toBe(75);
    expect(mailMock.sendTimeRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'carlos@alliance.com.co',
        statusLabel: 'Aprobada',
        durationLabel: '3 h',
      }),
    );
  });
});
