import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike } from 'drizzle-orm';
import { auditLogs, userProfiles } from '@alliance-hcm/database';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  findAllUsers() {
    return this.database.db
      .select()
      .from(userProfiles)
      .orderBy(asc(userProfiles.createdAt));
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
