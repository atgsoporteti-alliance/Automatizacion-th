export const EMPLOYEE_STATUSES = [
  'PRE_ONBOARDING',
  'ACTIVE',
  'OFFBOARDING_PENDING',
  'INACTIVE',
  'NO_SHOW',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const MARITAL_STATUSES = [
  'SOLTERO',
  'CASADO',
  'UNION_LIBRE',
  'DIVORCIADO',
  'VIUDO',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const EDUCATION_LEVELS = [
  'BACHILLER',
  'TECNICO',
  'TECNOLOGO',
  'PROFESIONAL',
  'ESPECIALIZACION',
  'MAESTRIA',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const OPERATIONAL_AREAS = ['CUSTOMER', 'VENTAS', 'DSI'] as const;
export type OperationalArea = (typeof OPERATIONAL_AREAS)[number];

export const WORKFLOW_TYPES = [
  'ONBOARDING',
  'OFFBOARDING',
  'INTERNAL_TRANSFER',
] as const;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export const WORKFLOW_URGENCIES = ['STANDARD', 'CRITICAL_IMMEDIATE'] as const;
export type WorkflowUrgency = (typeof WORKFLOW_URGENCIES)[number];

export const WORKFLOW_STEPS = [
  'CANDIDATE_PENDING',
  'TH_REVIEW',
  'DSI_LEADER_APPROVAL',
  'HELPDESK_TICKET_CREATED',
  'IT_PROVISIONING',
  'COMPLETED',
  'CANCELLED_NO_SHOW',
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const CLEARANCE_DEPARTMENTS = [
  'IT_HARDWARE_ACCESS',
  'FINANCE',
  'FIXED_ASSETS',
  'DIRECT_MANAGER',
] as const;
export type ClearanceDepartment = (typeof CLEARANCE_DEPARTMENTS)[number];

export const CLEARANCE_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED_WITH_DEBT',
] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'RESUME_CV',
  'NATIONAL_ID_PDF',
  'ACADEMIC_CERTIFICATE',
  'BANK_CERTIFICATE',
  'EPS_CERTIFICATE',
  'PENSION_CERTIFICATE',
  'DELIVERY_ACT',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const HABEAS_DATA_POLICY_VERSION = 'ALLIANCE-HD-2026-v1.0';

export const HABEAS_DATA_POLICY_TEXT = `AUTORIZACIÓN DE TRATAMIENTO DE DATOS PERSONALES – LEY 1581 DE 2012 (HABEAS DATA)

En cumplimiento de la Ley Estatutaria 1581 de 2012, el Decreto Reglamentario 1377 de 2013 y la Política de Tratamiento de Datos Personales de Alliance, autorizo de manera previa, expresa, informada y voluntaria a Alliance para recolectar, almacenar, usar, circular, actualizar y suprimir los datos personales suministrados en este formulario de Pre-Ingreso Digital.

Finalidades del tratamiento:
1. Gestión del proceso de vinculación laboral, contratación, afiliación al Sistema de Seguridad Social Integral (EPS, AFP, ARL, Caja de Compensación) y pagos de nómina.
2. Aprovisionamiento de identidad corporativa, licencias tecnológicas, accesos a plataformas (CRM, VoIP, VPN, Git) y control de activos fijos.
3. Contacto de emergencia, bienestar laboral y cumplimiento de obligaciones legales y auditorías internas o externas.

Declaro que la información consignada es verídica y conozco mis derechos a conocer, actualizar, rectificar y solicitar la supresión de mis datos personales ante el Oficial de Protección de Datos de Alliance.`;

export interface AreaProvisioningRule {
  area: OperationalArea;
  displayName: string;
  description: string;
  requiresDsiLeaderApproval: boolean;
  slaHours: number;
  provisioningItems: string[];
  helpdeskCategory: string;
  helpdeskTemplate: string;
}

export const AREA_PROVISIONING_RULES: Record<OperationalArea, AreaProvisioningRule> = {
  CUSTOMER: {
    area: 'CUSTOMER',
    displayName: 'Customer (Atención & Servicio)',
    description: 'Campañas de atención al cliente, soporte multicanal y experiencia.',
    requiresDsiLeaderApproval: false,
    slaHours: 24,
    provisioningItems: [
      'Correo Corporativo (@alliance.com.co)',
      'Usuario CRM Atención al Cliente',
      'Extensión VoIP + Diadema USB',
      'Permisos Base de Conocimiento',
    ],
    helpdeskCategory: 'Onboarding - Customer Operations',
    helpdeskTemplate: 'TPL_ONB_CUSTOMER_V1',
  },
  VENTAS: {
    area: 'VENTAS',
    displayName: 'Ventas (Comercial & Pipeline)',
    description: 'Equipos comerciales, captación, cierre y prospección.',
    requiresDsiLeaderApproval: false,
    slaHours: 24,
    provisioningItems: [
      'Correo Corporativo (@alliance.com.co)',
      'Licencia CRM Comercial (Pipeline)',
      'Línea Telefónica Comercial',
      'Herramientas de Prospección Comercial',
    ],
    helpdeskCategory: 'Onboarding - Commercial & Sales',
    helpdeskTemplate: 'TPL_ONB_VENTAS_V1',
  },
  DSI: {
    area: 'DSI',
    displayName: 'DSI (Dirección de Sistemas e Innovación)',
    description: 'Ingeniería, infraestructura, seguridad, datos y desarrollo.',
    requiresDsiLeaderApproval: true,
    slaHours: 48,
    provisioningItems: [
      'Correo Corporativo (@alliance.com.co)',
      'Acceso Repositorios Git (Organización Alliance)',
      'Perfil VPN Corporativa (MFA)',
      'Licencias Dev & Cloud Sandbox',
      'Hardware de Alto Rendimiento (Workstation/Laptop Pro)',
    ],
    helpdeskCategory: 'Onboarding - DSI Engineering & IT',
    helpdeskTemplate: 'TPL_ONB_DSI_V1',
  },
};

export const CLEARANCE_DEPARTMENT_LABELS: Record<ClearanceDepartment, string> = {
  IT_HARDWARE_ACCESS: 'IT — Hardware y Revocación de Accesos',
  FINANCE: 'Finanzas — Nómina, Anticipos y Viáticos',
  FIXED_ASSETS: 'Activo Fijo — Inventario y Dotación',
  DIRECT_MANAGER: 'Jefe Directo — Entrega de Cargo',
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SOLTERO: 'Soltero(a)',
  CASADO: 'Casado(a)',
  UNION_LIBRE: 'Unión Libre',
  DIVORCIADO: 'Divorciado(a)',
  VIUDO: 'Viudo(a)',
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  BACHILLER: 'Bachiller',
  TECNICO: 'Técnico',
  TECNOLOGO: 'Tecnólogo',
  PROFESIONAL: 'Profesional Universitario',
  ESPECIALIZACION: 'Especialización',
  MAESTRIA: 'Maestría',
};

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  CANDIDATE_PENDING: 'Pendiente Candidato',
  TH_REVIEW: 'Revisión TH',
  DSI_LEADER_APPROVAL: 'Aprobación Líder DSI',
  HELPDESK_TICKET_CREATED: 'Ticket Helpdesk Creado',
  IT_PROVISIONING: 'Aprovisionamiento IT',
  COMPLETED: 'Completado',
  CANCELLED_NO_SHOW: 'Cancelado (No-Show)',
};

export const CANDIDATE_STAGES = [
  'REGISTERED',
  'CV_UPLOADED',
  'IN_SELECTION',
  'PRE_ONBOARDING',
  'HIRED_APPROVED',
  'REJECTED',
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const CANDIDATE_STAGE_LABELS: Record<CandidateStage, string> = {
  REGISTERED: 'Postulado',
  CV_UPLOADED: 'Hoja de Vida Cargada',
  IN_SELECTION: 'En Selección y Entrevistas',
  PRE_ONBOARDING: 'Pre-Registro Habilitado',
  HIRED_APPROVED: 'Contratación Aprobada (TH)',
  REJECTED: 'Proceso Cerrado',
};

export const MEETING_STATUSES = [
  'SCHEDULED',
  'COMPLETED',
  'RESCHEDULED',
  'CANCELLED',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Programada',
  COMPLETED: 'Realizada',
  RESCHEDULED: 'Reprogramada',
  CANCELLED: 'Cancelada',
};

export const CANDIDATE_NOTIFICATION_TYPES = [
  'STAGE_CHANGE',
  'CV_UPLOADED',
  'MEETING',
  'PRE_ONBOARDING',
  'MODIFICATION',
  'HIRING_APPROVED',
] as const;
export type CandidateNotificationType = (typeof CANDIDATE_NOTIFICATION_TYPES)[number];

export const EXPIRATION_CATEGORIES = ['CONTRACT', 'LICENSE', 'CERTIFICATION'] as const;
export type ExpirationCategory = (typeof EXPIRATION_CATEGORIES)[number];

export const EXPIRATION_CATEGORY_LABELS: Record<ExpirationCategory, string> = {
  CONTRACT: 'Contrato',
  LICENSE: 'Licencia',
  CERTIFICATION: 'Certificación',
};

export const EXPIRATION_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'RENEWED',
  'ARCHIVED',
] as const;
export type ExpirationStatus = (typeof EXPIRATION_STATUSES)[number];

export const EXPIRATION_STATUS_LABELS: Record<ExpirationStatus, string> = {
  ACTIVE: 'Vigente',
  EXPIRING_SOON: 'Próximo a vencer',
  EXPIRED: 'Vencido',
  RENEWED: 'Renovado',
  ARCHIVED: 'Archivado',
};

export const EXPIRATION_SEVERITIES = [
  'OK',
  'UPCOMING_30',
  'WARNING_15',
  'URGENT_7',
  'EXPIRED',
] as const;
export type ExpirationSeverity = (typeof EXPIRATION_SEVERITIES)[number];

export const EXPIRATION_SEVERITY_LABELS: Record<ExpirationSeverity, string> = {
  OK: 'Al día',
  UPCOMING_30: 'Preventiva',
  WARNING_15: 'Por vencer (≤ 15d)',
  URGENT_7: 'Crítica (≤ 7d)',
  EXPIRED: 'Vencido',
};

export const EXPIRATION_ALERT_THRESHOLDS = [30, 15, 7, 0] as const;

export const TIME_REQUEST_CATEGORIES = [
  'INCAPACITY',
  'LICENSE',
  'PERSONAL_PERMISSION',
  'OVERTIME',
] as const;
export type TimeRequestCategory = (typeof TIME_REQUEST_CATEGORIES)[number];

export const TIME_REQUEST_CATEGORY_LABELS: Record<TimeRequestCategory, string> = {
  INCAPACITY: 'Incapacidad',
  LICENSE: 'Licencia',
  PERSONAL_PERMISSION: 'Permiso Personal',
  OVERTIME: 'Horas Extra',
};

export const TIME_REQUEST_STATUSES = [
  'PENDING_LEADER',
  'PENDING_TH',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type TimeRequestStatus = (typeof TIME_REQUEST_STATUSES)[number];

export const TIME_REQUEST_STATUS_LABELS: Record<TimeRequestStatus, string> = {
  PENDING_LEADER: 'Pendiente Líder',
  PENDING_TH: 'Pendiente TH',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

export const TIME_REQUEST_SUBTYPES: Record<
  TimeRequestCategory,
  Array<{ value: string; label: string; defaultPaid: boolean }>
> = {
  INCAPACITY: [
    { value: 'ENFERMEDAD_GENERAL', label: 'Enfermedad General (EPS)', defaultPaid: true },
    { value: 'ACCIDENTE_LABORAL', label: 'Accidente Laboral (ARL)', defaultPaid: true },
    { value: 'ENFERMEDAD_LABORAL', label: 'Enfermedad Laboral (ARL)', defaultPaid: true },
    { value: 'ACCIDENTE_TRANSITO', label: 'Accidente de Tránsito (SOAT)', defaultPaid: true },
    { value: 'PRORROGA', label: 'Prórroga de Incapacidad', defaultPaid: true },
  ],
  LICENSE: [
    { value: 'MATERNIDAD_PATERNIDAD', label: 'Maternidad / Paternidad', defaultPaid: true },
    { value: 'LUTO', label: 'Licencia por Luto', defaultPaid: true },
    { value: 'CALAMIDAD_DOMESTICA', label: 'Calamidad Doméstica', defaultPaid: true },
    { value: 'LICENCIA_REMUNERADA', label: 'Licencia Remunerada', defaultPaid: true },
    { value: 'LICENCIA_NO_REMUNERADA', label: 'Licencia No Remunerada', defaultPaid: false },
    { value: 'MATRIMONIO', label: 'Licencia por Matrimonio', defaultPaid: true },
  ],
  PERSONAL_PERMISSION: [
    { value: 'CITA_MEDICA', label: 'Cita Médica', defaultPaid: true },
    { value: 'DILIGENCIA_PERSONAL', label: 'Diligencia Personal', defaultPaid: false },
    { value: 'ESTUDIO', label: 'Permiso Académico / Examen', defaultPaid: true },
    { value: 'COMPENSATORIO', label: 'Uso de Día / Horas Compensatorias', defaultPaid: true },
    { value: 'CALAMIDAD_HORAS', label: 'Permiso Urgente por Horas', defaultPaid: true },
  ],
  OVERTIME: [
    { value: 'EXTRA_DIURNA', label: 'Hora Extra Diurna (+25%)', defaultPaid: true },
    { value: 'EXTRA_NOCTURNA', label: 'Hora Extra Nocturna (+75%)', defaultPaid: true },
    { value: 'EXTRA_DOMINICAL_DIURNA', label: 'Extra Dominical/Festiva Diurna (+100%)', defaultPaid: true },
    { value: 'EXTRA_DOMINICAL_NOCTURNA', label: 'Extra Dominical/Festiva Nocturna (+150%)', defaultPaid: true },
    { value: 'RECARGO_NOCTURNO', label: 'Recargo Nocturno (+35%)', defaultPaid: true },
    { value: 'COMPENSATORIO', label: 'Tiempo Compensatorio', defaultPaid: true },
  ],
};

export const OVERTIME_SURCHARGE_PERCENT: Record<string, number> = {
  EXTRA_DIURNA: 25,
  EXTRA_NOCTURNA: 75,
  EXTRA_DOMINICAL_DIURNA: 100,
  EXTRA_DOMINICAL_NOCTURNA: 150,
  RECARGO_NOCTURNO: 35,
  COMPENSATORIO: 0,
};
