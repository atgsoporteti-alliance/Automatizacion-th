import {
  AuthenticatedUserProfile,
  ClearanceDepartment,
  ClearanceStatus,
  EmployeeStatus,
  InternalRole,
  OperationalArea,
  UserClearanceDepartment,
  UserOperationalArea,
  WorkflowStep,
  WorkflowType,
  WorkflowUrgency,
} from '@alliance-hcm/shared';
import { createSupabaseBrowserClient } from './supabase/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export const DEV_ROLE_COOKIE = 'alliance_dev_role_email';

export interface EmployeeRecord {
  id: string;
  status: EmployeeStatus;
  fullName: string;
  preferredNameCredentials: string;
  nationalId: string;
  idIssuePlace: string;
  birthDate: string;
  birthPlace: string;
  age: number;
  maritalStatus?: string;
  address: string;
  neighborhoodCity: string;
  phone: string;
  personalEmail: string;
  corporateEmail: string | null;
  educationLevel: string;
  lastAcademicTitle: string;
  eps?: string;
  pensionFund?: string;
  severanceFund?: string;
  hasChildren?: boolean;
  childrenCount?: number;
  hasBancolombiaAccount?: boolean;
  shirtSize: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  operationalArea: OperationalArea | null;
  jobTitle: string | null;
  costCenter: string | null;
  reportingManagerEmail: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  documents?: Array<{
    id: string;
    documentType: string;
    fileName: string;
    mimeType?: string;
    s3Url: string;
    verified: boolean;
  }>;
  consentSignatures?: Array<{
    id: string;
    policyVersion: string;
    documentSha256Hash: string;
    signedAt: string;
  }>;
}

export interface ClearanceRecord {
  id: string;
  workflowId: string;
  department: ClearanceDepartment;
  status: ClearanceStatus;
  approverEmail: string | null;
  notes: string | null;
  approvedAt: string | null;
}

export interface WorkflowRecord {
  id: string;
  employeeId: string;
  flowType: WorkflowType;
  urgency: WorkflowUrgency;
  currentStep: WorkflowStep;
  helpdeskTicketId: string | null;
  helpdeskTicketStatus: string | null;
  slaDeadline: string | null;
  isOutOfSla: boolean;
  provisioningPayload?: {
    area?: OperationalArea;
    items?: string[];
    template?: string;
  };
  dsiApprovedBy: string | null;
  dsiApprovedAt: string | null;
  scheduledCutoffAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  employee: EmployeeRecord;
  clearances?: ClearanceRecord[];
}

export interface DashboardKpis {
  activeOnboardings: number;
  pendingApprovals: number;
  outOfSlaAlerts: number;
  pendingOffboardingClearances: number;
  totalWorkflows: number;
}

export interface DuplicateCheckResponse {
  exists: boolean;
  isRehire: boolean;
  conflictField: string | null;
  message: string;
  existingEmployee: {
    id: string;
    fullName: string;
    status: EmployeeStatus;
  } | null;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

export function getDevRoleEmailFromBrowser(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${DEV_ROLE_COOKIE}=`));
  if (match) {
    return decodeURIComponent(match.split('=')[1]);
  }
  try {
    return window.localStorage.getItem(DEV_ROLE_COOKIE);
  } catch {
    return null;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const supabase = createSupabaseBrowserClient();

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
        return headers;
      }
    } catch {
      // ignore session lookup failure
    }
  }

  const devEmail = getDevRoleEmailFromBrowser();
  if (devEmail) {
    headers['Authorization'] = `Bearer dev-role:${devEmail}`;
    headers['x-dev-user-email'] = devEmail;
  }

  return headers;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Error API (${response.status})`;
    try {
      const parsed = JSON.parse(body) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) {
        message = parsed.message.join(', ');
      } else if (parsed.message) {
        message = parsed.message;
      }
    } catch {
      // ignore json parse error
    }
    if (response.status === 401 && typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (!p.startsWith('/login') && !p.startsWith('/pre-ingreso')) {
        window.location.href = `/login?redirect=${encodeURIComponent(p)}`;
      }
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getMe: () => apiFetch<AuthenticatedUserProfile>('/auth/me'),
  getDevProfiles: () => apiFetch<AuthenticatedUserProfile[]>('/auth/dev-profiles'),
  getAdminUsers: () => apiFetch<AuthenticatedUserProfile[]>('/admin/users'),
  updateUserRole: (
    userId: string,
    payload: {
      role: InternalRole;
      operationalArea?: UserOperationalArea | null;
      clearanceDepartment?: UserClearanceDepartment | null;
      isActive?: boolean;
    },
  ) =>
    apiFetch<AuthenticatedUserProfile>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAuditLogs: (params?: { actorId?: string; action?: string; entity?: string }) => {
    const query = new URLSearchParams();
    if (params?.actorId) query.set('actorId', params.actorId);
    if (params?.action) query.set('action', params.action);
    if (params?.entity) query.set('entity', params.entity);
    const qs = query.toString();
    return apiFetch<AuditLogRecord[]>(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },
  getWorkflows: (params?: { flowType?: string; operationalArea?: string }) => {
    const query = new URLSearchParams();
    if (params?.flowType) query.set('flowType', params.flowType);
    if (params?.operationalArea) query.set('operationalArea', params.operationalArea);
    const qs = query.toString();
    return apiFetch<WorkflowRecord[]>(`/workflows${qs ? `?${qs}` : ''}`);
  },
  getKpis: () => apiFetch<DashboardKpis>('/workflows/kpis'),
  getEmployees: () => apiFetch<EmployeeRecord[]>('/employees'),
  checkDuplicate: (nationalId?: string, email?: string) => {
    const query = new URLSearchParams();
    if (nationalId) query.set('nationalId', nationalId);
    if (email) query.set('email', email);
    return apiFetch<DuplicateCheckResponse>(`/employees/check-duplicate?${query.toString()}`);
  },
  generateMagicLink: (payload?: {
    candidateName?: string;
    candidateEmail?: string;
    nationalId?: string;
  }) =>
    apiFetch<{ token: string; magicLink: string; expiresIn: string }>(
      '/pre-onboarding/magic-link',
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    ),
  verifyMagicLink: (token: string) =>
    apiFetch<{
      valid: boolean;
      candidateName: string;
      candidateEmail: string;
      nationalId?: string | null;
      policyVersion: string;
    }>(`/pre-onboarding/verify/${encodeURIComponent(token)}`),
  sendOtp: (email: string, phone?: string) =>
    apiFetch<{ sent: boolean; devOtp?: string }>('/pre-onboarding/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email, phone }),
    }),
  createPresignedUrl: (payload: {
    fileName: string;
    contentType: string;
    documentType: string;
    nationalId?: string;
  }) =>
    apiFetch<{ uploadUrl: string; s3Key: string; publicUrl: string }>(
      '/pre-onboarding/presigned-url',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  uploadPreOnboardingFile: async (
    file: File,
    documentType: string,
    nationalId?: string,
  ): Promise<{
    documentType: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    s3Key: string;
    s3Url: string;
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    if (nationalId) formData.append('nationalId', nationalId);

    const response = await fetch(`${API_BASE}/pre-onboarding/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error subiendo archivo (${response.status})`);
    }
    return response.json();
  },
  fetchProtectedBlob: async (
    path: string,
  ): Promise<{ blob: Blob; objectUrl: string; contentType: string }> => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`No se pudo obtener el archivo (${response.status})`);
    }

    const blob = await response.blob();
    return {
      blob,
      objectUrl: URL.createObjectURL(blob),
      contentType: response.headers.get('content-type') || blob.type || 'application/pdf',
    };
  },
  submitPreOnboarding: (payload: Record<string, unknown>) =>
    apiFetch<{
      employeeId: string;
      workflowId: string;
      isRehire: boolean;
      computedAge: number;
      consentReceipt: { documentSha256Hash: string; policyVersion: string };
    }>('/pre-onboarding/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  approveThWorkflow: (workflowId: string, payload: Record<string, unknown>) =>
    apiFetch(`/workflows/${workflowId}/approve-th`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  approveDsiWorkflow: (workflowId: string, payload: { approverEmail: string; notes?: string }) =>
    apiFetch(`/workflows/${workflowId}/approve-dsi`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelNoShow: (workflowId: string, reason: string) =>
    apiFetch(`/workflows/${workflowId}/cancel-no-show`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  simulateHelpdeskWebhook: (payload: {
    ticketId: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
    technicianEmail?: string;
    notes?: string;
  }) =>
    apiFetch('/webhooks/helpdesk', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOffboardings: () => apiFetch<WorkflowRecord[]>('/offboarding'),
  initiateOffboarding: (payload: {
    employeeId: string;
    urgency: WorkflowUrgency;
    terminationDate: string;
    reason: string;
    requestedByEmail: string;
  }) =>
    apiFetch('/offboarding/initiate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateClearance: (
    clearanceId: string,
    payload: { status: ClearanceStatus; approverEmail: string; notes?: string },
  ) =>
    apiFetch(`/offboarding/clearances/${clearanceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
