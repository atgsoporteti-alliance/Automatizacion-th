import { OffboardingService } from './offboarding.service';
import { CLEARANCE_DEPARTMENTS } from '@alliance-hcm/shared';

describe('OffboardingService', () => {
  it('crea los 4 Paz y Salvo y dispara ticket inmediato cuando urgency=CRITICAL_IMMEDIATE', async () => {
    const employee = {
      id: 'emp-uuid-1',
      fullName: 'Juliana Ospina',
      nationalId: '52987654',
      corporateEmail: 'juliana.ospina@alliance.com.co',
      personalEmail: 'juliana@gmail.com',
      operationalArea: 'VENTAS',
    };

    const mockWorkflow = {
      id: 'wf-uuid-1',
      employeeId: employee.id,
      flowType: 'OFFBOARDING',
      urgency: 'CRITICAL_IMMEDIATE',
      currentStep: 'HELPDESK_TICKET_CREATED',
    };

    const insertMock = jest
      .fn()
      .mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockWorkflow]),
        }),
      })
      .mockReturnValueOnce({
        values: jest.fn().mockImplementation((rows) => ({
          returning: jest.fn().mockResolvedValue(rows),
        })),
      });

    const mockDatabase = {
      db: {
        query: {
          employees: {
            findFirst: jest.fn().mockResolvedValue(employee),
          },
        },
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: insertMock,
      },
    };

    const mockAudit = { record: jest.fn() };
    const mockHelpdesk = {
      enqueueProvisioning: jest.fn().mockResolvedValue({ mode: 'QUEUED', jobId: 'job-99' }),
    };

    const service = new OffboardingService(
      mockDatabase as never,
      mockAudit as never,
      mockHelpdesk as never,
    );

    const result = await service.initiateOffboarding({
      employeeId: employee.id,
      urgency: 'CRITICAL_IMMEDIATE',
      terminationDate: '2026-11-21',
      reason: 'Despido con justa causa — revocación inmediata',
      requestedByEmail: 'director.th@alliance.com.co',
    });

    expect(result.clearances).toHaveLength(CLEARANCE_DEPARTMENTS.length);
    expect(result.clearances.map((c: { department: string }) => c.department)).toEqual(
      expect.arrayContaining([
        'IT_HARDWARE_ACCESS',
        'FINANCE',
        'FIXED_ASSETS',
        'DIRECT_MANAGER',
      ]),
    );
    expect(mockHelpdesk.enqueueProvisioning).toHaveBeenCalledTimes(1);
    expect(mockHelpdesk.enqueueProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: 'CRITICAL_IMMEDIATE',
        flowType: 'OFFBOARDING',
      }),
    );
  });
});
