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
