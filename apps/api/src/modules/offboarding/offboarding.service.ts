import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, lte } from 'drizzle-orm';
import {
  clearanceChecklists,
  employees,
  onboardingOffboardingWorkflows,
} from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  canAccessOperationalArea,
  CLEARANCE_DEPARTMENTS,
  sanitizeEmployeeForRole,
} from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { InitiateOffboardingDto, UpdateClearanceDto } from './dto/offboarding.dto';

@Injectable()
export class OffboardingService {
  private readonly logger = new Logger(OffboardingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly helpdeskService: HelpdeskService,
  ) { }

  async initiateOffboarding(dto: InitiateOffboardingDto, user?: AuthenticatedUserProfile) {
    if (dto.urgency === 'CRITICAL_IMMEDIATE' && user && user.role !== 'TH_ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Solo TH_ADMIN o SUPER_ADMIN pueden ejecutar despidos inmediatos (CRITICAL_IMMEDIATE).',
      );
    }

    const employee = await this.database.db.query.employees.findFirst({
      where: eq(employees.id, dto.employeeId),
    });

    if (!employee) {
      throw new NotFoundException(`Colaborador ${dto.employeeId} no encontrado`);
    }

    // Para STANDARD el corte se programa a las 23:59 de la fecha de retiro; para CRITICAL_IMMEDIATE es ahora
    const scheduledCutoffAt =
      dto.urgency === 'CRITICAL_IMMEDIATE'
        ? new Date()
        : new Date(`${dto.terminationDate.slice(0, 10)}T23:59:00`);

    const slaDeadline =
      dto.urgency === 'CRITICAL_IMMEDIATE'
        ? new Date(Date.now() + 2 * 60 * 60 * 1000)
        : scheduledCutoffAt;

    await this.database.db
      .update(employees)
      .set({
        status: 'OFFBOARDING_PENDING',
        terminationDate: scheduledCutoffAt,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));

    const [workflow] = await this.database.db
      .insert(onboardingOffboardingWorkflows)
      .values({
        employeeId: employee.id,
        flowType: 'OFFBOARDING',
        urgency: dto.urgency,
        currentStep:
          dto.urgency === 'CRITICAL_IMMEDIATE' ? 'HELPDESK_TICKET_CREATED' : 'TH_REVIEW',
        slaDeadline,
        scheduledCutoffAt,
        provisioningPayload: {
          action: 'REVOKE_ALL_SESSIONS_AND_LICENSES',
          urgency: dto.urgency,
          reason: dto.reason,
        },
        notes: dto.reason,
      })
      .returning();

    // Crear automáticamente los 4 registros de Paz y Salvo multi-área
    const clearances = await this.database.db
      .insert(clearanceChecklists)
      .values(
        CLEARANCE_DEPARTMENTS.map((department) => ({
          workflowId: workflow.id,
          department,
          status: 'PENDING' as const,
        })),
      )
      .returning();

    let dispatchResult: unknown = null;
    if (dto.urgency === 'CRITICAL_IMMEDIATE') {
      dispatchResult = await this.helpdeskService.enqueueProvisioning({
        workflowId: workflow.id,
        employeeId: employee.id,
        employeeFullName: employee.fullName,
        nationalId: employee.nationalId,
        corporateEmail: employee.corporateEmail ?? employee.personalEmail,
        operationalArea: employee.operationalArea ?? 'CUSTOMER',
        flowType: 'OFFBOARDING',
        urgency: 'CRITICAL_IMMEDIATE',
        template: 'TPL_OFFB_CRITICAL_IMMEDIATE',
        category: 'Offboarding - Immediate Access Revocation',
        provisioningItems: [
          'Revocación INMEDIATA de sesiones Active Directory / SSO / Correo',
          'Bloqueo VPN, Git, CRM y VoIP',
          'Recolección prioritaria de hardware corporativo',
        ],
        notes: `URGENTE: ${dto.reason}`,
      });
    }

    await this.auditService.record({
      actorId: dto.requestedByEmail,
      action: `OFFBOARDING_INITIATED_${dto.urgency}`,
      entity: 'onboarding_offboarding_workflows',
      entityId: workflow.id,
      newValues: {
        employeeId: employee.id,
        urgency: dto.urgency,
        scheduledCutoffAt: scheduledCutoffAt.toISOString(),
        clearancesCreated: clearances.length,
      },
    });

    return {
      workflow,
      clearances,
      dispatchResult,
    };
  }

  async findAllOffboardings(user?: AuthenticatedUserProfile) {
    const rows = await this.database.db.query.onboardingOffboardingWorkflows.findMany({
      where: eq(onboardingOffboardingWorkflows.flowType, 'OFFBOARDING'),
      with: {
        employee: true,
        clearances: true,
      },
      orderBy: [desc(onboardingOffboardingWorkflows.createdAt)],
    });

    let result = rows.map((wf) => ({
      ...wf,
      employee: user ? sanitizeEmployeeForRole(wf.employee, user.role) : wf.employee,
    }));

    if (user?.role === 'AREA_LEADER' && user.operationalArea && user.operationalArea !== 'ALL') {
      result = result.filter((wf) =>
        canAccessOperationalArea(user.operationalArea, wf.employee.operationalArea),
      );
    }

    return result;
  }

  async updateClearance(
    clearanceId: string,
    dto: UpdateClearanceDto,
    user?: AuthenticatedUserProfile,
  ) {
    const existing = await this.database.db.query.clearanceChecklists.findFirst({
      where: eq(clearanceChecklists.id, clearanceId),
      with: {
        workflow: {
          with: {
            employee: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Registro de Paz y Salvo ${clearanceId} no encontrado`);
    }

    if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'TH_ADMIN') {
      if (user.role === 'IT_SUPPORT' && existing.department !== 'IT_HARDWARE_ACCESS') {
        throw new ForbiddenException('IT_SUPPORT solo puede firmar el ítem IT_HARDWARE_ACCESS.');
      }
      if (user.role === 'CLEARANCE_APPROVER') {
        if (
          user.clearanceDepartment &&
          existing.department !== user.clearanceDepartment
        ) {
          throw new ForbiddenException(
            `Solo puedes firmar ítems del departamento ${user.clearanceDepartment}.`,
          );
        }
        if (existing.department !== 'FINANCE' && existing.department !== 'FIXED_ASSETS') {
          throw new ForbiddenException('CLEARANCE_APPROVER solo puede firmar FINANCE o FIXED_ASSETS.');
        }
      }
      if (user.role === 'AREA_LEADER') {
        if (existing.department !== 'DIRECT_MANAGER') {
          throw new ForbiddenException('AREA_LEADER solo puede firmar el ítem DIRECT_MANAGER.');
        }
        if (
          !canAccessOperationalArea(
            user.operationalArea,
            existing.workflow.employee.operationalArea,
          )
        ) {
          throw new ForbiddenException(
            `No puedes firmar Paz y Salvo de colaboradores del área ${existing.workflow.employee.operationalArea}.`,
          );
        }
      }
    }

    const [updated] = await this.database.db
      .update(clearanceChecklists)
      .set({
        status: dto.status,
        approverEmail: dto.approverEmail,
        notes: dto.notes ?? existing.notes,
        approvedAt: dto.status === 'APPROVED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(clearanceChecklists.id, clearanceId))
      .returning();

    // Verificar si las 4 áreas ya aprobaron el Paz y Salvo
    const siblingClearances = await this.database.db
      .select()
      .from(clearanceChecklists)
      .where(eq(clearanceChecklists.workflowId, existing.workflowId));

    const allApproved =
      siblingClearances.length === CLEARANCE_DEPARTMENTS.length &&
      siblingClearances.every((c) => c.status === 'APPROVED');

    if (allApproved) {
      const [wf] = await this.database.db
        .update(onboardingOffboardingWorkflows)
        .set({
          currentStep: 'COMPLETED',
          updatedAt: new Date(),
        })
        .where(eq(onboardingOffboardingWorkflows.id, existing.workflowId))
        .returning();

      if (wf) {
        await this.database.db
          .update(employees)
          .set({
            status: 'INACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(employees.id, wf.employeeId));
      }
    }

    await this.auditService.record({
      actorId: dto.approverEmail,
      action: 'CLEARANCE_STATUS_UPDATED',
      entity: 'clearance_checklists',
      entityId: clearanceId,
      oldValues: { status: existing.status },
      newValues: { status: updated.status, department: updated.department, allApproved },
    });

    return {
      clearance: updated,
      allApproved,
    };
  }

  /**
   * Cron Job diario a las 23:59 para disparar cortes programados (STANDARD)
   */
  @Cron('59 23 * * *')
  async processScheduledStandardCutoffs() {
    const now = new Date();
    const pendingCutoffs = await this.database.db.query.onboardingOffboardingWorkflows.findMany({
      where: and(
        eq(onboardingOffboardingWorkflows.flowType, 'OFFBOARDING'),
        eq(onboardingOffboardingWorkflows.urgency, 'STANDARD'),
        eq(onboardingOffboardingWorkflows.currentStep, 'TH_REVIEW'),
        lte(onboardingOffboardingWorkflows.scheduledCutoffAt, now),
      ),
      with: { employee: true },
    });

    for (const wf of pendingCutoffs) {
      this.logger.log(`Ejecutando corte programado 23:59 para workflow ${wf.id}`);
      await this.helpdeskService.enqueueProvisioning({
        workflowId: wf.id,
        employeeId: wf.employeeId,
        employeeFullName: wf.employee.fullName,
        nationalId: wf.employee.nationalId,
        corporateEmail: wf.employee.corporateEmail ?? wf.employee.personalEmail,
        operationalArea: wf.employee.operationalArea ?? 'CUSTOMER',
        flowType: 'OFFBOARDING',
        urgency: 'STANDARD',
        template: 'TPL_OFFB_STANDARD_CUTOFF',
        category: 'Offboarding - Scheduled Access Revocation',
        provisioningItems: [
          'Revocación programada 23:59 de correo, VPN y licencias',
          'Backup de buzón corporativo y OneDrive',
        ],
        notes: wf.notes ?? 'Corte programado 23:59 ejecutado por Cron Job.',
      });
    }
  }
}
