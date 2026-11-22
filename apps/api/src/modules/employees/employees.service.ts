import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { employees } from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  EmployeeStatus,
  OperationalArea,
  sanitizeEmployeeForRole,
} from '@alliance-hcm/shared';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { UpdateOrganizationalDto } from './dto/update-organizational.dto';

export interface DuplicateCheckResult {
  exists: boolean;
  isRehire: boolean;
  conflictField: 'nationalId' | 'personalEmail' | 'both' | null;
  existingEmployee: {
    id: string;
    fullName: string;
    status: EmployeeStatus;
    operationalArea: OperationalArea | null;
    terminationDate: Date | null;
  } | null;
  message: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async checkDuplicate(nationalId?: string, email?: string): Promise<DuplicateCheckResult> {
    if (!nationalId && !email) {
      return {
        exists: false,
        isRehire: false,
        conflictField: null,
        existingEmployee: null,
        message: 'Sin parámetros de búsqueda.',
      };
    }

    const conditions = [];
    if (nationalId?.trim()) {
      conditions.push(eq(employees.nationalId, nationalId.trim()));
    }
    if (email?.trim()) {
      conditions.push(ilike(employees.personalEmail, email.trim()));
    }

    const found = await this.database.db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        nationalId: employees.nationalId,
        personalEmail: employees.personalEmail,
        status: employees.status,
        operationalArea: employees.operationalArea,
        terminationDate: employees.terminationDate,
      })
      .from(employees)
      .where(conditions.length > 1 ? or(...conditions) : conditions[0])
      .limit(1);

    if (found.length === 0) {
      return {
        exists: false,
        isRehire: false,
        conflictField: null,
        existingEmployee: null,
        message: 'Cédula y correo disponibles para nuevo ingreso.',
      };
    }

    const emp = found[0];
    const matchedNationalId = Boolean(nationalId && emp.nationalId === nationalId.trim());
    const matchedEmail = Boolean(
      email && emp.personalEmail.toLowerCase() === email.trim().toLowerCase(),
    );

    const conflictField =
      matchedNationalId && matchedEmail
        ? 'both'
        : matchedNationalId
          ? 'nationalId'
          : 'personalEmail';

    const isRehire = emp.status === 'INACTIVE';

    return {
      exists: true,
      isRehire,
      conflictField,
      existingEmployee: {
        id: emp.id,
        fullName: emp.fullName,
        status: emp.status,
        operationalArea: emp.operationalArea,
        terminationDate: emp.terminationDate,
      },
      message: isRehire
        ? `Ex-colaborador detectado (${emp.fullName}). Se habilitará vinculación como REINTEGRO conservando el expediente histórico.`
        : `Ya existe un registro activo o en proceso para ${emp.fullName} (Estado: ${emp.status}).`,
    };
  }

  async findAll(
    filters?: {
      status?: EmployeeStatus;
      operationalArea?: OperationalArea;
      search?: string;
    },
    user?: AuthenticatedUserProfile,
  ) {
    const whereClauses = [];

    if (filters?.status) {
      whereClauses.push(eq(employees.status, filters.status));
    }
    if (filters?.operationalArea) {
      whereClauses.push(eq(employees.operationalArea, filters.operationalArea));
    } else if (
      user?.role === 'AREA_LEADER' &&
      user.operationalArea &&
      user.operationalArea !== 'ALL'
    ) {
      whereClauses.push(eq(employees.operationalArea, user.operationalArea));
    }

    if (filters?.search?.trim()) {
      const pattern = `%${filters.search.trim()}%`;
      whereClauses.push(
        or(
          ilike(employees.fullName, pattern),
          ilike(employees.nationalId, pattern),
          ilike(employees.personalEmail, pattern),
        ),
      );
    }

    const rows = await this.database.db.query.employees.findMany({
      where: whereClauses.length > 0 ? and(...whereClauses) : undefined,
      with: {
        documents: true,
        consentSignatures: true,
        workflows: true,
      },
      orderBy: [desc(employees.createdAt)],
    });

    if (!user) return rows;
    return rows.map((emp) => sanitizeEmployeeForRole(emp, user.role));
  }

  async findOne(id: string, user?: AuthenticatedUserProfile) {
    const employee = await this.database.db.query.employees.findFirst({
      where: eq(employees.id, id),
      with: {
        documents: true,
        consentSignatures: true,
        workflows: {
          with: {
            clearances: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Colaborador ${id} no encontrado`);
    }

    if (
      user?.role === 'AREA_LEADER' &&
      !canAccessOperationalArea(user.operationalArea, employee.operationalArea)
    ) {
      throw new ForbiddenException(
        `No tienes acceso a colaboradores del área ${employee.operationalArea ?? 'N/A'}.`,
      );
    }

    return user ? sanitizeEmployeeForRole(employee, user.role) : employee;
  }

  async updateOrganizational(id: string, dto: UpdateOrganizationalDto, actorId = 'th-analyst') {
    const existing = await this.findOne(id);

    const [updated] = await this.database.db
      .update(employees)
      .set({
        operationalArea: dto.operationalArea,
        jobTitle: dto.jobTitle,
        costCenter: dto.costCenter,
        reportingManagerEmail: dto.reportingManagerEmail,
        hireDate: dto.hireDate,
        corporateEmail: dto.corporateEmail ?? existing.corporateEmail,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, id))
      .returning();

    await this.auditService.record({
      actorId,
      action: 'UPDATE_ORGANIZATIONAL_DATA',
      entity: 'employees',
      entityId: id,
      oldValues: {
        operationalArea: existing.operationalArea,
        jobTitle: existing.jobTitle,
        costCenter: existing.costCenter,
        reportingManagerEmail: existing.reportingManagerEmail,
      },
      newValues: {
        operationalArea: updated.operationalArea,
        jobTitle: updated.jobTitle,
        costCenter: updated.costCenter,
        reportingManagerEmail: updated.reportingManagerEmail,
      },
    });

    return updated;
  }
}
