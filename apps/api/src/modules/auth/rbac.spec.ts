import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedUserProfile,
  sanitizeEmployeeForRole,
} from '@alliance-hcm/shared';
import { RolesGuard } from './guards/roles.guard';
import { OffboardingService } from '../offboarding/offboarding.service';
import { WorkflowsService } from '../workflows/workflows.service';

describe('RBAC Security & Data Masking', () => {
  const itSupportUser: AuthenticatedUserProfile = {
    id: 'user-it-1',
    email: 'soporte.it@alliance.com',
    fullName: 'Soporte IT',
    role: 'IT_SUPPORT',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  };

  const thAnalystUser: AuthenticatedUserProfile = {
    id: 'user-th-1',
    email: 'th.analista@alliance.com',
    fullName: 'Analista TH',
    role: 'TH_ANALYST',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  };

  const customerLeaderUser: AuthenticatedUserProfile = {
    id: 'user-leader-cust',
    email: 'lider.customer@alliance.com',
    fullName: 'Líder Customer',
    role: 'AREA_LEADER',
    operationalArea: 'CUSTOMER',
    clearanceDepartment: null,
    isActive: true,
  };

  it('RolesGuard rechaza con 403 Forbidden cuando IT_SUPPORT intenta aprobar DSI o cancelar No-Show', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false) // IS_PUBLIC_KEY
        .mockReturnValueOnce(['AREA_LEADER', 'SUPER_ADMIN']), // ROLES_KEY
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: itSupportUser }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('WorkflowsService rechaza con 403 Forbidden si un AREA_LEADER que no es de DSI intenta aprobar DSI_LEADER_APPROVAL', async () => {
    const service = new WorkflowsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.approveByDsiLeader(
        'wf-1',
        { approverEmail: customerLeaderUser.email },
        customerLeaderUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('OffboardingService rechaza con 403 Forbidden si TH_ANALYST intenta disparar un despido CRITICAL_IMMEDIATE', async () => {
    const service = new OffboardingService(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.initiateOffboarding(
        {
          employeeId: 'emp-1',
          urgency: 'CRITICAL_IMMEDIATE',
          terminationDate: '2026-11-21',
          reason: 'Terminación inmediata',
          requestedByEmail: thAnalystUser.email,
        },
        thAnalystUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sanitizeEmployeeForRole omite campos sensibles de TH para IT_SUPPORT y AREA_LEADER, pero los conserva para TH_ANALYST', () => {
    const fullEmployee = {
      id: 'emp-1',
      fullName: 'Camila Morales',
      preferredNameCredentials: 'camila.morales',
      operationalArea: 'CUSTOMER',
      eps: 'Sura EPS',
      pensionFund: 'Porvenir',
      severanceFund: 'Porvenir',
      hasBancolombiaAccount: true,
      hasChildren: true,
      childrenCount: 2,
      maritalStatus: 'CASADO',
    };

    const maskedForIt = sanitizeEmployeeForRole(fullEmployee, 'IT_SUPPORT');
    expect(maskedForIt.fullName).toBe('Camila Morales');
    expect(maskedForIt.preferredNameCredentials).toBe('camila.morales');
    expect(maskedForIt).not.toHaveProperty('eps');
    expect(maskedForIt).not.toHaveProperty('pensionFund');
    expect(maskedForIt).not.toHaveProperty('severanceFund');
    expect(maskedForIt).not.toHaveProperty('hasBancolombiaAccount');
    expect(maskedForIt).not.toHaveProperty('hasChildren');
    expect(maskedForIt).not.toHaveProperty('maritalStatus');

    const maskedForLeader = sanitizeEmployeeForRole(fullEmployee, 'AREA_LEADER');
    expect(maskedForLeader).not.toHaveProperty('eps');
    expect(maskedForLeader).not.toHaveProperty('hasBancolombiaAccount');

    const fullForTh = sanitizeEmployeeForRole(fullEmployee, 'TH_ANALYST');
    expect(fullForTh.eps).toBe('Sura EPS');
    expect(fullForTh.pensionFund).toBe('Porvenir');
    expect(fullForTh.hasBancolombiaAccount).toBe(true);
  });
});
