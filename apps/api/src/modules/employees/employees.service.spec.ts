import { EmployeesService } from './employees.service';

describe('EmployeesService - checkDuplicate & Rehire detection', () => {
  const mockAuditService = { record: jest.fn() };

  function createServiceWithRows(rows: Record<string, unknown>[]) {
    const limitMock = jest.fn().mockResolvedValue(rows);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    const mockDatabase = {
      db: {
        select: selectMock,
      },
    };

    return new EmployeesService(mockDatabase as never, mockAuditService as never);
  }

  it('retorna exists=false cuando no hay coincidencias', async () => {
    const service = createServiceWithRows([]);
    const result = await service.checkDuplicate('9999999999', 'nuevo@gmail.com');

    expect(result.exists).toBe(false);
    expect(result.isRehire).toBe(false);
    expect(result.conflictField).toBeNull();
  });

  it('detecta reintegro (isRehire=true) cuando el colaborador existe como INACTIVE', async () => {
    const service = createServiceWithRows([
      {
        id: 'emp-1',
        fullName: 'Diego Alejandro Torres Mejía',
        nationalId: '1015432198',
        personalEmail: 'diego.torres.ex@gmail.com',
        status: 'INACTIVE',
        operationalArea: 'CUSTOMER',
        terminationDate: new Date('2025-08-31T23:59:00Z'),
      },
    ]);

    const result = await service.checkDuplicate('1015432198');
    expect(result.exists).toBe(true);
    expect(result.isRehire).toBe(true);
    expect(result.conflictField).toBe('nationalId');
    expect(result.existingEmployee?.id).toBe('emp-1');
  });

  it('bloquea como duplicado (isRehire=false) cuando el colaborador ya está ACTIVE', async () => {
    const service = createServiceWithRows([
      {
        id: 'emp-2',
        fullName: 'Camila Morales',
        nationalId: '1018456721',
        personalEmail: 'camila.morales.personal@gmail.com',
        status: 'ACTIVE',
        operationalArea: 'CUSTOMER',
        terminationDate: null,
      },
    ]);

    const result = await service.checkDuplicate('1018456721', 'camila.morales.personal@gmail.com');
    expect(result.exists).toBe(true);
    expect(result.isRehire).toBe(false);
    expect(result.conflictField).toBe('both');
  });
});
