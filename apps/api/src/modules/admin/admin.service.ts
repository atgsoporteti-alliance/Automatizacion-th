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
import { and, asc, desc, eq, ilike } from 'drizzle-orm';
import { auditLogs, userProfiles } from '@alliance-hcm/database';
import { InternalRole } from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { CandidatePortalService } from '../candidate-portal/candidate-portal.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly candidatePortalService?: CandidatePortalService,
    @Optional() private readonly config?: ConfigService,
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
}
