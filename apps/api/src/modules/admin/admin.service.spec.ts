import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { CandidatePortalService } from '../candidate-portal/candidate-portal.service';

describe('AdminService.createUser', () => {
  it('crea un usuario Candidato delegando al Portal del Candidato aislado sin insertar en userProfiles internos', async () => {
    const mockDb = {
      db: {
        query: { userProfiles: { findFirst: jest.fn() } },
        insert: jest.fn(),
      },
    } as unknown as DatabaseService;

    const mockAudit = { record: jest.fn() } as unknown as AuditService;
    const mockCandidatePortal = {
      createProcess: jest.fn().mockResolvedValue({
        id: 'proc-123',
        accessToken: 'tok-cand',
        candidateName: 'Camila Suárez',
        candidateEmail: 'camila@correo.com',
        portalUrl: 'https://automatizacion-th-web.vercel.app/candidato/tok-cand',
        emailSent: true,
      }),
    } as unknown as CandidatePortalService;

    const service = new AdminService(mockDb, mockAudit, mockCandidatePortal);

    const result = await service.createUser(
      {
        fullName: 'Camila Suárez',
        email: 'CAMILA@CORREO.COM',
        role: 'CANDIDATE',
        appliedRole: 'Analista',
        nationalId: '1020304050',
      },
      'admin-1',
      'https://automatizacion-th-web.vercel.app',
    );

    expect(result.kind).toBe('CANDIDATE');
    expect(mockCandidatePortal.createProcess).toHaveBeenCalledWith(
      {
        candidateName: 'Camila Suárez',
        candidateEmail: 'camila@correo.com',
        nationalId: '1020304050',
        appliedRole: 'Analista',
      },
      'admin-1',
      'https://automatizacion-th-web.vercel.app',
    );
    expect(mockDb.db.insert).not.toHaveBeenCalled();
  });

  it('crea usuario corporativo interno y rechaza correos duplicados', async () => {
    const returning = jest.fn().mockResolvedValue([
      {
        id: 'user-1',
        email: 'nuevo.th@alliance.com',
        fullName: 'Nuevo Analista',
        role: 'TH_ANALYST',
        operationalArea: 'ALL',
        clearanceDepartment: null,
        isActive: true,
      },
    ]);
    const values = jest.fn().mockReturnValue({ returning });

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-1', email: 'nuevo.th@alliance.com' });

    const mockDb = {
      db: {
        query: { userProfiles: { findFirst } },
        insert: jest.fn().mockReturnValue({ values }),
      },
    } as unknown as DatabaseService;

    const mockAudit = { record: jest.fn() } as unknown as AuditService;

    const service = new AdminService(mockDb, mockAudit);

    const created = await service.createUser(
      {
        fullName: 'Nuevo Analista',
        email: 'nuevo.th@alliance.com',
        role: 'TH_ANALYST',
      },
      'super-admin',
    );

    expect(created.kind).toBe('INTERNAL');
    if (created.kind === 'INTERNAL') {
      expect(created.user.role).toBe('TH_ANALYST');
    }
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CREATE_USER' }),
    );

    await expect(
      service.createUser(
        {
          fullName: 'Duplicado',
          email: 'nuevo.th@alliance.com',
          role: 'TH_ANALYST',
        },
        'super-admin',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
