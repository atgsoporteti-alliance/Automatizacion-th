import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import {
  auditLogs,
  candidateProcesses,
  employeeContracts,
  employeeDocuments,
  employees,
  expirationRecords,
  onboardingOffboardingWorkflows,
  timeRequests,
  userProfiles,
} from '@alliance-hcm/database';
import { InternalRole } from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { CandidatePortalService } from '../candidate-portal/candidate-portal.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

export interface PlatformHealthAlert {
  severity: 'critical' | 'warning' | 'info';
  component: 'database' | 'storage' | 'mail' | 'queue' | 'helpdesk' | 'security';
  title: string;
  detail: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly candidatePortalService?: CandidatePortalService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly storageService?: StorageService,
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly helpdeskService?: HelpdeskService,
  ) {}

  findAllUsers() {
    return this.database.db
      .select()
      .from(userProfiles)
      .orderBy(asc(userProfiles.createdAt));
  }

  async createUser(dto: CreateUserDto, actorId: string, requestOrigin?: string) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();

    // Rol CANDIDATE: crea su Portal del Candidato aislado (con regla de visibilidad de 15 días tras aprobación TH)
    if (dto.role === 'CANDIDATE') {
      if (!this.candidatePortalService) {
        throw new BadRequestException('El servicio de Portal del Candidato no está disponible.');
      }

      const candidateProcess = await this.candidatePortalService.createProcess(
        {
          candidateName: fullName,
          candidateEmail: email,
          nationalId: dto.nationalId?.trim() || undefined,
          appliedRole: dto.appliedRole?.trim() || undefined,
        },
        actorId,
        requestOrigin,
      );

      return {
        kind: 'CANDIDATE' as const,
        candidateProcess,
        authCreated: false,
      };
    }

    const existing = await this.database.db.query.userProfiles.findFirst({
      where: ilike(userProfiles.email, email),
    });
    if (existing) {
      throw new ConflictException(`Ya existe un usuario corporativo registrado con ${email}.`);
    }

    const internalRole = dto.role as InternalRole;
    const operationalArea =
      internalRole === 'AREA_LEADER'
        ? dto.operationalArea ?? 'CUSTOMER'
        : internalRole === 'CLEARANCE_APPROVER'
          ? null
          : dto.operationalArea ?? 'ALL';
    const clearanceDepartment =
      internalRole === 'CLEARANCE_APPROVER' ? dto.clearanceDepartment ?? 'FINANCE' : null;

    let userId: string = randomUUID();
    let authCreated = false;
    let authWarning: string | undefined;

    const supabaseUrl =
      this.config?.get<string>('SUPABASE_URL') ??
      this.config?.get<string>('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = this.config?.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (dto.password?.trim()) {
      if (supabaseUrl && serviceRoleKey) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: dto.password.trim(),
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (error) {
            authWarning = error.message;
            this.logger.warn(`No se pudo crear usuario en Supabase Auth (${email}): ${error.message}`);
          } else if (data.user?.id) {
            userId = data.user.id;
            authCreated = true;
          }
        } catch (err) {
          authWarning = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Excepción creando usuario en Supabase Auth: ${authWarning}`);
        }
      } else {
        authWarning =
          'SUPABASE_SERVICE_ROLE_KEY no está configurada; el usuario quedó habilitado en perfiles RBAC / acceso UAT.';
      }
    }

    const [created] = await this.database.db
      .insert(userProfiles)
      .values({
        id: userId,
        email,
        fullName,
        role: internalRole,
        operationalArea,
        clearanceDepartment,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.auditService.record({
      actorId,
      action: 'ADMIN_CREATE_USER',
      entity: 'user_profiles',
      entityId: created.id,
      newValues: {
        email: created.email,
        fullName: created.fullName,
        role: created.role,
        operationalArea: created.operationalArea,
        clearanceDepartment: created.clearanceDepartment,
        isActive: created.isActive,
        authCreated,
      },
    });

    return {
      kind: 'INTERNAL' as const,
      user: created,
      authCreated,
      ...(authWarning ? { authWarning } : {}),
    };
  }

  async updateUserRole(userId: string, dto: UpdateUserRoleDto, actorId: string) {
    const existing = await this.database.db.query.userProfiles.findFirst({
      where: eq(userProfiles.id, userId),
    });

    if (!existing) {
      throw new NotFoundException(`Usuario ${userId} no encontrado`);
    }

    const [updated] = await this.database.db
      .update(userProfiles)
      .set({
        role: dto.role,
        operationalArea:
          dto.operationalArea !== undefined ? dto.operationalArea : existing.operationalArea,
        clearanceDepartment:
          dto.clearanceDepartment !== undefined
            ? dto.clearanceDepartment
            : existing.clearanceDepartment,
        isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
      })
      .where(eq(userProfiles.id, userId))
      .returning();

    await this.auditService.record({
      actorId,
      action: 'ADMIN_UPDATE_USER_ROLE',
      entity: 'user_profiles',
      entityId: userId,
      oldValues: {
        role: existing.role,
        operationalArea: existing.operationalArea,
        clearanceDepartment: existing.clearanceDepartment,
        isActive: existing.isActive,
      },
      newValues: {
        role: updated.role,
        operationalArea: updated.operationalArea,
        clearanceDepartment: updated.clearanceDepartment,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  findAuditLogs(filters?: { actorId?: string; action?: string; entity?: string }) {
    const clauses = [];
    if (filters?.actorId?.trim()) {
      clauses.push(ilike(auditLogs.actorId, `%${filters.actorId.trim()}%`));
    }
    if (filters?.action?.trim()) {
      clauses.push(ilike(auditLogs.action, `%${filters.action.trim()}%`));
    }
    if (filters?.entity?.trim()) {
      clauses.push(ilike(auditLogs.entity, `%${filters.entity.trim()}%`));
    }

    return this.database.db
      .select()
      .from(auditLogs)
      .where(clauses.length > 0 ? and(...clauses) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
  }

  private async safeCount(
    queryFn: () => Promise<Array<{ count: number }>>,
  ): Promise<number> {
    try {
      const rows = await queryFn();
      return Number(rows?.[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async getPlatformHealth() {
    const dbStart = Date.now();
    const rawDbUrl = this.config?.get<string>('DATABASE_URL', '') ?? '';
    let dbHost = 'not-configured';
    if (rawDbUrl) {
      try {
        dbHost = new URL(rawDbUrl).hostname;
      } catch {
        dbHost = 'invalid-url-format';
      }
    }

    let dbStatus: 'UP' | 'DOWN' = 'DOWN';
    let dbLatencyMs = 0;
    let dbError: string | null = null;

    let metrics = {
      employees: 0,
      candidateProcesses: 0,
      workflows: 0,
      activeContracts: 0,
      expirations: 0,
      timeRequests: 0,
      documents: 0,
      users: 0,
      auditLogs: 0,
    };

    try {
      await this.database.db.execute(sql`SELECT 1`);
      dbStatus = 'UP';
      dbLatencyMs = Date.now() - dbStart;

      const [
        employeesCount,
        candidateCount,
        workflowsCount,
        contractsCount,
        expirationsCount,
        timeRequestsCount,
        documentsCount,
        usersCount,
        auditCount,
      ] = await Promise.all([
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(employees),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(candidateProcesses),
        ),
        this.safeCount(() =>
          this.database.db
            .select({ count: sql<number>`count(*)::int` })
            .from(onboardingOffboardingWorkflows),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(employeeContracts),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(expirationRecords),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(timeRequests),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(employeeDocuments),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(userProfiles),
        ),
        this.safeCount(() =>
          this.database.db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
        ),
      ]);

      metrics = {
        employees: employeesCount,
        candidateProcesses: candidateCount,
        workflows: workflowsCount,
        activeContracts: contractsCount,
        expirations: expirationsCount,
        timeRequests: timeRequestsCount,
        documents: documentsCount,
        users: usersCount,
        auditLogs: auditCount,
      };
    } catch (err) {
      dbLatencyMs = Date.now() - dbStart;
      dbError = err instanceof Error ? err.message : String(err);
    }

    const [storageHealth, helpdeskHealth] = await Promise.all([
      this.storageService?.checkHealth() ??
        Promise.resolve({
          status: 'DEGRADED' as const,
          endpointHost: 'no-inicializado',
          isLocalEndpoint: true,
          bucket: 'alliance',
          bucketAccessible: false,
          legacyBuckets: [],
          hasCustomCredentials: false,
          availableBuckets: [],
          latencyMs: 0,
          message: 'StorageService no disponible.',
        }),
      this.helpdeskService?.getHealthSummary() ??
        Promise.resolve({
          queue: {
            status: 'DEGRADED' as const,
            name: 'helpdesk-provisioning',
            connected: false,
            mode: 'DIRECT_FALLBACK' as const,
            redisHost: 'localhost',
            redisPort: 6379,
            latencyMs: 0,
            counts: null,
            message: 'HelpdeskService no disponible.',
          },
          helpdesk: {
            status: 'DEGRADED' as const,
            mode: 'INTERNAL_IT_EMAIL' as const,
            externalApiEnabled: false,
            mockEnabled: true,
            serviceDeskUrlConfigured: false,
            itRecipientsCount: 0,
            itRecipients: [] as string[],
            message: 'HelpdeskService no disponible.',
          },
        }),
    ]);

    const mailHealth = this.mailService?.getHealthSummary() ?? {
      status: 'DEGRADED' as const,
      configured: false,
      smtpConfigured: false,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      hasSmtpUser: false,
      relayConfigured: false,
      relayHost: null,
      preferRelayFirst: false,
      modeLabel: 'MailService no disponible.',
    };

    const nodeEnv = this.config?.get<string>('NODE_ENV', 'development') ?? 'development';
    const isProduction = nodeEnv === 'production';
    const isRender = (this.config?.get<string>('RENDER', '') ?? '').toLowerCase() === 'true';
    const supabaseUrl =
      this.config?.get<string>('SUPABASE_URL') ??
      this.config?.get<string>('NEXT_PUBLIC_SUPABASE_URL') ??
      '';
    const anonKey = this.config?.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = this.config?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const devAuthBypassEnabled =
      (this.config?.get<string>('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'true') ?? 'true') !== 'false';
    const corporateEmailDomain =
      this.config?.get<string>('CORPORATE_EMAIL_DOMAIN', 'alliance.com.co') ?? 'alliance.com.co';

    const alerts: PlatformHealthAlert[] = [];

    if (dbStatus !== 'UP') {
      alerts.push({
        severity: 'critical',
        component: 'database',
        title: 'Base de datos PostgreSQL sin conexión',
        detail: dbError ?? 'No se pudo ejecutar SELECT 1 contra Supabase PostgreSQL.',
      });
    }

    if (storageHealth.status === 'DOWN') {
      alerts.push({
        severity: isProduction ? 'critical' : 'warning',
        component: 'storage',
        title: 'Supabase Storage / S3 inaccesible',
        detail: storageHealth.message,
      });
    } else if (storageHealth.status === 'DEGRADED') {
      alerts.push({
        severity: 'warning',
        component: 'storage',
        title: 'Storage usando configuración local o credenciales por defecto',
        detail: storageHealth.message,
      });
    }

    if (!mailHealth.configured) {
      alerts.push({
        severity: 'warning',
        component: 'mail',
        title: 'Envío transaccional de correos inactivo',
        detail:
          'Configura SMTP_USER/SMTP_PASS o MAIL_RELAY_URL/MAIL_RELAY_SECRET para habilitar OTP, invitaciones y alertas.',
      });
    }

    if (!helpdeskHealth.queue.connected) {
      alerts.push({
        severity: 'info',
        component: 'queue',
        title: 'Cola Redis/BullMQ en modo DIRECT_FALLBACK',
        detail:
          'Redis no responde en este entorno; los tickets Helpdesk se registran directamente en BD y se notifican sin pérdida.',
      });
    }

    if (helpdeskHealth.helpdesk.status === 'DEGRADED') {
      alerts.push({
        severity: 'warning',
        component: 'helpdesk',
        title: 'Sin destinatarios configurados para Mesa de Ayuda IT',
        detail: helpdeskHealth.helpdesk.message,
      });
    }

    if (isProduction && devAuthBypassEnabled) {
      alerts.push({
        severity: 'warning',
        component: 'security',
        title: 'Acceso rápido UAT (NEXT_PUBLIC_DEV_AUTH_BYPASS) activo en producción',
        detail:
          'Útil durante pruebas UAT; recuerda establecer NEXT_PUBLIC_DEV_AUTH_BYPASS=false al pasar a operación final.',
      });
    }

    const overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' =
      dbStatus === 'DOWN'
        ? 'CRITICAL'
        : storageHealth.status === 'DOWN' ||
            storageHealth.status === 'DEGRADED' ||
            mailHealth.status === 'DEGRADED' ||
            helpdeskHealth.queue.status === 'DEGRADED' ||
            helpdeskHealth.helpdesk.status === 'DEGRADED' ||
            (isProduction && devAuthBypassEnabled)
          ? 'DEGRADED'
          : 'HEALTHY';

    const mem = process.memoryUsage();
    let supabaseHost: string | null = null;
    if (supabaseUrl) {
      try {
        supabaseHost = new URL(supabaseUrl).host;
      } catch {
        supabaseHost = supabaseUrl;
      }
    }

    return {
      overallStatus,
      checkedAt: new Date().toISOString(),
      runtime: {
        nodeEnv,
        isRender,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        pid: process.pid,
      },
      database: {
        status: dbStatus,
        host: dbHost,
        latencyMs: dbLatencyMs,
        error: dbError,
      },
      storage: storageHealth,
      mail: mailHealth,
      queue: helpdeskHealth.queue,
      helpdesk: helpdeskHealth.helpdesk,
      security: {
        supabaseAuthConfigured: Boolean(supabaseUrl && anonKey),
        supabaseAdminConfigured: Boolean(supabaseUrl && serviceRoleKey),
        supabaseHost,
        devAuthBypassEnabled,
        corporateEmailDomain,
      },
      metrics,
      alerts,
    };
  }
}
