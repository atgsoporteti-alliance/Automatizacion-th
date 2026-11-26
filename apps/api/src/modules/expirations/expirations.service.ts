import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import {
  employeeDocuments,
  employees,
  expirationRecords,
  userProfiles,
} from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  evaluateExpirationStatus,
  EXPIRATION_CATEGORY_LABELS,
  EXPIRATION_SEVERITY_LABELS,
  ExpirationCategory,
  ExpirationStatus,
  OperationalArea,
  shouldSendExpirationAlert,
} from '@alliance-hcm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { MailService } from '../../common/mail/mail.service';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import {
  CreateExpirationDto,
  RenewExpirationDto,
  UpdateExpirationDto,
} from './dto/expirations.dto';

export interface ExpirationScanDigestItem {
  recordId: string;
  title: string;
  category: ExpirationCategory;
  categoryLabel: string;
  severityLabel: string;
  daysRemaining: number;
  daysLabel: string;
  expiresAtLabel: string;
  thresholdLevel: number;
  employeeName: string | null;
  providerOrEntity: string | null;
  referenceCode: string | null;
}

function formatDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return `Vencido hace ${Math.abs(daysRemaining)} día(s)`;
  if (daysRemaining === 0) return 'Vence hoy';
  if (daysRemaining === 1) return 'Vence mañana (1 día)';
  return `Vence en ${daysRemaining} días`;
}

function formatDateLabel(dateOnly: string): string {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateOnly;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return utc.toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });
}

function normalizeRecipientEmails(emails?: string[]): string[] {
  if (!emails || emails.length === 0) return [];
  return Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
}

@Injectable()
export class ExpirationsService {
  private readonly logger = new Logger(ExpirationsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private assertCanManageCategory(
    user: AuthenticatedUserProfile | undefined,
    category: ExpirationCategory,
  ) {
    if (user?.role === 'IT_SUPPORT' && category !== 'LICENSE') {
      throw new ForbiddenException(
        'El rol IT_SUPPORT solo puede crear o modificar alertas de tipo LICENSE.',
      );
    }
  }

  private async resolveEmployeeAndArea(
    employeeId?: string | null,
    operationalArea?: OperationalArea | null,
  ): Promise<{
    employeeId: string | null;
    operationalArea: OperationalArea | null;
  }> {
    if (!employeeId) {
      return {
        employeeId: null,
        operationalArea: operationalArea ?? null,
      };
    }

    const employee = await this.database.db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
      columns: { id: true, operationalArea: true },
    });
    if (!employee) {
      throw new NotFoundException(`Colaborador ${employeeId} no encontrado`);
    }

    return {
      employeeId: employee.id,
      operationalArea: operationalArea ?? employee.operationalArea ?? null,
    };
  }

  async list(
    filters?: {
      category?: ExpirationCategory;
      status?: ExpirationStatus;
      operationalArea?: OperationalArea;
      search?: string;
      includeArchived?: boolean;
    },
    user?: AuthenticatedUserProfile,
  ) {
    const rows = await this.database.db.query.expirationRecords.findMany({
      with: {
        employee: {
          columns: {
            id: true,
            fullName: true,
            nationalId: true,
            personalEmail: true,
            corporateEmail: true,
            operationalArea: true,
            reportingManagerEmail: true,
            status: true,
          },
        },
      },
      orderBy: [asc(expirationRecords.expiresAt)],
    });

    const docsWithExpiration = await this.database.db.query.employeeDocuments.findMany({
      where: isNotNull(employeeDocuments.expirationDate),
      with: {
        employee: {
          columns: {
            id: true,
            fullName: true,
            nationalId: true,
            operationalArea: true,
            status: true,
          },
        },
      },
      orderBy: [asc(employeeDocuments.expirationDate)],
    });

    const now = new Date();
    const enrichedAll = rows
      .map((row) => {
        const evaluation = evaluateExpirationStatus({
          expiresAt: row.expiresAt,
          status: row.status,
          alertDaysBefore: row.alertDaysBefore,
          referenceDate: now,
        });
        return {
          ...row,
          evaluation: {
            ...evaluation,
            daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
            severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
          },
        };
      })
      .filter((item) => {
        if (user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
          return canAccessOperationalArea(
            user.operationalArea,
            item.operationalArea ?? item.employee?.operationalArea ?? null,
          );
        }
        return true;
      });

    const documentAlerts = docsWithExpiration
      .map((doc) => {
        const exp = doc.expirationDate!;
        const evaluation = evaluateExpirationStatus({
          expiresAt: exp,
          status: 'ACTIVE',
          alertDaysBefore: 30,
          referenceDate: now,
        });
        return {
          id: doc.id,
          employeeId: doc.employeeId,
          employeeName: doc.employee.fullName,
          nationalId: doc.employee.nationalId,
          operationalArea: doc.employee.operationalArea,
          documentType: doc.documentType,
          fileName: doc.fileName,
          expirationDate: exp,
          evaluation: {
            ...evaluation,
            daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
            severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
          },
        };
      })
      .filter((doc) => {
        if (user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
          return canAccessOperationalArea(user.operationalArea, doc.operationalArea ?? null);
        }
        return true;
      });

    const activeMonitorable = enrichedAll.filter(
      (i) => i.status !== 'ARCHIVED' && i.status !== 'RENEWED',
    );

    const kpis = {
      totalActive: activeMonitorable.length,
      expiredCount: activeMonitorable.filter((i) => i.evaluation.severity === 'EXPIRED').length,
      urgent7Count: activeMonitorable.filter((i) => i.evaluation.severity === 'URGENT_7').length,
      warning15Count: activeMonitorable.filter((i) => i.evaluation.severity === 'WARNING_15').length,
      upcoming30Count: activeMonitorable.filter((i) => i.evaluation.severity === 'UPCOMING_30').length,
      onTrackCount: activeMonitorable.filter((i) => i.evaluation.severity === 'OK').length,
      contractsCount: activeMonitorable.filter((i) => i.category === 'CONTRACT').length,
      licensesCount: activeMonitorable.filter((i) => i.category === 'LICENSE').length,
      certificationsCount: activeMonitorable.filter((i) => i.category === 'CERTIFICATION').length,
      documentsWithExpirationCount: documentAlerts.length,
    };

    const filtered = enrichedAll.filter((item) => {
      if (!filters?.includeArchived && item.status === 'ARCHIVED') {
        return false;
      }
      if (filters?.category && item.category !== filters.category) {
        return false;
      }
      if (filters?.status && item.evaluation.effectiveStatus !== filters.status) {
        return false;
      }
      if (
        filters?.operationalArea &&
        (item.operationalArea ?? item.employee?.operationalArea) !== filters.operationalArea
      ) {
        return false;
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        const haystacks = [
          item.title,
          item.referenceCode,
          item.providerOrEntity,
          item.employee?.fullName,
          item.employee?.nationalId,
          item.notes,
        ];
        if (!haystacks.some((val) => val?.toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });

    return {
      kpis,
      items: filtered,
      documentExpirations: documentAlerts,
    };
  }

  async create(dto: CreateExpirationDto, user?: AuthenticatedUserProfile) {
    this.assertCanManageCategory(user, dto.category);

    const resolved = await this.resolveEmployeeAndArea(dto.employeeId, dto.operationalArea);
    const alertDaysBefore = dto.alertDaysBefore ?? 30;
    const evaluation = evaluateExpirationStatus({
      expiresAt: dto.expiresAt,
      status: 'ACTIVE',
      alertDaysBefore,
    });
    const recipientEmails = normalizeRecipientEmails(dto.recipientEmails);

    const [created] = await this.database.db
      .insert(expirationRecords)
      .values({
        category: dto.category,
        title: dto.title.trim(),
        employeeId: resolved.employeeId,
        operationalArea: resolved.operationalArea,
        referenceCode: dto.referenceCode?.trim() || null,
        providerOrEntity: dto.providerOrEntity?.trim() || null,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt,
        alertDaysBefore,
        notifyEmployee: Boolean(dto.notifyEmployee),
        recipientEmails,
        status: evaluation.effectiveStatus,
        notes: dto.notes?.trim() || null,
        createdBy: user?.email ?? 'th-system',
      })
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EXPIRATION_RECORD_CREATED',
      entity: 'expiration_records',
      entityId: created.id,
      newValues: {
        category: created.category,
        title: created.title,
        expiresAt: created.expiresAt,
        status: created.status,
      },
    });

    return {
      ...created,
      evaluation: {
        ...evaluation,
        daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
        severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
      },
    };
  }

  async update(id: string, dto: UpdateExpirationDto, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.expirationRecords.findFirst({
      where: eq(expirationRecords.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Registro de vencimiento ${id} no encontrado`);
    }

    const nextCategory = dto.category ?? existing.category;
    this.assertCanManageCategory(user, existing.category);
    this.assertCanManageCategory(user, nextCategory);

    const resolved =
      dto.employeeId !== undefined || dto.operationalArea !== undefined
        ? await this.resolveEmployeeAndArea(
            dto.employeeId !== undefined ? dto.employeeId : existing.employeeId,
            dto.operationalArea !== undefined ? dto.operationalArea : existing.operationalArea,
          )
        : { employeeId: existing.employeeId, operationalArea: existing.operationalArea };

    const nextExpiresAt = dto.expiresAt ?? existing.expiresAt;
    const nextAlertDays = dto.alertDaysBefore ?? existing.alertDaysBefore;
    const baseStatus: ExpirationStatus =
      existing.status === 'ARCHIVED' || existing.status === 'RENEWED' ? existing.status : 'ACTIVE';

    const evaluation = evaluateExpirationStatus({
      expiresAt: nextExpiresAt,
      status: baseStatus,
      alertDaysBefore: nextAlertDays,
    });

    const dateMovedOut =
      dto.expiresAt !== undefined &&
      dto.expiresAt !== existing.expiresAt &&
      (evaluation.thresholdLevel === null ||
        (existing.lastAlertLevelSent !== null &&
          evaluation.thresholdLevel > existing.lastAlertLevelSent));

    const [updated] = await this.database.db
      .update(expirationRecords)
      .set({
        category: nextCategory,
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        employeeId: resolved.employeeId,
        operationalArea: resolved.operationalArea,
        referenceCode:
          dto.referenceCode !== undefined
            ? dto.referenceCode.trim() || null
            : existing.referenceCode,
        providerOrEntity:
          dto.providerOrEntity !== undefined
            ? dto.providerOrEntity.trim() || null
            : existing.providerOrEntity,
        startsAt: dto.startsAt !== undefined ? dto.startsAt || null : existing.startsAt,
        expiresAt: nextExpiresAt,
        alertDaysBefore: nextAlertDays,
        notifyEmployee:
          dto.notifyEmployee !== undefined ? dto.notifyEmployee : existing.notifyEmployee,
        recipientEmails:
          dto.recipientEmails !== undefined
            ? normalizeRecipientEmails(dto.recipientEmails)
            : existing.recipientEmails,
        status: evaluation.effectiveStatus,
        lastAlertLevelSent: dateMovedOut ? null : existing.lastAlertLevelSent,
        lastAlertSentAt: dateMovedOut ? null : existing.lastAlertSentAt,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(expirationRecords.id, id))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EXPIRATION_RECORD_UPDATED',
      entity: 'expiration_records',
      entityId: id,
      oldValues: {
        title: existing.title,
        expiresAt: existing.expiresAt,
        status: existing.status,
      },
      newValues: {
        title: updated.title,
        expiresAt: updated.expiresAt,
        status: updated.status,
      },
    });

    return {
      ...updated,
      evaluation: {
        ...evaluation,
        daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
        severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
      },
    };
  }

  async renew(id: string, dto: RenewExpirationDto, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.expirationRecords.findFirst({
      where: eq(expirationRecords.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Registro de vencimiento ${id} no encontrado`);
    }

    this.assertCanManageCategory(user, existing.category);

    const evaluation = evaluateExpirationStatus({
      expiresAt: dto.newExpiresAt,
      status: 'ACTIVE',
      alertDaysBefore: existing.alertDaysBefore,
    });

    if (evaluation.daysRemaining <= 0) {
      throw new BadRequestException(
        'La nueva fecha de vencimiento de renovación debe ser posterior al día de hoy.',
      );
    }

    const [renewed] = await this.database.db
      .update(expirationRecords)
      .set({
        startsAt: dto.startsAt ?? existing.expiresAt,
        expiresAt: dto.newExpiresAt,
        referenceCode:
          dto.referenceCode !== undefined
            ? dto.referenceCode.trim() || null
            : existing.referenceCode,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : existing.notes,
        status: evaluation.effectiveStatus,
        lastAlertLevelSent: null,
        lastAlertSentAt: null,
        renewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(expirationRecords.id, id))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EXPIRATION_RECORD_RENEWED',
      entity: 'expiration_records',
      entityId: id,
      oldValues: { expiresAt: existing.expiresAt, status: existing.status },
      newValues: { expiresAt: renewed.expiresAt, status: renewed.status },
    });

    return {
      ...renewed,
      evaluation: {
        ...evaluation,
        daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
        severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
      },
    };
  }

  async archive(id: string, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.expirationRecords.findFirst({
      where: eq(expirationRecords.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Registro de vencimiento ${id} no encontrado`);
    }

    this.assertCanManageCategory(user, existing.category);

    const [archived] = await this.database.db
      .update(expirationRecords)
      .set({
        status: 'ARCHIVED',
        updatedAt: new Date(),
      })
      .where(eq(expirationRecords.id, id))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EXPIRATION_RECORD_ARCHIVED',
      entity: 'expiration_records',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: 'ARCHIVED' },
    });

    return archived;
  }

  async updateDocumentExpiration(
    docId: string,
    expirationDate: string | null | undefined,
    user?: AuthenticatedUserProfile,
  ) {
    const existing = await this.database.db.query.employeeDocuments.findFirst({
      where: eq(employeeDocuments.id, docId),
    });
    if (!existing) {
      throw new NotFoundException(`Documento ${docId} no encontrado`);
    }

    const [updated] = await this.database.db
      .update(employeeDocuments)
      .set({
        expirationDate: expirationDate ?? null,
      })
      .where(eq(employeeDocuments.id, docId))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'th-system',
      action: 'EMPLOYEE_DOCUMENT_EXPIRATION_UPDATED',
      entity: 'employee_documents',
      entityId: docId,
      oldValues: { expirationDate: existing.expirationDate },
      newValues: { expirationDate: updated.expirationDate },
    });

    return updated;
  }

  /**
   * Cron diario (08:00 AM) que verifica contratos, licencias y certificaciones
   * y envía alertas por umbral (30d, 15d, 7d y vencido) sin duplicados.
   */
  @Cron('0 8 * * *')
  async runScheduledExpirationScan() {
    this.logger.log('Ejecutando verificación programada de alertas de vencimiento...');
    return this.runAlertScan('cron-expiration-scheduler');
  }

  async runAlertScan(
    actorId = 'cron-expiration-scheduler',
    options?: {
      force?: boolean;
      requestOrigin?: string;
      referenceDate?: Date;
    },
  ) {
    const now = options?.referenceDate ?? new Date();
    const activeRows = await this.database.db.query.expirationRecords.findMany({
      where: and(
        ne(expirationRecords.status, 'ARCHIVED'),
        ne(expirationRecords.status, 'RENEWED'),
      ),
      with: {
        employee: {
          columns: {
            id: true,
            fullName: true,
            personalEmail: true,
            corporateEmail: true,
            reportingManagerEmail: true,
          },
        },
      },
      orderBy: [asc(expirationRecords.expiresAt)],
    });

    const activeUsers = await this.database.db
      .select({ email: userProfiles.email, role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.isActive, true));

    const defaultThEmails = activeUsers
      .filter((u) => u.role === 'TH_ADMIN' || u.role === 'TH_ANALYST' || u.role === 'SUPER_ADMIN')
      .map((u) => u.email.trim().toLowerCase());
    const defaultItEmails = activeUsers
      .filter((u) => u.role === 'IT_SUPPORT' || u.role === 'SUPER_ADMIN')
      .map((u) => u.email.trim().toLowerCase());

    let statusUpdatedCount = 0;
    const alertsByRecipient = new Map<string, ExpirationScanDigestItem[]>();
    const triggeredRecordThresholds = new Map<string, number>();

    for (const row of activeRows) {
      const evaluation = evaluateExpirationStatus({
        expiresAt: row.expiresAt,
        status: row.status,
        alertDaysBefore: row.alertDaysBefore,
        referenceDate: now,
      });

      if (evaluation.effectiveStatus !== row.status) {
        await this.database.db
          .update(expirationRecords)
          .set({
            status: evaluation.effectiveStatus,
            updatedAt: now,
          })
          .where(eq(expirationRecords.id, row.id));
        statusUpdatedCount++;
      }

      const needsAlert = options?.force
        ? evaluation.thresholdLevel !== null
        : shouldSendExpirationAlert({
            thresholdLevel: evaluation.thresholdLevel,
            lastAlertLevelSent: row.lastAlertLevelSent,
          });

      if (!needsAlert || evaluation.thresholdLevel === null) {
        continue;
      }

      const explicitRecipients = normalizeRecipientEmails(row.recipientEmails);
      const fallbackRoleEmails =
        row.category === 'LICENSE'
          ? defaultItEmails.length > 0
            ? defaultItEmails
            : defaultThEmails
          : defaultThEmails;

      const recipients = new Set<string>(
        explicitRecipients.length > 0 ? explicitRecipients : fallbackRoleEmails,
      );

      if (explicitRecipients.length === 0 && row.employee?.reportingManagerEmail) {
        recipients.add(row.employee.reportingManagerEmail.trim().toLowerCase());
      }
      if (row.notifyEmployee && row.employee) {
        const empEmail = row.employee.corporateEmail ?? row.employee.personalEmail;
        if (empEmail) recipients.add(empEmail.trim().toLowerCase());
      }

      if (recipients.size === 0) {
        continue;
      }

      const itemPayload: ExpirationScanDigestItem = {
        recordId: row.id,
        title: row.title,
        category: row.category,
        categoryLabel: EXPIRATION_CATEGORY_LABELS[row.category],
        severityLabel: EXPIRATION_SEVERITY_LABELS[evaluation.severity],
        daysRemaining: evaluation.daysRemaining,
        daysLabel: formatDaysRemainingLabel(evaluation.daysRemaining),
        expiresAtLabel: formatDateLabel(row.expiresAt),
        thresholdLevel: evaluation.thresholdLevel,
        employeeName: row.employee?.fullName ?? null,
        providerOrEntity: row.providerOrEntity ?? null,
        referenceCode: row.referenceCode ?? null,
      };

      triggeredRecordThresholds.set(row.id, evaluation.thresholdLevel);
      for (const email of recipients) {
        const bucket = alertsByRecipient.get(email) ?? [];
        bucket.push(itemPayload);
        alertsByRecipient.set(email, bucket);
      }
    }

    const webUrl = resolveFrontendOrigin({
      configuredWebUrl: this.config.get<string>('WEB_URL'),
      requestOrigin: options?.requestOrigin,
      nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
    });
    const dashboardUrl = `${webUrl}/dashboard/vencimientos`;

    let emailsSentCount = 0;
    const dispatchedTo: Array<{ email: string; itemsCount: number; sent: boolean; reason?: string }> = [];
    const sentRecordIds = new Set<string>();

    for (const [email, items] of alertsByRecipient.entries()) {
      const res = await this.mailService?.sendExpirationAlertDigestEmail({
        to: email,
        dashboardUrl,
        items,
      });
      const sent = Boolean(res?.sent);
      if (sent) {
        emailsSentCount++;
        for (const item of items) {
          sentRecordIds.add(item.recordId);
        }
      }
      dispatchedTo.push({
        email,
        itemsCount: items.length,
        sent,
        ...(res?.reason ? { reason: res.reason } : {}),
      });
    }

    for (const recordId of sentRecordIds) {
      const threshold = triggeredRecordThresholds.get(recordId);
      if (threshold !== undefined) {
        await this.database.db
          .update(expirationRecords)
          .set({
            lastAlertLevelSent: threshold,
            lastAlertSentAt: now,
            updatedAt: now,
          })
          .where(eq(expirationRecords.id, recordId));
      }
    }

    await this.auditService.record({
      actorId,
      action: 'EXPIRATION_ALERT_SCAN_EXECUTED',
      entity: 'expiration_records',
      entityId: 'batch-scan',
      newValues: {
        checkedCount: activeRows.length,
        statusUpdatedCount,
        alertsTriggeredCount: triggeredRecordThresholds.size,
        recipientsCount: alertsByRecipient.size,
        emailsSentCount,
        force: Boolean(options?.force),
      },
    });

    return {
      checkedCount: activeRows.length,
      statusUpdatedCount,
      alertsTriggeredCount: triggeredRecordThresholds.size,
      recipientsCount: alertsByRecipient.size,
      emailsSentCount,
      dispatchedTo,
    };
  }
}
