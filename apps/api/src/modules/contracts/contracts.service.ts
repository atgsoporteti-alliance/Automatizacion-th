import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { employeeContracts, employees, expirationRecords } from '@alliance-hcm/database';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  AuthenticatedUserProfile,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  ContractStatus,
  ContractType,
  evaluateExpirationStatus,
  EXPIRATION_SEVERITY_LABELS,
  OperationalArea,
} from '@alliance-hcm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { StorageService } from '../../common/storage/storage.service';
import { decodeUploadedFileName } from '../../common/utils/file-header.util';
import {
  CreateContractDto,
  RenewContractDto,
  TerminateContractDto,
  UpdateContractDto,
} from './dto/contracts.dto';

export type ContractDateField = 'startsAt' | 'endsAt' | 'signedAt' | 'any';
export type ContractSortBy =
  | 'startsAt_desc'
  | 'startsAt_asc'
  | 'endsAt_asc'
  | 'endsAt_desc'
  | 'name_asc'
  | 'updated_desc';

export interface ContractListFilters {
  search?: string;
  contractType?: ContractType;
  status?: ContractStatus;
  operationalArea?: OperationalArea;
  dateField?: ContractDateField;
  dateFrom?: string;
  dateTo?: string;
  hasDocument?: boolean;
  sortBy?: ContractSortBy;
}

function normalizeDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function formatDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return `Vencido hace ${Math.abs(daysRemaining)} día(s)`;
  if (daysRemaining === 0) return 'Vence hoy';
  if (daysRemaining === 1) return 'Vence mañana (1 día)';
  return `Vence en ${daysRemaining} días`;
}

function dateInRange(
  candidateDate: string | null,
  from?: string,
  to?: string,
): boolean {
  if (!candidateDate) return false;
  if (from && candidateDate < from) return false;
  if (to && candidateDate > to) return false;
  return true;
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly storageService?: StorageService,
  ) {}

  private assertValidDateOrder(startsAt: string, endsAt?: string | null) {
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException(
        'La fecha de finalización o vencimiento no puede ser anterior a la fecha de inicio.',
      );
    }
  }

  private buildDefaultCode(startsAt: string): string {
    const year = startsAt.slice(0, 4) || String(new Date().getFullYear());
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CTR-${year}-${suffix}`;
  }

  private computeContractStatusAndEvaluation(
    row: {
      contractType: ContractType;
      status: ContractStatus;
      endsAt: string | null;
      alertDaysBefore: number;
    },
    referenceDate: Date = new Date(),
  ): {
    effectiveStatus: ContractStatus;
    evaluation: {
      daysRemaining: number | null;
      severity: 'OK' | 'UPCOMING_30' | 'WARNING_15' | 'URGENT_7' | 'EXPIRED';
      daysLabel: string;
      severityLabel: string;
    };
  } {
    if (row.status === 'TERMINATED' || row.status === 'DRAFT') {
      return {
        effectiveStatus: row.status,
        evaluation: {
          daysRemaining: null,
          severity: 'OK',
          daysLabel: CONTRACT_STATUS_LABELS[row.status],
          severityLabel: CONTRACT_STATUS_LABELS[row.status],
        },
      };
    }

    if (!row.endsAt) {
      return {
        effectiveStatus: row.status === 'RENEWED' ? 'RENEWED' : 'ACTIVE',
        evaluation: {
          daysRemaining: null,
          severity: 'OK',
          daysLabel: row.contractType === 'INDEFINITE' ? 'Término indefinido' : 'Sin fecha fin',
          severityLabel: 'Vigente',
        },
      };
    }

    const expEval = evaluateExpirationStatus({
      expiresAt: row.endsAt,
      status: row.status === 'RENEWED' ? 'RENEWED' : 'ACTIVE',
      alertDaysBefore: row.alertDaysBefore,
      referenceDate,
    });

    const mappedStatus: ContractStatus =
      row.status === 'RENEWED' && expEval.daysRemaining > row.alertDaysBefore
        ? 'RENEWED'
        : expEval.effectiveStatus === 'EXPIRED'
          ? 'EXPIRED'
          : expEval.effectiveStatus === 'EXPIRING_SOON'
            ? 'EXPIRING_SOON'
            : 'ACTIVE';

    return {
      effectiveStatus: mappedStatus,
      evaluation: {
        daysRemaining: expEval.daysRemaining,
        severity: expEval.severity,
        daysLabel: formatDaysRemainingLabel(expEval.daysRemaining),
        severityLabel: EXPIRATION_SEVERITY_LABELS[expEval.severity],
      },
    };
  }

  private async syncLinkedExpiration(params: {
    existingLinkedId?: string | null;
    employeeId: string;
    employeeName: string;
    operationalArea: OperationalArea | null;
    contractCode: string | null;
    title: string;
    startsAt: string;
    endsAt: string | null;
    status: ContractStatus;
    alertDaysBefore: number;
    actorEmail: string;
  }): Promise<string | null> {
    if (!params.endsAt || params.status === 'DRAFT' || params.status === 'TERMINATED') {
      if (params.existingLinkedId) {
        await this.database.db
          .update(expirationRecords)
          .set({ status: 'ARCHIVED', updatedAt: new Date() })
          .where(eq(expirationRecords.id, params.existingLinkedId));
      }
      return params.existingLinkedId ?? null;
    }

    const evalRes = evaluateExpirationStatus({
      expiresAt: params.endsAt,
      status: 'ACTIVE',
      alertDaysBefore: params.alertDaysBefore,
    });

    if (params.existingLinkedId) {
      await this.database.db
        .update(expirationRecords)
        .set({
          title: params.title,
          operationalArea: params.operationalArea,
          referenceCode: params.contractCode,
          startsAt: params.startsAt,
          expiresAt: params.endsAt,
          alertDaysBefore: params.alertDaysBefore,
          status: evalRes.effectiveStatus,
          lastAlertLevelSent: null,
          lastAlertSentAt: null,
          updatedAt: new Date(),
        })
        .where(eq(expirationRecords.id, params.existingLinkedId));
      return params.existingLinkedId;
    }

    const [createdExp] = await this.database.db
      .insert(expirationRecords)
      .values({
        category: 'CONTRACT',
        title: `${params.title} — ${params.employeeName}`.slice(0, 180),
        employeeId: params.employeeId,
        operationalArea: params.operationalArea,
        referenceCode: params.contractCode,
        providerOrEntity: 'Alliance',
        startsAt: params.startsAt,
        expiresAt: params.endsAt,
        alertDaysBefore: params.alertDaysBefore,
        notifyEmployee: false,
        recipientEmails: [],
        status: evalRes.effectiveStatus,
        notes: 'Sincronizado automáticamente desde Gestión de Contratos TH.',
        createdBy: params.actorEmail,
      })
      .returning();

    return createdExp?.id ?? null;
  }

  private enrichContractRow<
    T extends {
      id: string;
      contractType: ContractType;
      status: ContractStatus;
      startsAt: string;
      endsAt: string | null;
      signedAt: string | null;
      alertDaysBefore: number;
      s3Key: string | null;
    },
  >(row: T, referenceDate: Date = new Date()) {
    const computed = this.computeContractStatusAndEvaluation(row, referenceDate);
    return {
      ...row,
      startsAt: normalizeDateOnly(row.startsAt) ?? row.startsAt,
      endsAt: normalizeDateOnly(row.endsAt),
      signedAt: normalizeDateOnly(row.signedAt),
      contractTypeLabel: CONTRACT_TYPE_LABELS[row.contractType],
      effectiveStatus: computed.effectiveStatus,
      effectiveStatusLabel: CONTRACT_STATUS_LABELS[computed.effectiveStatus],
      hasDocument: Boolean(row.s3Key),
      evaluation: computed.evaluation,
    };
  }

  async list(filters?: ContractListFilters) {
    const [contractRows, allEmployees, contractExpirations] = await Promise.all([
      this.database.db.query.employeeContracts.findMany({
        with: {
          employee: {
            columns: {
              id: true,
              fullName: true,
              nationalId: true,
              personalEmail: true,
              corporateEmail: true,
              operationalArea: true,
              jobTitle: true,
              costCenter: true,
              hireDate: true,
              terminationDate: true,
              status: true,
            },
          },
        },
        orderBy: [desc(employeeContracts.updatedAt)],
      }),
      this.database.db.query.employees.findMany({
        columns: {
          id: true,
          fullName: true,
          nationalId: true,
          personalEmail: true,
          corporateEmail: true,
          operationalArea: true,
          jobTitle: true,
          costCenter: true,
          hireDate: true,
          terminationDate: true,
          status: true,
        },
        orderBy: [asc(employees.fullName)],
      }),
      this.database.db.query.expirationRecords.findMany({
        where: eq(expirationRecords.category, 'CONTRACT'),
        with: {
          employee: {
            columns: {
              id: true,
              fullName: true,
              nationalId: true,
              operationalArea: true,
            },
          },
        },
        orderBy: [asc(expirationRecords.expiresAt)],
      }),
    ]);

    const now = new Date();
    const enrichedAll = contractRows.map((row) => this.enrichContractRow(row, now));

    const employeeIdsWithContract = new Set(enrichedAll.map((c) => c.employeeId));
    const employeesWithoutContract = allEmployees.filter(
      (emp) => !employeeIdsWithContract.has(emp.id),
    );

    const linkedExpirationIds = new Set(
      enrichedAll.map((c) => c.linkedExpirationId).filter((id): id is string => Boolean(id)),
    );
    const legacyExpirationContracts = contractExpirations
      .filter((exp) => !linkedExpirationIds.has(exp.id) && exp.status !== 'ARCHIVED')
      .map((exp) => ({
        ...exp,
        evaluation: evaluateExpirationStatus({
          expiresAt: exp.expiresAt,
          status: exp.status,
          alertDaysBefore: exp.alertDaysBefore,
          referenceDate: now,
        }),
      }));

    const kpis = {
      totalContracts: enrichedAll.length,
      activeCount: enrichedAll.filter(
        (c) => c.effectiveStatus === 'ACTIVE' || c.effectiveStatus === 'RENEWED',
      ).length,
      expiringSoonCount: enrichedAll.filter((c) => c.effectiveStatus === 'EXPIRING_SOON').length,
      expiredCount: enrichedAll.filter((c) => c.effectiveStatus === 'EXPIRED').length,
      terminatedCount: enrichedAll.filter((c) => c.effectiveStatus === 'TERMINATED').length,
      indefiniteCount: enrichedAll.filter((c) => c.contractType === 'INDEFINITE').length,
      fixedTermCount: enrichedAll.filter((c) => c.contractType === 'FIXED_TERM').length,
      withDocumentCount: enrichedAll.filter((c) => c.hasDocument).length,
      employeesWithoutContractCount: employeesWithoutContract.length,
      legacyExpirationContractsCount: legacyExpirationContracts.length,
    };

    const dateFrom = normalizeDateOnly(filters?.dateFrom);
    const dateTo = normalizeDateOnly(filters?.dateTo);
    const dateField: ContractDateField = filters?.dateField ?? 'any';

    const filtered = enrichedAll.filter((item) => {
      if (filters?.contractType && item.contractType !== filters.contractType) {
        return false;
      }
      if (filters?.status && item.effectiveStatus !== filters.status) {
        return false;
      }
      if (filters?.operationalArea) {
        const area = item.operationalArea ?? item.employee?.operationalArea;
        if (area !== filters.operationalArea) return false;
      }
      if (filters?.hasDocument !== undefined && item.hasDocument !== filters.hasDocument) {
        return false;
      }
      if (dateFrom || dateTo) {
        const fromVal = dateFrom ?? undefined;
        const toVal = dateTo ?? undefined;
        const matchesDate =
          dateField === 'startsAt'
            ? dateInRange(item.startsAt, fromVal, toVal)
            : dateField === 'endsAt'
              ? dateInRange(item.endsAt, fromVal, toVal)
              : dateField === 'signedAt'
                ? dateInRange(item.signedAt, fromVal, toVal)
                : dateInRange(item.startsAt, fromVal, toVal) ||
                  dateInRange(item.endsAt, fromVal, toVal) ||
                  dateInRange(item.signedAt, fromVal, toVal);
        if (!matchesDate) return false;
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        const haystacks = [
          item.employee?.fullName,
          item.employee?.nationalId,
          item.employee?.personalEmail,
          item.employee?.corporateEmail,
          item.contractCode,
          item.title,
          item.contractTypeLabel,
          item.jobTitle ?? item.employee?.jobTitle,
          item.costCenter ?? item.employee?.costCenter,
          item.operationalArea ?? item.employee?.operationalArea,
          item.workModality,
          item.fileName,
          item.notes,
        ];
        if (!haystacks.some((v) => v?.toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });

    const sortBy: ContractSortBy = filters?.sortBy ?? 'startsAt_desc';
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'startsAt_asc':
          return a.startsAt.localeCompare(b.startsAt);
        case 'endsAt_asc':
          return (a.endsAt ?? '9999-12-31').localeCompare(b.endsAt ?? '9999-12-31');
        case 'endsAt_desc':
          return (b.endsAt ?? '').localeCompare(a.endsAt ?? '');
        case 'name_asc':
          return (a.employee?.fullName ?? '').localeCompare(b.employee?.fullName ?? '', 'es');
        case 'updated_desc':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'startsAt_desc':
        default:
          return b.startsAt.localeCompare(a.startsAt);
      }
    });

    return {
      kpis,
      items: sorted,
      employeesWithoutContract,
      legacyExpirationContracts,
    };
  }

  async create(dto: CreateContractDto, user?: AuthenticatedUserProfile) {
    const employee = await this.database.db.query.employees.findFirst({
      where: eq(employees.id, dto.employeeId),
    });
    if (!employee) {
      throw new NotFoundException(`Colaborador ${dto.employeeId} no encontrado`);
    }

    const startsAt = normalizeDateOnly(dto.startsAt) ?? dto.startsAt;
    const endsAt = normalizeDateOnly(dto.endsAt);
    this.assertValidDateOrder(startsAt, endsAt);

    const operationalArea = dto.operationalArea ?? employee.operationalArea ?? null;
    const jobTitle = dto.jobTitle?.trim() || employee.jobTitle || null;
    const costCenter = dto.costCenter?.trim() || employee.costCenter || null;
    const contractCode = dto.contractCode?.trim() || this.buildDefaultCode(startsAt);
    const alertDaysBefore = dto.alertDaysBefore ?? 30;
    const status: ContractStatus = dto.status ?? 'ACTIVE';
    const actorEmail = user?.email ?? 'th-system';

    let linkedExpirationId: string | null = null;
    if (dto.syncExpirationAlert !== false && endsAt) {
      linkedExpirationId = await this.syncLinkedExpiration({
        employeeId: employee.id,
        employeeName: employee.fullName,
        operationalArea,
        contractCode,
        title: dto.title.trim(),
        startsAt,
        endsAt,
        status,
        alertDaysBefore,
        actorEmail,
      });
    }

    const computed = this.computeContractStatusAndEvaluation({
      contractType: dto.contractType,
      status,
      endsAt,
      alertDaysBefore,
    });

    const [created] = await this.database.db
      .insert(employeeContracts)
      .values({
        employeeId: employee.id,
        contractCode,
        title: dto.title.trim(),
        contractType: dto.contractType,
        status: computed.effectiveStatus,
        operationalArea,
        jobTitle,
        costCenter,
        workModality: dto.workModality?.trim() || null,
        salaryCop: dto.salaryCop ?? null,
        startsAt,
        endsAt,
        signedAt: normalizeDateOnly(dto.signedAt),
        alertDaysBefore,
        linkedExpirationId,
        notes: dto.notes?.trim() || null,
        createdBy: actorEmail,
      })
      .returning();

    await this.auditService.record({
      actorId: actorEmail,
      action: 'EMPLOYEE_CONTRACT_CREATED',
      entity: 'employee_contracts',
      entityId: created.id,
      newValues: {
        employeeId: employee.id,
        contractCode: created.contractCode,
        contractType: created.contractType,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
      },
    });

    return this.enrichContractRow({ ...created, employee });
  }

  async update(id: string, dto: UpdateContractDto, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.employeeContracts.findFirst({
      where: eq(employeeContracts.id, id),
      with: { employee: true },
    });
    if (!existing) {
      throw new NotFoundException(`Contrato ${id} no encontrado`);
    }

    const startsAt = dto.startsAt ? (normalizeDateOnly(dto.startsAt) ?? dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt === undefined ? existing.endsAt : normalizeDateOnly(dto.endsAt);
    this.assertValidDateOrder(startsAt, endsAt);

    const nextType = dto.contractType ?? existing.contractType;
    const nextAlertDays = dto.alertDaysBefore ?? existing.alertDaysBefore;
    const baseStatus = dto.status ?? existing.status;
    const nextTitle = dto.title !== undefined ? dto.title.trim() : existing.title;
    const nextCode =
      dto.contractCode !== undefined ? dto.contractCode.trim() || null : existing.contractCode;
    const nextArea =
      dto.operationalArea !== undefined ? dto.operationalArea : existing.operationalArea;
    const actorEmail = user?.email ?? 'th-system';

    const linkedExpirationId = await this.syncLinkedExpiration({
      existingLinkedId: existing.linkedExpirationId,
      employeeId: existing.employeeId,
      employeeName: existing.employee.fullName,
      operationalArea: nextArea,
      contractCode: nextCode,
      title: nextTitle,
      startsAt,
      endsAt,
      status: baseStatus,
      alertDaysBefore: nextAlertDays,
      actorEmail,
    });

    const computed = this.computeContractStatusAndEvaluation({
      contractType: nextType,
      status: baseStatus,
      endsAt,
      alertDaysBefore: nextAlertDays,
    });

    const [updated] = await this.database.db
      .update(employeeContracts)
      .set({
        contractCode: nextCode,
        title: nextTitle,
        contractType: nextType,
        status: computed.effectiveStatus,
        operationalArea: nextArea,
        jobTitle: dto.jobTitle !== undefined ? dto.jobTitle.trim() || null : existing.jobTitle,
        costCenter: dto.costCenter !== undefined ? dto.costCenter.trim() || null : existing.costCenter,
        workModality:
          dto.workModality !== undefined ? dto.workModality.trim() || null : existing.workModality,
        salaryCop: dto.salaryCop !== undefined ? dto.salaryCop : existing.salaryCop,
        startsAt,
        endsAt,
        signedAt: dto.signedAt === undefined ? existing.signedAt : normalizeDateOnly(dto.signedAt),
        alertDaysBefore: nextAlertDays,
        linkedExpirationId,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(employeeContracts.id, id))
      .returning();

    await this.auditService.record({
      actorId: actorEmail,
      action: 'EMPLOYEE_CONTRACT_UPDATED',
      entity: 'employee_contracts',
      entityId: id,
      oldValues: { contractCode: existing.contractCode, startsAt: existing.startsAt, endsAt: existing.endsAt },
      newValues: { contractCode: updated.contractCode, startsAt: updated.startsAt, endsAt: updated.endsAt },
    });

    return this.enrichContractRow({ ...updated, employee: existing.employee });
  }

  async renew(id: string, dto: RenewContractDto, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.employeeContracts.findFirst({
      where: eq(employeeContracts.id, id),
      with: { employee: true },
    });
    if (!existing) {
      throw new NotFoundException(`Contrato ${id} no encontrado`);
    }

    const nextType = dto.newContractType ?? existing.contractType;
    const nextEndsAt =
      nextType === 'INDEFINITE' && !dto.newEndsAt
        ? null
        : normalizeDateOnly(dto.newEndsAt) ?? existing.endsAt;
    this.assertValidDateOrder(existing.startsAt, nextEndsAt);

    const nextCode = dto.contractCode?.trim() || existing.contractCode;
    const actorEmail = user?.email ?? 'th-system';

    const linkedExpirationId = await this.syncLinkedExpiration({
      existingLinkedId: existing.linkedExpirationId,
      employeeId: existing.employeeId,
      employeeName: existing.employee.fullName,
      operationalArea: existing.operationalArea,
      contractCode: nextCode,
      title: existing.title,
      startsAt: existing.startsAt,
      endsAt: nextEndsAt,
      status: 'RENEWED',
      alertDaysBefore: existing.alertDaysBefore,
      actorEmail,
    });

    const [renewed] = await this.database.db
      .update(employeeContracts)
      .set({
        contractType: nextType,
        contractCode: nextCode,
        endsAt: nextEndsAt,
        salaryCop: dto.salaryCop !== undefined ? dto.salaryCop : existing.salaryCop,
        status: 'RENEWED',
        linkedExpirationId,
        notes: dto.notes?.trim() || existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(employeeContracts.id, id))
      .returning();

    await this.auditService.record({
      actorId: actorEmail,
      action: 'EMPLOYEE_CONTRACT_RENEWED',
      entity: 'employee_contracts',
      entityId: id,
      oldValues: { contractType: existing.contractType, endsAt: existing.endsAt },
      newValues: { contractType: renewed.contractType, endsAt: renewed.endsAt },
    });

    return this.enrichContractRow({ ...renewed, employee: existing.employee });
  }

  async terminate(id: string, dto: TerminateContractDto, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.employeeContracts.findFirst({
      where: eq(employeeContracts.id, id),
      with: { employee: true },
    });
    if (!existing) {
      throw new NotFoundException(`Contrato ${id} no encontrado`);
    }

    const nextEndsAt = normalizeDateOnly(dto.terminationDate) ?? existing.endsAt;
    this.assertValidDateOrder(existing.startsAt, nextEndsAt);
    const actorEmail = user?.email ?? 'th-system';

    await this.syncLinkedExpiration({
      existingLinkedId: existing.linkedExpirationId,
      employeeId: existing.employeeId,
      employeeName: existing.employee.fullName,
      operationalArea: existing.operationalArea,
      contractCode: existing.contractCode,
      title: existing.title,
      startsAt: existing.startsAt,
      endsAt: nextEndsAt,
      status: 'TERMINATED',
      alertDaysBefore: existing.alertDaysBefore,
      actorEmail,
    });

    const [terminated] = await this.database.db
      .update(employeeContracts)
      .set({
        status: 'TERMINATED',
        endsAt: nextEndsAt,
        notes: dto.notes?.trim() || existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(employeeContracts.id, id))
      .returning();

    await this.auditService.record({
      actorId: actorEmail,
      action: 'EMPLOYEE_CONTRACT_TERMINATED',
      entity: 'employee_contracts',
      entityId: id,
      oldValues: { status: existing.status, endsAt: existing.endsAt },
      newValues: { status: 'TERMINATED', endsAt: terminated.endsAt },
    });

    return this.enrichContractRow({ ...terminated, employee: existing.employee });
  }

  async uploadDocument(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    user?: AuthenticatedUserProfile,
  ) {
    if (!this.storageService) {
      throw new NotFoundException('StorageService no disponible.');
    }

    const existing = await this.database.db.query.employeeContracts.findFirst({
      where: eq(employeeContracts.id, id),
      with: { employee: true },
    });
    if (!existing) {
      throw new NotFoundException(`Contrato ${id} no encontrado`);
    }

    const fileName = decodeUploadedFileName(file.originalname);
    this.storageService.validateFile({
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName,
      allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
    });

    const uploaded = await this.storageService.uploadObject({
      folder: `employees/${existing.employee.nationalId}/contracts`,
      fileName,
      contentType: file.mimetype || 'application/pdf',
      body: file.buffer,
    });

    if (existing.s3Key && existing.s3Key !== uploaded.s3Key) {
      await this.storageService.deleteObject(existing.s3Key);
    }

    const [updated] = await this.database.db
      .update(employeeContracts)
      .set({
        fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        s3Key: uploaded.s3Key,
        s3Url: uploaded.publicUrl,
        updatedAt: new Date(),
      })
      .where(eq(employeeContracts.id, id))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EMPLOYEE_CONTRACT_DOCUMENT_UPLOADED',
      entity: 'employee_contracts',
      entityId: id,
      newValues: { fileName, s3Key: uploaded.s3Key },
    });

    return this.enrichContractRow({ ...updated, employee: existing.employee });
  }

  async getDocumentContent(id: string) {
    if (!this.storageService) {
      throw new NotFoundException('StorageService no disponible.');
    }

    const existing = await this.database.db.query.employeeContracts.findFirst({
      where: eq(employeeContracts.id, id),
    });
    if (!existing || !existing.s3Key) {
      throw new NotFoundException('Este contrato aún no tiene archivo PDF/soporte adjunto.');
    }

    const { buffer, contentType } = await this.storageService.getObjectBuffer(existing.s3Key, {
      sourceUrl: existing.s3Url,
    });
    return {
      buffer,
      fileName: decodeUploadedFileName(existing.fileName ?? 'contrato-alliance.pdf'),
      mimeType: existing.mimeType ?? contentType ?? 'application/pdf',
    };
  }
}
