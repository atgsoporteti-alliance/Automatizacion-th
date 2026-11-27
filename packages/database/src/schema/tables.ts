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
  candidateNotificationTypeEnum,
  candidateStageEnum,
  clearanceDepartmentEnum,
  clearanceStatusEnum,
  documentTypeEnum,
  educationLevelEnum,
  employeeStatusEnum,
  evaluationRecommendationEnum,
  expirationCategoryEnum,
  expirationStatusEnum,
  maritalStatusEnum,
  meetingStatusEnum,
  operationalAreaEnum,
  shirtSizeEnum,
  timeRequestCategoryEnum,
  timeRequestStatusEnum,
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

/**
 * 8. candidate_processes — Portal de Selección y Seguimiento del Candidato
 * Visibilidad para el candidato limitada a 15 días después de que TH apruebe su contratación.
 */
export const candidateProcesses = pgTable(
  'candidate_processes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accessToken: varchar('access_token', { length: 120 }).notNull(),
    candidateName: varchar('candidate_name', { length: 150 }).notNull(),
    candidateEmail: varchar('candidate_email', { length: 150 }).notNull(),
    nationalId: varchar('national_id', { length: 30 }),
    appliedRole: varchar('applied_role', { length: 150 }),
    stage: candidateStageEnum('stage').notNull().default('REGISTERED'),

    cvFileName: varchar('cv_file_name', { length: 255 }),
    cvMimeType: varchar('cv_mime_type', { length: 120 }),
    cvFileSize: integer('cv_file_size').notNull().default(0),
    cvS3Key: varchar('cv_s3_key', { length: 500 }),
    cvS3Url: text('cv_s3_url'),
    cvUploadedAt: timestamp('cv_uploaded_at', { withTimezone: true }),

    preOnboardingToken: text('pre_onboarding_token'),
    habeasDataAcceptedAt: timestamp('habeas_data_accepted_at', { withTimezone: true }),
    habeasDataPolicyVersion: varchar('habeas_data_policy_version', { length: 40 }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    workflowId: uuid('workflow_id').references(() => onboardingOffboardingWorkflows.id, {
      onDelete: 'set null',
    }),

    hiringApprovedAt: timestamp('hiring_approved_at', { withTimezone: true }),
    candidateAccessExpiresAt: timestamp('candidate_access_expires_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_processes_access_token_uidx').on(table.accessToken),
    index('candidate_processes_email_idx').on(table.candidateEmail),
    index('candidate_processes_employee_idx').on(table.employeeId),
    index('candidate_processes_workflow_idx').on(table.workflowId),
  ],
);

/**
 * 9. candidate_meetings — Entrevistas y Reuniones del Proceso de Selección
 */
export const candidateMeetings = pgTable(
  'candidate_meetings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    processId: uuid('process_id')
      .notNull()
      .references(() => candidateProcesses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 150 }).notNull(),
    meetingType: varchar('meeting_type', { length: 60 }).notNull().default('Entrevista TH'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(45),
    meetingUrl: text('meeting_url'),
    location: varchar('location', { length: 200 }),
    interviewerName: varchar('interviewer_name', { length: 150 }),
    interviewerEmail: varchar('interviewer_email', { length: 150 }),
    operationalArea: operationalAreaEnum('operational_area'),
    status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('candidate_meetings_process_id_idx').on(table.processId),
    index('candidate_meetings_scheduled_at_idx').on(table.scheduledAt),
  ],
);

/**
 * 10. candidate_notifications — Historial de Notificaciones y Modificaciones del Registro
 */
export const candidateNotifications = pgTable(
  'candidate_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    processId: uuid('process_id')
      .notNull()
      .references(() => candidateProcesses.id, { onDelete: 'cascade' }),
    type: candidateNotificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('candidate_notifications_process_id_idx').on(table.processId),
    index('candidate_notifications_created_at_idx').on(table.createdAt),
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
export type CandidateProcess = typeof candidateProcesses.$inferSelect;
export type NewCandidateProcess = typeof candidateProcesses.$inferInsert;
export type CandidateMeeting = typeof candidateMeetings.$inferSelect;
export type CandidateNotification = typeof candidateNotifications.$inferSelect;

/**
 * 11. expiration_records — Control y Alertas de Vencimiento (Contratos, Licencias, Certificaciones)
 */
export const expirationRecords = pgTable(
  'expiration_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    category: expirationCategoryEnum('category').notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    operationalArea: operationalAreaEnum('operational_area'),
    referenceCode: varchar('reference_code', { length: 100 }),
    providerOrEntity: varchar('provider_or_entity', { length: 150 }),
    startsAt: date('starts_at'),
    expiresAt: date('expires_at').notNull(),
    alertDaysBefore: integer('alert_days_before').notNull().default(30),
    notifyEmployee: boolean('notify_employee').notNull().default(false),
    recipientEmails: jsonb('recipient_emails').$type<string[]>().notNull().default([]),
    status: expirationStatusEnum('status').notNull().default('ACTIVE'),
    lastAlertLevelSent: integer('last_alert_level_sent'),
    lastAlertSentAt: timestamp('last_alert_sent_at', { withTimezone: true }),
    renewedAt: timestamp('renewed_at', { withTimezone: true }),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('expiration_records_category_idx').on(table.category),
    index('expiration_records_status_idx').on(table.status),
    index('expiration_records_expires_at_idx').on(table.expiresAt),
    index('expiration_records_employee_idx').on(table.employeeId),
    index('expiration_records_area_idx').on(table.operationalArea),
  ],
);

export type ExpirationRecord = typeof expirationRecords.$inferSelect;
export type NewExpirationRecord = typeof expirationRecords.$inferInsert;

/**
 * 12. time_requests — Novedades Laborales (Incapacidades, Licencias, Permisos Personales y Horas Extra)
 */
export const timeRequests = pgTable(
  'time_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    operationalArea: operationalAreaEnum('operational_area'),
    category: timeRequestCategoryEnum('category').notNull(),
    subtype: varchar('subtype', { length: 80 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    status: timeRequestStatusEnum('status').notNull().default('PENDING_TH'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    startTime: varchar('start_time', { length: 10 }),
    endTime: varchar('end_time', { length: 10 }),
    daysCount: integer('days_count').notNull().default(0),
    durationMinutes: integer('duration_minutes').notNull().default(0),
    isPaid: boolean('is_paid').notNull().default(true),
    medicalEntity: varchar('medical_entity', { length: 120 }),
    diagnosisCode: varchar('diagnosis_code', { length: 40 }),
    compensationType: varchar('compensation_type', { length: 60 }),
    reason: text('reason'),
    supportFileName: varchar('support_file_name', { length: 255 }),
    supportMimeType: varchar('support_mime_type', { length: 120 }),
    supportFileSize: integer('support_file_size').notNull().default(0),
    supportS3Key: varchar('support_s3_key', { length: 500 }),
    supportS3Url: text('support_s3_url'),
    linkedExpirationId: uuid('linked_expiration_id').references(() => expirationRecords.id, {
      onDelete: 'set null',
    }),
    alertDaysBefore: integer('alert_days_before').notNull().default(7),
    pendingExpirationAlert: boolean('pending_expiration_alert').notNull().default(false),
    leaderReviewedBy: varchar('leader_reviewed_by', { length: 150 }),
    leaderReviewedAt: timestamp('leader_reviewed_at', { withTimezone: true }),
    thReviewedBy: varchar('th_reviewed_by', { length: 150 }),
    thReviewedAt: timestamp('th_reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdBy: varchar('created_by', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('time_requests_employee_idx').on(table.employeeId),
    index('time_requests_category_idx').on(table.category),
    index('time_requests_status_idx').on(table.status),
    index('time_requests_start_date_idx').on(table.startDate),
    index('time_requests_area_idx').on(table.operationalArea),
  ],
);

export type TimeRequest = typeof timeRequests.$inferSelect;
export type NewTimeRequest = typeof timeRequests.$inferInsert;

/**
 * 13. candidate_competency_evaluations — Evaluación Estructurada de Competencias (Entrevistas)
 */
export const candidateCompetencyEvaluations = pgTable(
  'candidate_competency_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    processId: uuid('process_id')
      .notNull()
      .references(() => candidateProcesses.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').references(() => candidateMeetings.id, {
      onDelete: 'set null',
    }),
    evaluatorName: varchar('evaluator_name', { length: 150 }).notNull(),
    evaluatorEmail: varchar('evaluator_email', { length: 150 }).notNull(),
    evaluatorRole: varchar('evaluator_role', { length: 60 }).notNull(),
    stageLabel: varchar('stage_label', { length: 80 }).notNull().default('Entrevista TH'),
    operationalArea: operationalAreaEnum('operational_area'),
    scores: jsonb('scores')
      .$type<
        Array<{
          key: string;
          label: string;
          score: number;
          weight?: number;
          observation?: string;
        }>
      >()
      .notNull(),
    overallScoreScaled100: integer('overall_score_scaled_100').notNull().default(0),
    recommendation: evaluationRecommendationEnum('recommendation').notNull(),
    strengths: text('strengths'),
    improvementAreas: text('improvement_areas'),
    summaryNotes: text('summary_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('competency_eval_process_idx').on(table.processId),
    index('competency_eval_meeting_idx').on(table.meetingId),
    index('competency_eval_rec_idx').on(table.recommendation),
  ],
);

export type CandidateCompetencyEvaluation = typeof candidateCompetencyEvaluations.$inferSelect;
export type NewCandidateCompetencyEvaluation = typeof candidateCompetencyEvaluations.$inferInsert;
