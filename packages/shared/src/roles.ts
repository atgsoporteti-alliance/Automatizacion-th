import { OperationalArea } from './constants';

export const SYSTEM_ROLES = [
  'CANDIDATE',
  'TH_ANALYST',
  'TH_ADMIN',
  'AREA_LEADER',
  'IT_SUPPORT',
  'CLEARANCE_APPROVER',
  'SUPER_ADMIN',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const INTERNAL_ROLES = [
  'TH_ANALYST',
  'TH_ADMIN',
  'AREA_LEADER',
  'IT_SUPPORT',
  'CLEARANCE_APPROVER',
  'SUPER_ADMIN',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const USER_OPERATIONAL_AREAS = ['CUSTOMER', 'VENTAS', 'DSI', 'ALL'] as const;
export type UserOperationalArea = (typeof USER_OPERATIONAL_AREAS)[number];

export const USER_CLEARANCE_DEPARTMENTS = ['FINANCE', 'FIXED_ASSETS'] as const;
export type UserClearanceDepartment = (typeof USER_CLEARANCE_DEPARTMENTS)[number];

export const ROLE_LABELS: Record<SystemRole, string> = {
  CANDIDATE: 'Candidato (Pre-Ingreso)',
  TH_ANALYST: 'Analista de Talento Humano',
  TH_ADMIN: 'Administrador / Líder TH',
  AREA_LEADER: 'Líder de Área Operativa',
  IT_SUPPORT: 'Soporte IT / Helpdesk',
  CLEARANCE_APPROVER: 'Aprobador Paz y Salvo (Finanzas / Activo Fijo)',
  SUPER_ADMIN: 'Super Administrador',
};

export const ROLE_HOME_ROUTES: Record<InternalRole, string> = {
  TH_ANALYST: '/dashboard/th',
  TH_ADMIN: '/dashboard/th',
  IT_SUPPORT: '/dashboard/it',
  AREA_LEADER: '/dashboard/team',
  CLEARANCE_APPROVER: '/dashboard/offboarding',
  SUPER_ADMIN: '/dashboard/th',
};

export const SENSITIVE_EMPLOYEE_FIELDS = [
  'eps',
  'pensionFund',
  'severanceFund',
  'hasBancolombiaAccount',
  'hasChildren',
  'childrenCount',
  'maritalStatus',
] as const;

export type Permission =
  | 'pre_onboarding:submit'
  | 'magic_link:generate'
  | 'employees:read_full'
  | 'employees:read_technical'
  | 'workflow:approve_th'
  | 'workflow:approve_dsi'
  | 'workflow:cancel_no_show'
  | 'offboarding:initiate_standard'
  | 'offboarding:initiate_critical'
  | 'clearance:approve_it'
  | 'clearance:approve_finance'
  | 'clearance:approve_fixed_assets'
  | 'clearance:approve_manager'
  | 'admin:manage_users'
  | 'admin:view_audit_logs';

export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  CANDIDATE: ['pre_onboarding:submit'],
  TH_ANALYST: [
    'magic_link:generate',
    'employees:read_full',
    'workflow:approve_th',
    'offboarding:initiate_standard',
  ],
  TH_ADMIN: [
    'magic_link:generate',
    'employees:read_full',
    'workflow:approve_th',
    'workflow:cancel_no_show',
    'offboarding:initiate_standard',
    'offboarding:initiate_critical',
    'admin:view_audit_logs',
  ],
  AREA_LEADER: [
    'employees:read_technical',
    'workflow:approve_dsi',
    'clearance:approve_manager',
  ],
  IT_SUPPORT: [
    'employees:read_technical',
    'clearance:approve_it',
  ],
  CLEARANCE_APPROVER: [
    'clearance:approve_finance',
    'clearance:approve_fixed_assets',
  ],
  SUPER_ADMIN: [
    'magic_link:generate',
    'employees:read_full',
    'employees:read_technical',
    'workflow:approve_th',
    'workflow:approve_dsi',
    'workflow:cancel_no_show',
    'offboarding:initiate_standard',
    'offboarding:initiate_critical',
    'clearance:approve_it',
    'clearance:approve_finance',
    'clearance:approve_fixed_assets',
    'clearance:approve_manager',
    'admin:manage_users',
    'admin:view_audit_logs',
  ],
};

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  fullName: string;
  role: InternalRole;
  operationalArea: UserOperationalArea | null;
  clearanceDepartment: UserClearanceDepartment | null;
  isActive: boolean;
}

export function hasPermission(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function shouldMaskSensitiveEmployeeData(role: InternalRole): boolean {
  return role === 'IT_SUPPORT' || role === 'AREA_LEADER';
}

export function sanitizeEmployeeForRole<T extends Record<string, unknown>>(
  employee: T,
  role: InternalRole,
): T {
  if (!shouldMaskSensitiveEmployeeData(role)) {
    return employee;
  }

  const copy: Record<string, unknown> = { ...employee };
  for (const field of SENSITIVE_EMPLOYEE_FIELDS) {
    delete copy[field];
  }
  return copy as T;
}

export function canAccessOperationalArea(
  userArea: UserOperationalArea | null,
  targetArea: OperationalArea | null,
): boolean {
  if (!userArea || userArea === 'ALL') return true;
  if (!targetArea) return true;
  return userArea === targetArea;
}
