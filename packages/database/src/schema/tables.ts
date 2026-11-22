import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  clearanceDepartmentEnum,
  clearanceStatusEnum,
  documentTypeEnum,
  educationLevelEnum,
  employeeStatusEnum,
  maritalStatusEnum,
  operationalAreaEnum,
  shirtSizeEnum,
  userClearanceDepartmentEnum,
  userOperationalAreaEnum,
  userRoleEnum,
  workflowStepEnum,
  workflowTypeEnum,
  workflowUrgencyEnum,
} from './enums';

/**
 * 1. employees — Expediente Digital Único (Reemplazo de Google Sheets)
 * Contiene los 24 campos exactos del formato Alliance + campos organizacionales asignados por TH.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: employeeStatusEnum('status').notNull().default('PRE_ONBOARDING'),

    // --- Los 24 campos exactos del formato Alliance ---
    fullName: varchar('full_name', { length: 150 }).notNull(),
    preferredNameCredentials: varchar('preferred_name_credentials', { length: 80 }).notNull(),
    nationalId: varchar('national_id', { length: 30 }).notNull(),
    idIssuePlace: varchar('id_issue_place', { length: 120 }).notNull(),
    birthDate: date('birth_date').notNull(),
    birthPlace: varchar('birth_place', { length: 120 }).notNull(),
    age: integer('age').notNull(),
    maritalStatus: maritalStatusEnum('marital_status').notNull(),
    address: varchar('address', { length: 200 }).notNull(),
    neighborhoodCity: varchar('neighborhood_city', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }).notNull(),
    personalEmail: varchar('personal_email', { length: 150 }).notNull(),
    corporateEmail: varchar('corporate_email', { length: 150 }),
    educationLevel: educationLevelEnum('education_level').notNull(),
    lastAcademicTitle: varchar('last_academic_title', { length: 150 }).notNull(),
    eps: varchar('eps', { length: 120 }).notNull(),
    pensionFund: varchar('pension_fund', { length: 120 }).default(''),
    severanceFund: varchar('severance_fund', { length: 120 }).default(''),
    hasChildren: boolean('has_children').notNull().default(false),
    childrenCount: integer('children_count').notNull().default(0),
    hasBancolombiaAccount: boolean('has_bancolombia_account').notNull().default(false),
    shirtSize: shirtSizeEnum('shirt_size').notNull(),
    emergencyContactName: varchar('emergency_contact_name', { length: 150 }).notNull(),
    emergencyContactRelationship: varchar('emergency_contact_relationship', { length: 80 }).notNull(),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 30 }).notNull(),

    // --- Campos Organizacionales (Asignados por TH) ---
    operationalArea: operationalAreaEnum('operational_area'),
    jobTitle: varchar('job_title', { length: 120 }),
    costCenter: varchar('cost_center', { length: 80 }),
    reportingManagerEmail: varchar('reporting_manager_email', { length: 150 }),
    hireDate: date('hire_date'),
    terminationDate: timestamp('termination_date', { withTimezone: true }),
    rehireCount: integer('rehire_count').notNull().default(0),
    customAttributes: jsonb('custom_attributes').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('employees_national_id_uidx').on(table.nationalId),
    uniqueIndex('employees_personal_email_uidx').on(table.personalEmail),
    uniqueIndex('employees_corporate_email_uidx').on(table.corporateEmail),
    index('employees_status_idx').on(table.status),
    index('employees_operational_area_idx').on(table.operationalArea),
  ],
);

/**
 * 2. onboarding_offboarding_workflows — Trazabilidad y Máquina de Estados
 */
export const onboardingOffboardingWorkflows = pgTable(
  'onboarding_offboarding_workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    flowType: workflowTypeEnum('flow_type').notNull(),
    urgency: workflowUrgencyEnum('urgency').notNull().default('STANDARD'),
    currentStep: workflowStepEnum('current_step').notNull().default('CANDIDATE_PENDING'),
    helpdeskTicketId: varchar('helpdesk_ticket_id', { length: 80 }),
    helpdeskTicketStatus: varchar('helpdesk_ticket_status', { length: 60 }),
    slaDeadline: timestamp('sla_deadline', { withTimezone: true }),
    isOutOfSla: boolean('is_out_of_sla').notNull().default(false),
    provisioningPayload: jsonb('provisioning_payload').$type<Record<string, unknown>>().default({}),
    dsiApprovedBy: varchar('dsi_approved_by', { length: 150 }),
    dsiApprovedAt: timestamp('dsi_approved_at', { withTimezone: true }),
    scheduledCutoffAt: timestamp('scheduled_cutoff_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('workflows_employee_id_idx').on(table.employeeId),
    index('workflows_flow_type_idx').on(table.flowType),
    index('workflows_current_step_idx').on(table.currentStep),
    index('workflows_helpdesk_ticket_id_idx').on(table.helpdeskTicketId),
  ],
);

/**
 * 3. data_consent_signatures — Cumplimiento Ley 1581 / Habeas Data
 */
export const dataConsentSignatures = pgTable(
  'data_consent_signatures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    policyVersion: varchar('policy_version', { length: 60 }).notNull(),
    documentSha256Hash: varchar('document_sha256_hash', { length: 128 }).notNull(),
    signatureImageUrl: text('signature_image_url').notNull(),
    signerIp: varchar('signer_ip', { length: 64 }).notNull(),
    userAgent: text('user_agent').notNull(),
    otpVerifiedAt: timestamp('otp_verified_at', { withTimezone: true }).notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('consent_employee_id_idx').on(table.employeeId)],
);

/**
 * 4. clearance_checklists — Paz y Salvo Digital Multi-Área
 */
export const clearanceChecklists = pgTable(
  'clearance_checklists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => onboardingOffboardingWorkflows.id, { onDelete: 'cascade' }),
    department: clearanceDepartmentEnum('department').notNull(),
    status: clearanceStatusEnum('status').notNull().default('PENDING'),
    approverEmail: varchar('approver_email', { length: 150 }),
    notes: text('notes'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('clearances_workflow_id_idx').on(table.workflowId),
    uniqueIndex('clearances_workflow_dept_uidx').on(table.workflowId, table.department),
  ],
);

/**
 * 5. employee_documents — Soportes almacenados en MinIO/S3
 */
export const employeeDocuments = pgTable(
  'employee_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    documentType: documentTypeEnum('document_type').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    fileSize: integer('file_size').notNull().default(0),
    s3Key: varchar('s3_key', { length: 500 }).notNull(),
    s3Url: text('s3_url').notNull(),
    verified: boolean('verified').notNull().default(false),
    expirationDate: date('expiration_date'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('documents_employee_id_idx').on(table.employeeId)],
);

/**
 * 6. audit_logs — Registro Inmutable de Auditoría
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: varchar('actor_id', { length: 150 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    entity: varchar('entity', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }).notNull(),
    oldValues: jsonb('old_values').$type<Record<string, unknown> | null>(),
    newValues: jsonb('new_values').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entity, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

/**
 * 7. user_profiles — Perfiles RBAC vinculados a auth.users de Supabase
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 150 }).notNull(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    role: userRoleEnum('role').notNull(),
    operationalArea: userOperationalAreaEnum('operational_area'),
    clearanceDepartment: userClearanceDepartmentEnum('clearance_department'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_profiles_email_uidx').on(table.email),
    index('user_profiles_role_idx').on(table.role),
  ],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Workflow = typeof onboardingOffboardingWorkflows.$inferSelect;
export type NewWorkflow = typeof onboardingOffboardingWorkflows.$inferInsert;
export type DataConsentSignature = typeof dataConsentSignatures.$inferSelect;
export type ClearanceChecklist = typeof clearanceChecklists.$inferSelect;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
