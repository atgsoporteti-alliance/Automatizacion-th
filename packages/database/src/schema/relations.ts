import { relations } from 'drizzle-orm';
import {
  candidateMeetings,
  candidateNotifications,
  candidateProcesses,
  clearanceChecklists,
  dataConsentSignatures,
  employeeDocuments,
  employees,
  onboardingOffboardingWorkflows,
} from './tables';

export const employeesRelations = relations(employees, ({ many }) => ({
  workflows: many(onboardingOffboardingWorkflows),
  consentSignatures: many(dataConsentSignatures),
  documents: many(employeeDocuments),
  candidateProcesses: many(candidateProcesses),
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
}));

export const candidateMeetingsRelations = relations(candidateMeetings, ({ one }) => ({
  process: one(candidateProcesses, {
    fields: [candidateMeetings.processId],
    references: [candidateProcesses.id],
  }),
}));

export const candidateNotificationsRelations = relations(candidateNotifications, ({ one }) => ({
  process: one(candidateProcesses, {
    fields: [candidateNotifications.processId],
    references: [candidateProcesses.id],
  }),
}));
