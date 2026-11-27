import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { employees, timeRequests } from '@alliance-hcm/database';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  computeDurationMinutes,
  computeInclusiveDays,
  formatDurationFromMinutes,
  OperationalArea,
  OVERTIME_SURCHARGE_PERCENT,
  TIME_REQUEST_CATEGORY_LABELS,
  TIME_REQUEST_STATUS_LABELS,
  TIME_REQUEST_SUBTYPES,
  TimeRequestCategory,
  TimeRequestStatus,
} from '@alliance-hcm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { MailService } from '../../common/mail/mail.service';
import { StorageService } from '../../common/storage/storage.service';
import { decodeUploadedFileName } from '../../common/utils/file-header.util';
import { resolveFrontendOrigin } from '../../common/utils/web-url.util';
import { ExpirationsService } from '../expirations/expirations.service';
import { CreateTimeRequestDto, ReviewTimeRequestDto } from './dto/time-requests.dto';

function resolveSubtypeInfo(category: TimeRequestCategory, subtype: string) {
  const options = TIME_REQUEST_SUBTYPES[category] ?? [];
  const matched = options.find((item) => item.value === subtype);
  return {
    label: matched?.label ?? subtype,
    defaultPaid: matched?.defaultPaid ?? true,
  };
}

function buildDurationSummary(params: {
  category: TimeRequestCategory;
  daysCount: number;
  durationMinutes: number;
}): string {
  if (params.durationMinutes > 0) {
    return formatDurationFromMinutes(params.durationMinutes);
  }
  return `${params.daysCount} día${params.daysCount === 1 ? '' : 's'}`;
}

@Injectable()
export class TimeRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly config: ConfigService,
    @Optional() private readonly expirationsService?: ExpirationsService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private assertLeaderScope(
    user: AuthenticatedUserProfile | undefined,
    targetArea: OperationalArea | null,
  ) {
    if (
      user?.role === 'AREA_LEADER' &&
      !canAccessOperationalArea(user.operationalArea, targetArea)
    ) {
      throw new ForbiddenException(
        `No puedes gestionar novedades de colaboradores del área ${targetArea ?? 'externa'}.`,
      );
    }
  }

  private isThOrAdmin(user?: AuthenticatedUserProfile): boolean {
    if (!user) return true;
    return (
      user.role === 'TH_ANALYST' ||
      user.role === 'TH_ADMIN' ||
      user.role === 'SUPER_ADMIN'
    );
  }

  private enrichRow<
    T extends {
      category: TimeRequestCategory;
      subtype: string;
      daysCount: number;
      durationMinutes: number;
    },
  >(row: T) {
    const subtypeInfo = resolveSubtypeInfo(row.category, row.subtype);
    const durationLabel = buildDurationSummary({
      category: row.category,
      daysCount: row.daysCount,
      durationMinutes: row.durationMinutes,
    });
    const surchargePercent =
      row.category === 'OVERTIME' ? (OVERTIME_SURCHARGE_PERCENT[row.subtype] ?? 0) : null;

    return {
      ...row,
      subtypeLabel: subtypeInfo.label,
      durationLabel,
      surchargePercent,
    };
  }

  async list(
    filters?: {
      category?: TimeRequestCategory;
      status?: TimeRequestStatus;
      operationalArea?: OperationalArea;
      search?: string;
    },
    user?: AuthenticatedUserProfile,
  ) {
    const rows = await this.database.db.query.timeRequests.findMany({
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
            jobTitle: true,
            status: true,
          },
        },
        linkedExpiration: {
          columns: {
            id: true,
            expiresAt: true,
            status: true,
          },
        },
      },
      orderBy: [desc(timeRequests.createdAt)],
    });

    const scopedRows = rows
      .filter((row) => {
        if (user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
          return canAccessOperationalArea(
            user.operationalArea,
            row.operationalArea ?? row.employee?.operationalArea ?? null,
          );
        }
        return true;
      })
      .map((row) => this.enrichRow(row));

    const approvedIncapacities = scopedRows.filter(
      (r) => r.category === 'INCAPACITY' && r.status === 'APPROVED',
    );
    const approvedLeavesAndPermissions = scopedRows.filter(
      (r) =>
        (r.category === 'LICENSE' || r.category === 'PERSONAL_PERMISSION') &&
        r.status === 'APPROVED',
    );
    const approvedOvertime = scopedRows.filter(
      (r) => r.category === 'OVERTIME' && r.status === 'APPROVED',
    );
    const totalOvertimeMinutes = approvedOvertime.reduce(
      (acc, r) => acc + (r.durationMinutes ?? 0),
      0,
    );

    const kpis = {
      totalCount: scopedRows.length,
      pendingCount: scopedRows.filter(
        (r) => r.status === 'PENDING_LEADER' || r.status === 'PENDING_TH',
      ).length,
      approvedIncapacitiesCount: approvedIncapacities.length,
      approvedIncapacityDays: approvedIncapacities.reduce((acc, r) => acc + (r.daysCount ?? 0), 0),
      approvedLeavesAndPermissionsCount: approvedLeavesAndPermissions.length,
      approvedOvertimeCount: approvedOvertime.length,
      approvedOvertimeMinutes: totalOvertimeMinutes,
      approvedOvertimeHoursLabel: formatDurationFromMinutes(totalOvertimeMinutes),
    };

    const filtered = scopedRows.filter((row) => {
      if (filters?.category && row.category !== filters.category) return false;
      if (filters?.status && row.status !== filters.status) return false;
      if (
        filters?.operationalArea &&
        (row.operationalArea ?? row.employee?.operationalArea) !== filters.operationalArea
      ) {
        return false;
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        const haystacks = [
          row.title,
          row.subtypeLabel,
          row.employee?.fullName,
          row.employee?.nationalId,
          row.medicalEntity,
          row.reason,
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
    };
  }

  private async maybeCreateLinkedExpiration(params: {
    requestId: string;
    category: TimeRequestCategory;
    subtypeLabel: string;
    startDate: string;
    endDate: string;
    alertDaysBefore: number;
    medicalEntity?: string | null;
    employee: {
      id: string;
      fullName: string;
      operationalArea: OperationalArea | null;
      reportingManagerEmail: string | null;
    };
    user?: AuthenticatedUserProfile;
  }) {
    if (!this.expirationsService) return null;
    if (params.category !== 'INCAPACITY' && params.category !== 'LICENSE') return null;

    const expCategory = params.category === 'INCAPACITY' ? 'CERTIFICATION' : 'LICENSE';
    const title =
      params.category === 'INCAPACITY'
        ? `Retorno / control de incapacidad: ${params.employee.fullName}`
        : `Vencimiento / retorno de licencia: ${params.employee.fullName}`;

    const createdAlert = await this.expirationsService.create(
      {
        category: expCategory,
        title,
        employeeId: params.employee.id,
        operationalArea: params.employee.operationalArea ?? undefined,
        providerOrEntity: params.medicalEntity ?? params.subtypeLabel,
        startsAt: params.startDate,
        expiresAt: params.endDate,
        alertDaysBefore: params.alertDaysBefore || 7,
        notifyEmployee: true,
        recipientEmails: params.employee.reportingManagerEmail
          ? [params.employee.reportingManagerEmail]
          : undefined,
        notes: `Generado automáticamente desde ${TIME_REQUEST_CATEGORY_LABELS[params.category]} (${params.subtypeLabel}).`,
      },
      params.user,
    );

    await this.database.db
      .update(timeRequests)
      .set({
        linkedExpirationId: createdAlert.id,
        pendingExpirationAlert: false,
        updatedAt: new Date(),
      })
      .where(eq(timeRequests.id, params.requestId));

    return createdAlert.id;
  }

  async create(dto: CreateTimeRequestDto, user?: AuthenticatedUserProfile) {
    const employee = await this.database.db.query.employees.findFirst({
      where: eq(employees.id, dto.employeeId),
      columns: {
        id: true,
        fullName: true,
        personalEmail: true,
        corporateEmail: true,
        operationalArea: true,
        reportingManagerEmail: true,
      },
    });
    if (!employee) {
      throw new NotFoundException(`Colaborador ${dto.employeeId} no encontrado`);
    }

    this.assertLeaderScope(user, employee.operationalArea ?? null);

    const endDate = dto.endDate?.trim() || dto.startDate;
    const subtypeInfo = resolveSubtypeInfo(dto.category, dto.subtype.trim());
    let daysCount = computeInclusiveDays(dto.startDate, endDate);
    let durationMinutes = 0;

    if (dto.category === 'OVERTIME') {
      durationMinutes = computeDurationMinutes(dto.startTime, dto.endTime);
      if (durationMinutes <= 0) {
        throw new BadRequestException(
          'Las horas extra requieren hora de inicio y hora de fin válidas (HH:mm).',
        );
      }
      daysCount = Math.max(1, daysCount || 1);
    } else if (dto.category === 'PERSONAL_PERMISSION' && dto.startTime && dto.endTime) {
      durationMinutes = computeDurationMinutes(dto.startTime, dto.endTime);
      if (durationMinutes <= 0) {
        throw new BadRequestException('El rango horario del permiso personal no es válido.');
      }
      daysCount = 0;
    } else if (daysCount <= 0) {
      throw new BadRequestException(
        'La fecha de finalización no puede ser anterior a la fecha inicial.',
      );
    }

    const canAutoApprove = this.isThOrAdmin(user) && Boolean(dto.autoApproveByTh);
    const now = new Date();
    const initialStatus: TimeRequestStatus = canAutoApprove ? 'APPROVED' : 'PENDING_TH';
    const wantExpirationAlert =
      Boolean(dto.createExpirationAlert) &&
      (dto.category === 'INCAPACITY' || dto.category === 'LICENSE');

    const [created] = await this.database.db
      .insert(timeRequests)
      .values({
        employeeId: employee.id,
        operationalArea: employee.operationalArea ?? null,
        category: dto.category,
        subtype: dto.subtype.trim(),
        title: dto.title.trim(),
        status: initialStatus,
        startDate: dto.startDate,
        endDate,
        startTime: dto.startTime?.trim() || null,
        endTime: dto.endTime?.trim() || null,
        daysCount,
        durationMinutes,
        isPaid: dto.isPaid ?? subtypeInfo.defaultPaid,
        medicalEntity: dto.medicalEntity?.trim() || null,
        diagnosisCode: dto.diagnosisCode?.trim() || null,
        compensationType: dto.compensationType?.trim() || null,
        reason: dto.reason?.trim() || null,
        alertDaysBefore: dto.alertDaysBefore ?? 7,
        pendingExpirationAlert: wantExpirationAlert && !canAutoApprove,
        leaderReviewedBy: user?.role === 'AREA_LEADER' ? user.email : null,
        leaderReviewedAt: user?.role === 'AREA_LEADER' ? now : null,
        thReviewedBy: canAutoApprove ? (user?.email ?? 'th-admin') : null,
        thReviewedAt: canAutoApprove ? now : null,
        createdBy: user?.email ?? 'system',
      })
      .returning();

    let linkedExpirationId: string | null = null;
    if (canAutoApprove && wantExpirationAlert) {
      linkedExpirationId = await this.maybeCreateLinkedExpiration({
        requestId: created.id,
        category: created.category,
        subtypeLabel: subtypeInfo.label,
        startDate: created.startDate,
        endDate: created.endDate,
        alertDaysBefore: created.alertDaysBefore,
        medicalEntity: created.medicalEntity,
        employee,
        user,
      });
    }

    await this.auditService.record({
      actorId: user?.email ?? 'system',
      action: 'TIME_REQUEST_CREATED',
      entity: 'time_requests',
      entityId: created.id,
      newValues: {
        employeeId: employee.id,
        category: created.category,
        subtype: created.subtype,
        status: created.status,
        daysCount: created.daysCount,
        durationMinutes: created.durationMinutes,
        linkedExpirationId,
      },
    });

    return this.enrichRow({
      ...created,
      linkedExpirationId,
      employee,
    });
  }

  async review(
    id: string,
    dto: ReviewTimeRequestDto,
    user?: AuthenticatedUserProfile,
    requestOrigin?: string,
  ) {
    const existing = await this.database.db.query.timeRequests.findFirst({
      where: eq(timeRequests.id, id),
      with: {
        employee: {
          columns: {
            id: true,
            fullName: true,
            personalEmail: true,
            corporateEmail: true,
            operationalArea: true,
            reportingManagerEmail: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Novedad ${id} no encontrada`);
    }

    this.assertLeaderScope(user, existing.operationalArea ?? existing.employee?.operationalArea ?? null);

    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('Esta novedad ya se encuentra cancelada.');
    }

    const now = new Date();
    const isTh = this.isThOrAdmin(user);
    let nextStatus: TimeRequestStatus = existing.status;
    let leaderReviewedBy = existing.leaderReviewedBy;
    let leaderReviewedAt = existing.leaderReviewedAt;
    let thReviewedBy = existing.thReviewedBy;
    let thReviewedAt = existing.thReviewedAt;

    if (dto.decision === 'CANCEL') {
      nextStatus = 'CANCELLED';
    } else if (dto.decision === 'REJECT') {
      nextStatus = 'REJECTED';
      if (isTh) {
        thReviewedBy = user?.email ?? 'th-admin';
        thReviewedAt = now;
      } else {
        leaderReviewedBy = user?.email ?? 'area-leader';
        leaderReviewedAt = now;
      }
    } else {
      // APPROVE
      if (!isTh && existing.status !== 'PENDING_LEADER') {
        throw new ForbiddenException(
          'Solo Talento Humano puede otorgar la aprobación final de esta novedad.',
        );
      }
      if (!isTh && existing.status === 'PENDING_LEADER') {
        nextStatus = 'PENDING_TH';
        leaderReviewedBy = user?.email ?? 'area-leader';
        leaderReviewedAt = now;
      } else {
        nextStatus = 'APPROVED';
        thReviewedBy = user?.email ?? 'th-admin';
        thReviewedAt = now;
      }
    }

    const [updated] = await this.database.db
      .update(timeRequests)
      .set({
        status: nextStatus,
        leaderReviewedBy,
        leaderReviewedAt,
        thReviewedBy,
        thReviewedAt,
        reviewNote: dto.note?.trim() || existing.reviewNote,
        updatedAt: now,
      })
      .where(eq(timeRequests.id, id))
      .returning();

    const subtypeInfo = resolveSubtypeInfo(updated.category, updated.subtype);
    let linkedExpirationId = updated.linkedExpirationId;

    if (
      nextStatus === 'APPROVED' &&
      !linkedExpirationId &&
      (dto.createExpirationAlert || existing.pendingExpirationAlert) &&
      existing.employee
    ) {
      linkedExpirationId = await this.maybeCreateLinkedExpiration({
        requestId: updated.id,
        category: updated.category,
        subtypeLabel: subtypeInfo.label,
        startDate: updated.startDate,
        endDate: updated.endDate,
        alertDaysBefore: updated.alertDaysBefore,
        medicalEntity: updated.medicalEntity,
        employee: existing.employee,
        user,
      });
    }

    if ((nextStatus === 'APPROVED' || nextStatus === 'REJECTED') && existing.employee) {
      const targetEmail = existing.employee.corporateEmail ?? existing.employee.personalEmail;
      if (targetEmail) {
        const webUrl = resolveFrontendOrigin({
          configuredWebUrl: this.config.get<string>('WEB_URL'),
          requestOrigin,
          nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
        });
        await this.mailService?.sendTimeRequestEmail({
          to: targetEmail,
          recipientName: existing.employee.fullName,
          employeeName: existing.employee.fullName,
          categoryLabel: TIME_REQUEST_CATEGORY_LABELS[updated.category],
          subtypeLabel: subtypeInfo.label,
          title: updated.title,
          periodLabel:
            updated.startDate === updated.endDate
              ? `${updated.startDate}${updated.startTime && updated.endTime ? ` (${updated.startTime}–${updated.endTime})` : ''}`
              : `${updated.startDate} al ${updated.endDate}`,
          durationLabel: buildDurationSummary({
            category: updated.category,
            daysCount: updated.daysCount,
            durationMinutes: updated.durationMinutes,
          }),
          statusLabel: TIME_REQUEST_STATUS_LABELS[nextStatus],
          reviewNote: updated.reviewNote,
          dashboardUrl: `${webUrl}/dashboard/novedades`,
        });
      }
    }

    await this.auditService.record({
      actorId: user?.email ?? 'system',
      action: `TIME_REQUEST_${dto.decision}`,
      entity: 'time_requests',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: nextStatus,
        reviewNote: updated.reviewNote,
        linkedExpirationId,
      },
    });

    return this.enrichRow({
      ...updated,
      linkedExpirationId,
      employee: existing.employee,
    });
  }

  async uploadSupport(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    user?: AuthenticatedUserProfile,
  ) {
    const existing = await this.database.db.query.timeRequests.findFirst({
      where: eq(timeRequests.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Novedad ${id} no encontrada`);
    }

    this.assertLeaderScope(user, existing.operationalArea ?? null);

    const fileName = decodeUploadedFileName(file.originalname);
    this.storageService.validateFile({
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName,
      allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
    });

    const uploaded = await this.storageService.uploadObject({
      folder: `time-requests/${id}`,
      fileName,
      contentType: file.mimetype || 'application/pdf',
      body: file.buffer,
    });

    if (existing.supportS3Key && existing.supportS3Key !== uploaded.s3Key) {
      await this.storageService.deleteObject(existing.supportS3Key);
    }

    const [updated] = await this.database.db
      .update(timeRequests)
      .set({
        supportFileName: fileName,
        supportMimeType: uploaded.mimeType,
        supportFileSize: uploaded.fileSize,
        supportS3Key: uploaded.s3Key,
        supportS3Url: uploaded.publicUrl,
        updatedAt: new Date(),
      })
      .where(eq(timeRequests.id, id))
      .returning();

    await this.auditService.record({
      actorId: user?.email ?? 'system',
      action: 'TIME_REQUEST_SUPPORT_UPLOADED',
      entity: 'time_requests',
      entityId: id,
      newValues: { fileName, s3Key: uploaded.s3Key },
    });

    return this.enrichRow(updated);
  }

  async getSupportContent(id: string, user?: AuthenticatedUserProfile) {
    const existing = await this.database.db.query.timeRequests.findFirst({
      where: eq(timeRequests.id, id),
    });
    if (!existing || !existing.supportS3Key) {
      throw new NotFoundException('Esta novedad no tiene archivo soporte cargado.');
    }

    this.assertLeaderScope(user, existing.operationalArea ?? null);

    const { buffer, contentType } = await this.storageService.getObjectBuffer(existing.supportS3Key, {
      sourceUrl: existing.supportS3Url,
    });
    return {
      buffer,
      fileName: decodeUploadedFileName(existing.supportFileName ?? 'soporte-novedad.pdf'),
      mimeType: existing.supportMimeType ?? contentType ?? 'application/pdf',
    };
  }
}
