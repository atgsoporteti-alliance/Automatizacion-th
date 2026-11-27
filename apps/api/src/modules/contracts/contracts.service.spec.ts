import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  const thUser: AuthenticatedUserProfile = {
    id: 'user-th-1',
    email: 'th.analista@alliance.com',
    fullName: 'Valeria Quintero',
    role: 'TH_ANALYST',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  };

  it('filtra contratos por nombre, rango de fechas, tipo y estado efectivo', async () => {
    const dbMock = {
      query: {
        employeeContracts: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'ctr-1',
              employeeId: 'emp-1',
              contractCode: 'CTR-2026-001',
              title: 'Contrato Término Fijo — Camila',
              contractType: 'FIXED_TERM',
              status: 'ACTIVE',
              operationalArea: 'CUSTOMER',
              jobTitle: 'Especialista Customer',
              costCenter: 'CC-CUST-101',
              workModality: 'Híbrido',
              salaryCop: 3500000,
              startsAt: '2026-01-15',
              endsAt: '2026-12-10',
              signedAt: '2026-01-10',
              alertDaysBefore: 30,
              fileName: 'contrato-camila.pdf',
              mimeType: 'application/pdf',
              fileSize: 120000,
              s3Key: 'employees/1018456721/contracts/c1.pdf',
              s3Url: 'https://supabase.local/alliance/c1.pdf',
              linkedExpirationId: null,
              notes: 'Prórroga revisada',
              createdBy: thUser.email,
              createdAt: new Date('2026-01-15T00:00:00Z'),
              updatedAt: new Date('2026-11-20T00:00:00Z'),
              employee: {
                id: 'emp-1',
                fullName: 'Camila Andrea Morales',
                nationalId: '1018456721',
                personalEmail: 'camila@correo.com',
                corporateEmail: 'camila.morales@alliance.com.co',
                operationalArea: 'CUSTOMER',
                jobTitle: 'Especialista Customer',
                costCenter: 'CC-CUST-101',
                hireDate: '2026-01-15',
                terminationDate: null,
                status: 'ACTIVE',
              },
            },
            {
              id: 'ctr-2',
              employeeId: 'emp-2',
              contractCode: 'CTR-2025-099',
              title: 'Contrato Indefinido — Andrés DSI',
              contractType: 'INDEFINITE',
              status: 'ACTIVE',
              operationalArea: 'DSI',
              jobTitle: 'Ingeniero Senior',
              costCenter: 'CC-DSI-301',
              workModality: 'Remoto',
              salaryCop: 9000000,
              startsAt: '2025-03-01',
              endsAt: null,
              signedAt: '2025-02-28',
              alertDaysBefore: 30,
              fileName: null,
              mimeType: null,
              fileSize: 0,
              s3Key: null,
              s3Url: null,
              linkedExpirationId: null,
              notes: null,
              createdBy: thUser.email,
              createdAt: new Date('2025-03-01T00:00:00Z'),
              updatedAt: new Date('2026-11-01T00:00:00Z'),
              employee: {
                id: 'emp-2',
                fullName: 'Andrés Felipe Castellanos',
                nationalId: '1020812345',
                personalEmail: 'andres@correo.com',
                corporateEmail: 'andres@alliance.com.co',
                operationalArea: 'DSI',
                jobTitle: 'Ingeniero Senior',
                costCenter: 'CC-DSI-301',
                hireDate: '2025-03-01',
                terminationDate: null,
                status: 'ACTIVE',
              },
            },
          ]),
        },
        employees: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'emp-1', fullName: 'Camila Andrea Morales' },
            { id: 'emp-2', fullName: 'Andrés Felipe Castellanos' },
            { id: 'emp-3', fullName: 'Sebastián Vargas' },
          ]),
        },
        expirationRecords: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    };

    const service = new ContractsService(dbMock as never, { record: jest.fn() } as never);

    const byName = await service.list({ search: 'Camila' });
    expect(byName.kpis.totalContracts).toBe(2);
    expect(byName.kpis.employeesWithoutContractCount).toBe(1);
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0].contractCode).toBe('CTR-2026-001');

    const byDateRange = await service.list({
      dateField: 'startsAt',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    expect(byDateRange.items).toHaveLength(1);
    expect(byDateRange.items[0].id).toBe('ctr-1');

    const onlyWithoutDoc = await service.list({ hasDocument: false });
    expect(onlyWithoutDoc.items).toHaveLength(1);
    expect(onlyWithoutDoc.items[0].contractType).toBe('INDEFINITE');
  });

  it('rechaza crear un contrato cuando endsAt es anterior a startsAt', async () => {
    const dbMock = {
      query: {
        employees: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'emp-1',
            fullName: 'Camila',
            operationalArea: 'CUSTOMER',
            jobTitle: 'Especialista',
            costCenter: 'CC-1',
          }),
        },
      },
    };

    const service = new ContractsService(dbMock as never, { record: jest.fn() } as never);

    await expect(
      service.create(
        {
          employeeId: 'emp-1',
          title: 'Contrato Fijo',
          contractType: 'FIXED_TERM',
          startsAt: '2026-12-01',
          endsAt: '2026-11-01',
        },
        thUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('obtiene el PDF del contrato pasando sourceUrl al StorageService y falla limpio si no hay adjunto', async () => {
    const findFirstMock = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'ctr-1',
        fileName: 'contrato-camila.pdf',
        mimeType: 'application/pdf',
        s3Key: 'employees/1018456721/contracts/c1.pdf',
        s3Url: 'https://supabase.local/storage/v1/object/public/alliance/c1.pdf',
      })
      .mockResolvedValueOnce({
        id: 'ctr-2',
        fileName: null,
        s3Key: null,
        s3Url: null,
      });

    const storageMock = {
      getObjectBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      }),
    };

    const service = new ContractsService(
      { query: { employeeContracts: { findFirst: findFirstMock } } } as never,
      { record: jest.fn() } as never,
      storageMock as never,
    );

    const file = await service.getDocumentContent('ctr-1');
    expect(file.fileName).toBe('contrato-camila.pdf');
    expect(storageMock.getObjectBuffer).toHaveBeenCalledWith(
      'employees/1018456721/contracts/c1.pdf',
      { sourceUrl: 'https://supabase.local/storage/v1/object/public/alliance/c1.pdf' },
    );

    await expect(service.getDocumentContent('ctr-2')).rejects.toThrow(NotFoundException);
  });
});
