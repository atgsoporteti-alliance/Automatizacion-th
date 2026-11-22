import { relations } from 'drizzle-orm';
import {
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
}));

export const workflowsRelations = relations(onboardingOffboardingWorkflows, ({ one, many }) => ({
  employee: one(employees, {
    fields: [onboardingOffboardingWorkflows.employeeId],
    references: [employees.id],
  }),
  clearances: many(clearanceChecklists),
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
