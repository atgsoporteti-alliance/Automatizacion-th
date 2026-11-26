import { pgEnum } from 'drizzle-orm/pg-core';

export const employeeStatusEnum = pgEnum('employee_status', [
  'PRE_ONBOARDING',
  'ACTIVE',
  'OFFBOARDING_PENDING',
  'INACTIVE',
  'NO_SHOW',
]);

export const maritalStatusEnum = pgEnum('marital_status', [
  'SOLTERO',
  'CASADO',
  'UNION_LIBRE',
  'DIVORCIADO',
  'VIUDO',
]);

export const educationLevelEnum = pgEnum('education_level', [
  'BACHILLER',
  'TECNICO',
  'TECNOLOGO',
  'PROFESIONAL',
  'ESPECIALIZACION',
  'MAESTRIA',
]);

export const shirtSizeEnum = pgEnum('shirt_size', [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
]);

export const operationalAreaEnum = pgEnum('operational_area', [
  'CUSTOMER',
  'VENTAS',
  'DSI',
]);

export const workflowTypeEnum = pgEnum('workflow_type', [
  'ONBOARDING',
  'OFFBOARDING',
  'INTERNAL_TRANSFER',
]);

export const workflowUrgencyEnum = pgEnum('workflow_urgency', [
  'STANDARD',
  'CRITICAL_IMMEDIATE',
]);

export const workflowStepEnum = pgEnum('workflow_step', [
  'CANDIDATE_PENDING',
  'TH_REVIEW',
  'DSI_LEADER_APPROVAL',
  'HELPDESK_TICKET_CREATED',
  'IT_PROVISIONING',
  'COMPLETED',
  'CANCELLED_NO_SHOW',
]);

export const clearanceDepartmentEnum = pgEnum('clearance_department', [
  'IT_HARDWARE_ACCESS',
  'FINANCE',
  'FIXED_ASSETS',
  'DIRECT_MANAGER',
]);

export const clearanceStatusEnum = pgEnum('clearance_status', [
  'PENDING',
  'APPROVED',
  'REJECTED_WITH_DEBT',
]);

export const documentTypeEnum = pgEnum('document_type', [
  'RESUME_CV',
  'NATIONAL_ID_PDF',
  'ACADEMIC_CERTIFICATE',
  'BANK_CERTIFICATE',
  'EPS_CERTIFICATE',
  'PENSION_CERTIFICATE',
  'DELIVERY_ACT',
  'OTHER',
]);

export const userRoleEnum = pgEnum('user_role', [
  'TH_ANALYST',
  'TH_ADMIN',
  'AREA_LEADER',
  'IT_SUPPORT',
  'CLEARANCE_APPROVER',
  'SUPER_ADMIN',
]);

export const userOperationalAreaEnum = pgEnum('user_operational_area', [
  'CUSTOMER',
  'VENTAS',
  'DSI',
  'ALL',
]);

export const userClearanceDepartmentEnum = pgEnum('user_clearance_department', [
  'FINANCE',
  'FIXED_ASSETS',
]);

export const candidateStageEnum = pgEnum('candidate_stage', [
  'REGISTERED',
  'CV_UPLOADED',
  'IN_SELECTION',
  'PRE_ONBOARDING',
  'HIRED_APPROVED',
  'REJECTED',
]);

export const meetingStatusEnum = pgEnum('meeting_status', [
  'SCHEDULED',
  'COMPLETED',
  'RESCHEDULED',
  'CANCELLED',
]);

export const candidateNotificationTypeEnum = pgEnum('candidate_notification_type', [
  'STAGE_CHANGE',
  'CV_UPLOADED',
  'MEETING',
  'PRE_ONBOARDING',
  'MODIFICATION',
  'HIRING_APPROVED',
]);

export const expirationCategoryEnum = pgEnum('expiration_category', [
  'CONTRACT',
  'LICENSE',
  'CERTIFICATION',
]);

export const expirationStatusEnum = pgEnum('expiration_status', [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'RENEWED',
  'ARCHIVED',
]);
