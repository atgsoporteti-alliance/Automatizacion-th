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

  it('retorna diagnóstico consolidado de salud de plataforma sin exponer secretos', async () => {
    const mockDb = {
      db: {
        execute: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockResolvedValue([{ count: 5 }]),
        }),
      },
    } as unknown as DatabaseService;

    const mockConfig = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const vals: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:supersecret@db.supabase.co:5432/postgres',
          NODE_ENV: 'production',
          NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
          SUPABASE_URL: 'https://proj.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'service-key',
          CORPORATE_EMAIL_DOMAIN: 'alliance.com.co',
        };
        return vals[key] ?? defaultVal;
      }),
    };

    const mockStorage = {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'UP',
        endpointHost: 'proj.storage.supabase.co',
        isLocalEndpoint: false,
        bucket: 'alliance',
        bucketAccessible: true,
        legacyBuckets: ['alliance-hcm-docs'],
        hasCustomCredentials: true,
        availableBuckets: ['alliance', 'alliance-hcm-docs'],
        latencyMs: 42,
        message: 'Bucket operativo',
      }),
    };

    const mockMail = {
      getHealthSummary: jest.fn().mockReturnValue({
        status: 'UP',
        configured: true,
        smtpConfigured: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        hasSmtpUser: true,
        relayConfigured: true,
        relayHost: 'automatizacion-th-web.vercel.app',
        preferRelayFirst: true,
        modeLabel: 'HTTPS Relay prioritario',
      }),
    };

    const mockHelpdesk = {
      getHealthSummary: jest.fn().mockResolvedValue({
        queue: {
          status: 'UP',
          name: 'helpdesk-provisioning',
          connected: true,
          mode: 'BULLMQ_REDIS',
          redisHost: 'localhost',
          redisPort: 6379,
          latencyMs: 5,
          counts: { waiting: 0, active: 0, completed: 2, failed: 0, delayed: 0 },
          message: 'OK',
        },
        helpdesk: {
          status: 'UP',
          mode: 'INTERNAL_IT_EMAIL',
          externalApiEnabled: false,
          mockEnabled: false,
          serviceDeskUrlConfigured: false,
          itRecipientsCount: 1,
          itRecipients: ['soporte.it@alliance.com'],
          message: 'OK',
        },
      }),
    };

    const service = new AdminService(
      mockDb,
      { record: jest.fn() } as unknown as AuditService,
      undefined,
      mockConfig as never,
      mockStorage as never,
      mockMail as never,
      mockHelpdesk as never,
    );

    const health = await service.getPlatformHealth();
    expect(health.overallStatus).toBe('HEALTHY');
    expect(health.database.status).toBe('UP');
    expect(health.database.host).toBe('db.supabase.co');
    expect(JSON.stringify(health)).not.toContain('supersecret');
    expect(JSON.stringify(health)).not.toContain('service-key');
    expect(health.metrics.employees).toBe(5);
    expect(health.alerts).toHaveLength(0);
  });
});
