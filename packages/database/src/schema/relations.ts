import { relations } from 'drizzle-orm';
import {
  candidateCompetencyEvaluations,
  candidateMeetings,
  candidateNotifications,
  candidateProcesses,
  clearanceChecklists,
  dataConsentSignatures,
  employeeContracts,
  employeeDocuments,
  employees,
  expirationRecords,
  onboardingOffboardingWorkflows,
  timeRequests,
} from './tables';

export const employeesRelations = relations(employees, ({ many }) => ({
  workflows: many(onboardingOffboardingWorkflows),
  consentSignatures: many(dataConsentSignatures),
  documents: many(employeeDocuments),
  contracts: many(employeeContracts),
  candidateProcesses: many(candidateProcesses),
  expirations: many(expirationRecords),
  timeRequests: many(timeRequests),
}));

export const workflowsRelations = relations(onboardingOffboardingWorkflows, ({ one, many }) => ({
  employee: one(employees, {
    fields: [onboardingOffboardingWorkflows.employeeId],
    references: [employees.id],
  }),
  clearances: many(clearanceChecklists),
  candidateProcesses: many(candidateProcesses),
}));

export const dataConsentSignaturesRelations = relations(dataConsentSignatures, ({ one }) => ({
  employee: one(employees, {
    fields: [dataConsentSignatures.employeeId],
    references: [employees.id],
  }),
}));

export const clearanceChecklistsRelations = relations(clearanceChecklists, ({ one }) => ({
  workflow: one(onboardingOffboardingWorkflows, {
    fields: [clearanceChecklists.workflowId],
    references: [onboardingOffboardingWorkflows.id],
  }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeDocuments.employeeId],
    references: [employees.id],
  }),
}));

export const candidateProcessesRelations = relations(candidateProcesses, ({ one, many }) => ({
  employee: one(employees, {
    fields: [candidateProcesses.employeeId],
    references: [employees.id],
  }),
  workflow: one(onboardingOffboardingWorkflows, {
    fields: [candidateProcesses.workflowId],
    references: [onboardingOffboardingWorkflows.id],
  }),
  meetings: many(candidateMeetings),
  notifications: many(candidateNotifications),
  evaluations: many(candidateCompetencyEvaluations),
}));

export const candidateMeetingsRelations = relations(candidateMeetings, ({ one, many }) => ({
  process: one(candidateProcesses, {
    fields: [candidateMeetings.processId],
    references: [candidateProcesses.id],
  }),
  evaluations: many(candidateCompetencyEvaluations),
}));

export const candidateNotificationsRelations = relations(candidateNotifications, ({ one }) => ({
  process: one(candidateProcesses, {
    fields: [candidateNotifications.processId],
    references: [candidateProcesses.id],
  }),
}));

export const expirationRecordsRelations = relations(expirationRecords, ({ one }) => ({
  employee: one(employees, {
    fields: [expirationRecords.employeeId],
    references: [employees.id],
  }),
}));

export const timeRequestsRelations = relations(timeRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [timeRequests.employeeId],
    references: [employees.id],
  }),
  linkedExpiration: one(expirationRecords, {
    fields: [timeRequests.linkedExpirationId],
    references: [expirationRecords.id],
  }),
}));

export const candidateCompetencyEvaluationsRelations = relations(
  candidateCompetencyEvaluations,
  ({ one }) => ({
    process: one(candidateProcesses, {
      fields: [candidateCompetencyEvaluations.processId],
      references: [candidateProcesses.id],
    }),
    meeting: one(candidateMeetings, {
      fields: [candidateCompetencyEvaluations.meetingId],
      references: [candidateMeetings.id],
    }),
  }),
);

export const employeeContractsRelations = relations(employeeContracts, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeContracts.employeeId],
    references: [employees.id],
  }),
  linkedExpiration: one(expirationRecords, {
    fields: [employeeContracts.linkedExpirationId],
    references: [expirationRecords.id],
  }),
}));
