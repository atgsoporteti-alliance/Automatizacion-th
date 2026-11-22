import { z } from 'zod';
import {
  CLEARANCE_STATUSES,
  DOCUMENT_TYPES,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  OPERATIONAL_AREAS,
  SHIRT_SIZES,
  WORKFLOW_URGENCIES,
} from './constants';

// Paso 1: Identificación y Datos Personales
export const wizardStep1Schema = z.object({
  fullName: z.string().min(3, 'Ingresa tu nombre completo').max(150),
  preferredNameCredentials: z
    .string()
    .min(2, 'Ingresa el nombre preferido para tus credenciales')
    .max(80),
  nationalId: z
    .string()
    .regex(/^[0-9]{6,15}$/, 'La cédula debe contener entre 6 y 15 dígitos numéricos'),
  idIssuePlace: z.string().min(2, 'Ingresa el lugar de expedición').max(120),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  birthPlace: z.string().min(2, 'Ingresa el lugar de nacimiento').max(120),
  maritalStatus: z.enum(MARITAL_STATUSES, {
    errorMap: () => ({ message: 'Selecciona tu estado civil' }),
  }),
});

// Paso 2: Ubicación, Contacto y Dotación
export const wizardStep2Schema = z.object({
  address: z.string().min(5, 'Ingresa tu dirección completa').max(200),
  neighborhoodCity: z.string().min(3, 'Ingresa barrio y ciudad').max(150),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{7,20}$/, 'Ingresa un número de celular válido'),
  personalEmail: z.string().email('Ingresa un correo electrónico válido').max(150),
  hasChildren: z.boolean().default(false),
  childrenCount: z.coerce.number().int().min(0).max(20).default(0),
  shirtSize: z.enum(SHIRT_SIZES, {
    errorMap: () => ({ message: 'Selecciona tu talla de camiseta' }),
  }),
});

// Paso 3: Formación Académica
export const wizardStep3Schema = z.object({
  educationLevel: z.enum(EDUCATION_LEVELS, {
    errorMap: () => ({ message: 'Selecciona tu nivel de escolaridad' }),
  }),
  lastAcademicTitle: z.string().min(2, 'Ingresa tu último título académico').max(150),
});

// Paso 4: Seguridad Social y Banco
export const wizardStep4Schema = z.object({
  eps: z.string().min(2, 'Ingresa tu EPS').max(120),
  pensionFund: z.string().min(2, 'Ingresa tu Fondo de Pensión').max(120),
  severanceFund: z.string().min(2, 'Ingresa tu Fondo de Cesantías').max(120),
  hasBancolombiaAccount: z.boolean().default(false),
});

// Paso 5: Contacto de Emergencia + Habeas Data + Firma + OTP
export const wizardStep5Schema = z.object({
  emergencyContactName: z.string().min(3, 'Ingresa el nombre del contacto de emergencia').max(150),
  emergencyContactRelationship: z.string().min(2, 'Ingresa el parentesco').max(80),
  emergencyContactPhone: z
    .string()
    .regex(/^[0-9+\-\s]{7,20}$/, 'Ingresa un celular de emergencia válido'),
  habeasDataAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar la autorización de Ley 1581 (Habeas Data)' }),
  }),
  signatureDataUrl: z.string().min(20, 'Debes registrar tu firma digital en el recuadro'),
  otpCode: z.string().regex(/^\d{6}$/, 'Ingresa el código OTP de 6 dígitos'),
});

export const uploadedDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  s3Key: z.string().min(1),
  s3Url: z.string().min(1),
});

export const preOnboardingSubmissionSchema = wizardStep1Schema
  .merge(wizardStep2Schema)
  .merge(wizardStep3Schema)
  .merge(wizardStep4Schema)
  .merge(wizardStep5Schema)
  .extend({
    token: z.string().min(1),
    documents: z.array(uploadedDocumentSchema).optional().default([]),
  });

export const approveThWorkflowSchema = z.object({
  operationalArea: z.enum(OPERATIONAL_AREAS),
  jobTitle: z.string().min(2).max(120),
  costCenter: z.string().min(2).max(80),
  reportingManagerEmail: z.string().email(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  corporateEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

export const initiateOffboardingSchema = z.object({
  employeeId: z.string().uuid(),
  urgency: z.enum(WORKFLOW_URGENCIES),
  terminationDate: z.string(),
  reason: z.string().min(3).max(500),
  requestedByEmail: z.string().email(),
});

export const updateClearanceSchema = z.object({
  status: z.enum(CLEARANCE_STATUSES),
  approverEmail: z.string().email(),
  notes: z.string().max(500).optional(),
});

export const helpdeskWebhookSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED']),
  technicianEmail: z.string().email().optional(),
  corporateEmailAssigned: z.string().email().optional(),
  notes: z.string().max(1000).optional(),
});

export type WizardStep1Data = z.infer<typeof wizardStep1Schema>;
export type WizardStep2Data = z.infer<typeof wizardStep2Schema>;
export type WizardStep3Data = z.infer<typeof wizardStep3Schema>;
export type WizardStep4Data = z.infer<typeof wizardStep4Schema>;
export type WizardStep5Data = z.infer<typeof wizardStep5Schema>;
export type UploadedDocumentInput = z.infer<typeof uploadedDocumentSchema>;
export type PreOnboardingSubmission = z.infer<typeof preOnboardingSubmissionSchema>;
export type ApproveThWorkflowInput = z.infer<typeof approveThWorkflowSchema>;
export type InitiateOffboardingInput = z.infer<typeof initiateOffboardingSchema>;
export type UpdateClearanceInput = z.infer<typeof updateClearanceSchema>;
export type HelpdeskWebhookPayload = z.infer<typeof helpdeskWebhookSchema>;
