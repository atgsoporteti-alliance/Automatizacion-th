import {
  AuthenticatedUserProfile,
  CandidateNotificationType,
  CandidateStage,
  CandidateVisibilityStatus,
  ClearanceDepartment,
  ClearanceStatus,
  ContractStatus,
  ContractType,
  EmployeeStatus,
  EvaluationRecommendation,
  ExpirationCategory,
  ExpirationSeverity,
  ExpirationStatus,
  InternalRole,
  MeetingStatus,
  OperationalArea,
  SystemRole,
  TimeRequestCategory,
  TimeRequestStatus,
  UserClearanceDepartment,
  UserOperationalArea,
  WorkflowStep,
  WorkflowType,
  WorkflowUrgency,
} from '@alliance-hcm/shared';
import { createSupabaseBrowserClient } from './supabase/client';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
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

export interface CandidateMeetingRecord {
  id: string;
  processId: string;
  title: string;
  meetingType: string;
  scheduledAt: string;
  durationMinutes?: number;
  meetingUrl: string | null;
  location: string | null;
  interviewerName: string | null;
  interviewerEmail?: string | null;
  operationalArea?: OperationalArea | null;
  status: MeetingStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateEvaluationSummary {
  count: number;
  averageScore: number | null;
  averagePercentage: number | null;
  latestRecommendation: EvaluationRecommendation | null;
  latestRecommendationLabel: string | null;
}

export interface CandidateCompetencyEvaluationRecord {
  id: string;
  processId: string;
  meetingId: string | null;
  evaluatorName: string;
  evaluatorEmail: string;
  evaluatorRole: string;
  stageLabel: string;
  operationalArea: OperationalArea | null;
  scores: Array<{
    key: string;
    label: string;
    score: number;
    weight?: number;
    observation?: string;
  }>;
  overallScoreScaled100: number;
  overallScore: number;
  percentageScore: number;
  recommendation: EvaluationRecommendation;
  recommendationLabel: string;
  strengths: string | null;
  improvementAreas: string | null;
  summaryNotes: string | null;
  meeting?: {
    id: string;
    title: string;
    meetingType: string;
    scheduledAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewAgendaResponse {
  kpis: {
    totalInterviews: number;
    scheduledTodayCount: number;
    upcomingCount: number;
    completedCount: number;
    evaluationsCount: number;
  };
  meetings: Array<
    CandidateMeetingRecord & {
      process?: {
        id: string;
        accessToken: string;
        candidateName: string;
        candidateEmail: string;
        nationalId: string | null;
        appliedRole: string | null;
        stage: CandidateStage;
        cvS3Key: string | null;
        cvFileName: string | null;
      } | null;
      evaluation: CandidateCompetencyEvaluationRecord | null;
      processEvaluationSummary: CandidateEvaluationSummary;
    }
  >;
  candidates: Array<{
    id: string;
    candidateName: string;
    candidateEmail: string;
    nationalId: string | null;
    appliedRole: string | null;
    stage: CandidateStage;
    stageLabel: string;
    portalUrl: string;
    hasCv: boolean;
    evaluationSummary: CandidateEvaluationSummary;
    evaluations: CandidateCompetencyEvaluationRecord[];
  }>;
}

export interface CandidateNotificationRecord {
  id: string;
  processId: string;
  type: CandidateNotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface CandidateProcessRecord {
  id: string;
  accessToken: string;
  candidateName: string;
  candidateEmail: string;
  nationalId: string | null;
  appliedRole: string | null;
  stage: CandidateStage;
  cvFileName: string | null;
  cvMimeType: string | null;
  cvFileSize: number;
  cvS3Key: string | null;
  cvS3Url: string | null;
  cvUploadedAt: string | null;
  preOnboardingToken: string | null;
  employeeId: string | null;
  workflowId: string | null;
  hiringApprovedAt: string | null;
  candidateAccessExpiresAt: string | null;
  portalUrl: string;
  preOnboardingUrl: string | null;
  visibility: CandidateVisibilityStatus;
  employee?: {
    id: string;
    fullName: string;
    nationalId: string;
    personalEmail: string;
    operationalArea: OperationalArea | null;
    status: EmployeeStatus;
  } | null;
  workflow?: {
    id: string;
    currentStep: WorkflowStep;
    helpdeskTicketId: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  meetings: CandidateMeetingRecord[];
  notifications: CandidateNotificationRecord[];
  evaluations?: CandidateCompetencyEvaluationRecord[];
  evaluationSummary?: CandidateEvaluationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCandidatePortalResponse {
  expired: boolean;
  candidateName?: string;
  appliedRole?: string | null;
  message?: string;
  visibility: CandidateVisibilityStatus;
  process?: {
    id: string;
    candidateName: string;
    candidateEmail: string;
    nationalId: string | null;
    appliedRole: string | null;
    stage: CandidateStage;
    stageLabel: string;
    habeasDataAcceptedAt?: string | null;
    habeasDataPolicyVersion?: string | null;
    cv: {
      fileName: string | null;
      mimeType: string | null;
      fileSize: number;
      uploadedAt: string | null;
    } | null;
    preOnboarding: {
      enabled: boolean;
      preOnboardingUrl: string | null;
      workflowStep: WorkflowStep | null;
      workflowStepLabel: string | null;
      correctionNote: string | null;
      submittedAt: string | null;
      updatedAt: string | null;
      documentsCount: number;
      hasHabeasDataSigned: boolean;
      operationalArea: OperationalArea | null;
    };
    meetings: CandidateMeetingRecord[];
    notifications: CandidateNotificationRecord[];
    unreadCount: number;
  };
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
  const isReadRequest = !init?.method || init.method.toUpperCase() === 'GET';
  const maxAttempts = isReadRequest ? 3 : 1;

  let response: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
      });
      break;
    } catch {
      if (attempt === maxAttempts - 1) {
        throw new Error(
          `No se pudo conectar con la API (${API_BASE}). Si estás en local, espera unos segundos a que termine de iniciar el backend en el puerto 4000; si estás en la nube, reintenta en un momento.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 800));
    }
  }

  if (!response) {
    throw new Error(`No se pudo conectar con la API (${API_BASE}).`);
  }

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
      if (!p.startsWith('/login') && !p.startsWith('/pre-ingreso') && !p.startsWith('/candidato')) {
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
    apiFetch<{
      token: string;
      magicLink: string;
      expiresIn: string;
      emailSent?: boolean;
      emailMessageId?: string;
      emailReason?: string;
    }>(
      '/pre-onboarding/magic-link',
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    ),
  verifyMagicLink: (token: string) =>
    apiFetch<{
      valid: boolean;
      isCorrection?: boolean;
      employeeId?: string;
      workflowId?: string;
      correctionNote?: string;
      candidateName: string;
      candidateEmail: string;
      nationalId?: string | null;
      policyVersion: string;
      prefillData?: Record<string, unknown>;
      existingDocuments?: Array<{
        documentType: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
        s3Key: string;
        s3Url: string;
      }>;
    }>(`/pre-onboarding/verify/${encodeURIComponent(token)}`),
  sendOtp: (email: string, phone?: string) =>
    apiFetch<{ sent: boolean; emailSent?: boolean; email?: string; devOtp?: string }>(
      '/pre-onboarding/otp/send',
      {
        method: 'POST',
        body: JSON.stringify({ email, phone }),
      },
    ),
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
      let msg = `Error subiendo archivo (${response.status})`;
      try {
        const parsed = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) msg = parsed.message.join(', ');
        else if (parsed.message) msg = parsed.message;
      } catch {
        // ignore json parse error
      }
      throw new Error(msg);
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
      const body = await response.text();
      let message = `No se pudo obtener el archivo (${response.status})`;
      try {
        const parsed = JSON.parse(body) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) {
          message = parsed.message.join(', ');
        } else if (parsed.message) {
          message = parsed.message;
        }
      } catch {
        // conservar mensaje por defecto si no es JSON
      }
      throw new Error(message);
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
  returnToCandidate: (workflowId: string, reason: string) =>
    apiFetch<{
      workflow: WorkflowRecord;
      correctionMagicLink: string;
      correctionNote: string;
    }>(`/workflows/${workflowId}/return-candidate`, {
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
  triggerHelpdeskTicket: (workflowId: string, notes?: string) =>
    apiFetch<{
      mode: 'EMAIL_AND_DB';
      isResend: boolean;
      ticketId: string;
      recipients: string[];
      emailsSentCount: number;
      workflow: WorkflowRecord;
    }>(`/workflows/${workflowId}/trigger-helpdesk`, {
      method: 'POST',
      body: JSON.stringify(notes ? { notes } : {}),
    }),
  updateItWorkflowStatus: (
    workflowId: string,
    payload: {
      status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
      corporateEmailAssigned?: string;
      notes?: string;
    },
  ) =>
    apiFetch<{
      workflowId: string;
      ticketId: string | null;
      helpdeskTicketStatus: string | null;
      currentStep: WorkflowStep;
    }>(`/workflows/${workflowId}/it-status`, {
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
  getCandidateProcesses: () =>
    apiFetch<CandidateProcessRecord[]>('/candidate-portal/processes'),
  createCandidateProcess: (payload: {
    candidateName: string;
    candidateEmail: string;
    nationalId?: string;
    appliedRole?: string;
  }) =>
    apiFetch<CandidateProcessRecord & { emailSent?: boolean }>('/candidate-portal/processes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCandidateStage: (
    processId: string,
    payload: { stage: CandidateStage; note?: string },
  ) =>
    apiFetch<CandidateProcessRecord>(`/candidate-portal/processes/${processId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  approveCandidateHiring: (processId: string, note?: string) =>
    apiFetch<CandidateProcessRecord>(`/candidate-portal/processes/${processId}/approve-hiring`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
  createCandidateMeeting: (
    processId: string,
    payload: {
      title: string;
      meetingType?: string;
      scheduledAt: string;
      durationMinutes?: number;
      meetingUrl?: string;
      location?: string;
      interviewerName?: string;
      interviewerEmail?: string;
      operationalArea?: OperationalArea;
      notes?: string;
      allowOverlap?: boolean;
    },
  ) =>
    apiFetch<CandidateMeetingRecord>(`/candidate-portal/processes/${processId}/meetings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCandidateMeeting: (
    meetingId: string,
    payload: {
      status?: MeetingStatus;
      scheduledAt?: string;
      durationMinutes?: number;
      meetingUrl?: string;
      location?: string;
      interviewerEmail?: string;
      operationalArea?: OperationalArea;
      notes?: string;
      allowOverlap?: boolean;
    },
  ) =>
    apiFetch<CandidateMeetingRecord>(`/candidate-portal/meetings/${meetingId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getInterviewsAgenda: () =>
    apiFetch<InterviewAgendaResponse>('/candidate-portal/interviews/agenda'),
  listCandidateEvaluations: (processId: string) =>
    apiFetch<{
      processId: string;
      candidateName: string;
      appliedRole: string | null;
      summary: CandidateEvaluationSummary;
      items: CandidateCompetencyEvaluationRecord[];
    }>(`/candidate-portal/processes/${processId}/evaluations`),
  createCandidateEvaluation: (
    processId: string,
    payload: {
      meetingId?: string;
      stageLabel?: string;
      operationalArea?: OperationalArea;
      scores: Array<{
        key: string;
        label: string;
        score: number;
        weight?: number;
        observation?: string;
      }>;
      recommendation: EvaluationRecommendation;
      strengths?: string;
      improvementAreas?: string;
      summaryNotes?: string;
      markMeetingCompleted?: boolean;
    },
  ) =>
    apiFetch<CandidateCompetencyEvaluationRecord>(
      `/candidate-portal/processes/${processId}/evaluations`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  enableCandidatePreOnboarding: (processId: string) =>
    apiFetch<{
      process: CandidateProcessRecord;
      preOnboardingToken: string;
      portalUrl: string;
      preOnboardingUrl: string | null;
    }>(`/candidate-portal/processes/${processId}/enable-pre-onboarding`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getPublicCandidatePortal: (token: string) =>
    apiFetch<PublicCandidatePortalResponse>(
      `/candidate-portal/public/${encodeURIComponent(token)}`,
    ),
  acceptCandidateConsent: (token: string) =>
    apiFetch<{
      accepted: boolean;
      habeasDataAcceptedAt: string;
      habeasDataPolicyVersion: string;
    }>(`/candidate-portal/public/${encodeURIComponent(token)}/consent`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  uploadCandidateCv: async (
    token: string,
    file: File,
  ): Promise<{ cvFileName: string | null; cvS3Key: string | null }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${API_BASE}/candidate-portal/public/${encodeURIComponent(token)}/cv`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      let msg = `Error subiendo hoja de vida (${response.status})`;
      try {
        const parsed = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) msg = parsed.message.join(', ');
        else if (parsed.message) msg = parsed.message;
      } catch {
        // ignore json parse error
      }
      throw new Error(msg);
    }

    return response.json();
  },
  markCandidateNotificationsRead: (token: string) =>
    apiFetch<{ marked: number }>(
      `/candidate-portal/public/${encodeURIComponent(token)}/notifications/read`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  createAdminUser: (payload: {
    fullName: string;
    email: string;
    role: SystemRole;
    operationalArea?: UserOperationalArea | null;
    clearanceDepartment?: UserClearanceDepartment | null;
    appliedRole?: string;
    nationalId?: string;
    password?: string;
    isActive?: boolean;
  }) =>
    apiFetch<
      | {
          kind: 'CANDIDATE';
          candidateProcess: CandidateProcessRecord & { emailSent?: boolean };
          authCreated: boolean;
        }
      | {
          kind: 'INTERNAL';
          user: AuthenticatedUserProfile;
          authCreated: boolean;
          authWarning?: string;
        }
    >('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getExpirations: (filters?: {
    category?: ExpirationCategory;
    status?: ExpirationStatus;
    operationalArea?: OperationalArea;
    search?: string;
    includeArchived?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.operationalArea) params.set('operationalArea', filters.operationalArea);
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    if (filters?.includeArchived) params.set('includeArchived', '1');
    const qs = params.toString();
    return apiFetch<ExpirationListResponse>(`/expirations${qs ? `?${qs}` : ''}`);
  },
  createExpiration: (payload: {
    category: ExpirationCategory;
    title: string;
    employeeId?: string;
    operationalArea?: OperationalArea;
    referenceCode?: string;
    providerOrEntity?: string;
    startsAt?: string;
    expiresAt: string;
    alertDaysBefore?: number;
    notifyEmployee?: boolean;
    recipientEmails?: string[];
    notes?: string;
  }) =>
    apiFetch<ExpirationRecordItem>('/expirations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateExpiration: (
    id: string,
    payload: {
      category?: ExpirationCategory;
      title?: string;
      employeeId?: string | null;
      operationalArea?: OperationalArea | null;
      referenceCode?: string;
      providerOrEntity?: string;
      startsAt?: string;
      expiresAt?: string;
      alertDaysBefore?: number;
      notifyEmployee?: boolean;
      recipientEmails?: string[];
      notes?: string;
    },
  ) =>
    apiFetch<ExpirationRecordItem>(`/expirations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  renewExpiration: (
    id: string,
    payload: {
      newExpiresAt: string;
      startsAt?: string;
      referenceCode?: string;
      notes?: string;
    },
  ) =>
    apiFetch<ExpirationRecordItem>(`/expirations/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  archiveExpiration: (id: string) =>
    apiFetch<ExpirationRecordItem>(`/expirations/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  updateDocumentExpiration: (docId: string, expirationDate: string | null) =>
    apiFetch<{ id: string; expirationDate: string | null }>(
      `/expirations/documents/${docId}/expiration`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expirationDate }),
      },
    ),
  runExpirationScan: (force?: boolean) =>
    apiFetch<ExpirationScanResult>(`/expirations/scan${force ? '?force=1' : ''}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getTimeRequests: (filters?: {
    category?: TimeRequestCategory;
    status?: TimeRequestStatus;
    operationalArea?: OperationalArea;
    search?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.operationalArea) params.set('operationalArea', filters.operationalArea);
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return apiFetch<TimeRequestListResponse>(`/time-requests${qs ? `?${qs}` : ''}`);
  },
  createTimeRequest: (payload: {
    employeeId: string;
    category: TimeRequestCategory;
    subtype: string;
    title: string;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    isPaid?: boolean;
    medicalEntity?: string;
    diagnosisCode?: string;
    compensationType?: string;
    reason?: string;
    createExpirationAlert?: boolean;
    alertDaysBefore?: number;
    autoApproveByTh?: boolean;
  }) =>
    apiFetch<TimeRequestItem>('/time-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewTimeRequest: (
    id: string,
    payload: {
      decision: 'APPROVE' | 'REJECT' | 'CANCEL';
      note?: string;
      createExpirationAlert?: boolean;
    },
  ) =>
    apiFetch<TimeRequestItem>(`/time-requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadTimeRequestSupport: async (id: string, file: File): Promise<TimeRequestItem> => {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/time-requests/${id}/support`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      let msg = `Error subiendo soporte (${response.status})`;
      try {
        const parsed = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) msg = parsed.message.join(', ');
        else if (parsed.message) msg = parsed.message;
      } catch {
        // ignore json parse error
      }
      throw new Error(msg);
    }

    return response.json();
  },
  getContracts: (filters?: {
    search?: string;
    contractType?: ContractType;
    status?: ContractStatus;
    operationalArea?: OperationalArea;
    dateField?: 'startsAt' | 'endsAt' | 'signedAt' | 'any';
    dateFrom?: string;
    dateTo?: string;
    hasDocument?: boolean;
    sortBy?: 'startsAt_desc' | 'startsAt_asc' | 'endsAt_asc' | 'endsAt_desc' | 'name_asc' | 'updated_desc';
  }) => {
    const params = new URLSearchParams();
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    if (filters?.contractType) params.set('contractType', filters.contractType);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.operationalArea) params.set('operationalArea', filters.operationalArea);
    if (filters?.dateField) params.set('dateField', filters.dateField);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.hasDocument !== undefined) params.set('hasDocument', String(filters.hasDocument));
    if (filters?.sortBy) params.set('sortBy', filters.sortBy);
    const qs = params.toString();
    return apiFetch<ContractListResponse>(`/contracts${qs ? `?${qs}` : ''}`);
  },
  createContract: (payload: {
    employeeId: string;
    contractCode?: string;
    title: string;
    contractType: ContractType;
    status?: ContractStatus;
    operationalArea?: OperationalArea;
    jobTitle?: string;
    costCenter?: string;
    workModality?: string;
    salaryCop?: number;
    startsAt: string;
    endsAt?: string;
    signedAt?: string;
    alertDaysBefore?: number;
    syncExpirationAlert?: boolean;
    notes?: string;
  }) =>
    apiFetch<ContractItem>('/contracts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateContract: (
    id: string,
    payload: {
      contractCode?: string;
      title?: string;
      contractType?: ContractType;
      status?: ContractStatus;
      operationalArea?: OperationalArea;
      jobTitle?: string;
      costCenter?: string;
      workModality?: string;
      salaryCop?: number | null;
      startsAt?: string;
      endsAt?: string | null;
      signedAt?: string | null;
      alertDaysBefore?: number;
      notes?: string;
    },
  ) =>
    apiFetch<ContractItem>(`/contracts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  renewContract: (
    id: string,
    payload: {
      newEndsAt?: string;
      newContractType?: ContractType;
      contractCode?: string;
      salaryCop?: number;
      notes?: string;
    },
  ) =>
    apiFetch<ContractItem>(`/contracts/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  terminateContract: (id: string, payload: { terminationDate?: string; notes?: string }) =>
    apiFetch<ContractItem>(`/contracts/${id}/terminate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadContractDocument: async (id: string, file: File): Promise<ContractItem> => {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/contracts/${id}/document`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      let msg = `Error subiendo PDF del contrato (${response.status})`;
      try {
        const parsed = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(parsed.message)) msg = parsed.message.join(', ');
        else if (parsed.message) msg = parsed.message;
      } catch {
        // conservar mensaje por defecto
      }
      throw new Error(msg);
    }

    return response.json();
  },
};

export interface ContractItem {
  id: string;
  employeeId: string;
  contractCode: string | null;
  title: string;
  contractType: ContractType;
  contractTypeLabel: string;
  status: ContractStatus;
  effectiveStatus: ContractStatus;
  effectiveStatusLabel: string;
  operationalArea: OperationalArea | null;
  jobTitle: string | null;
  costCenter: string | null;
  workModality: string | null;
  salaryCop: number | null;
  startsAt: string;
  endsAt: string | null;
  signedAt: string | null;
  alertDaysBefore: number;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number;
  s3Key: string | null;
  s3Url: string | null;
  hasDocument: boolean;
  linkedExpirationId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    fullName: string;
    nationalId: string;
    personalEmail: string;
    corporateEmail: string | null;
    operationalArea: OperationalArea | null;
    jobTitle: string | null;
    costCenter: string | null;
    hireDate: string | null;
    terminationDate: string | null;
    status: EmployeeStatus;
  } | null;
  evaluation: {
    daysRemaining: number | null;
    severity: ExpirationSeverity;
    daysLabel: string;
    severityLabel: string;
  };
}

export interface EmployeeWithoutContractSummary {
  id: string;
  fullName: string;
  nationalId: string;
  personalEmail: string;
  corporateEmail: string | null;
  operationalArea: OperationalArea | null;
  jobTitle: string | null;
  costCenter: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  status: EmployeeStatus;
}

export interface ContractListResponse {
  kpis: {
    totalContracts: number;
    activeCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    terminatedCount: number;
    indefiniteCount: number;
    fixedTermCount: number;
    withDocumentCount: number;
    employeesWithoutContractCount: number;
    legacyExpirationContractsCount: number;
  };
  items: ContractItem[];
  employeesWithoutContract: EmployeeWithoutContractSummary[];
  legacyExpirationContracts: ExpirationRecordItem[];
}

export interface TimeRequestItem {
  id: string;
  employeeId: string;
  operationalArea: OperationalArea | null;
  category: TimeRequestCategory;
  subtype: string;
  subtypeLabel: string;
  title: string;
  status: TimeRequestStatus;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  daysCount: number;
  durationMinutes: number;
  durationLabel: string;
  surchargePercent: number | null;
  isPaid: boolean;
  medicalEntity: string | null;
  diagnosisCode: string | null;
  compensationType: string | null;
  reason: string | null;
  supportFileName: string | null;
  supportMimeType: string | null;
  supportFileSize: number;
  supportS3Key: string | null;
  supportS3Url: string | null;
  linkedExpirationId: string | null;
  alertDaysBefore: number;
  pendingExpirationAlert: boolean;
  leaderReviewedBy: string | null;
  leaderReviewedAt: string | null;
  thReviewedBy: string | null;
  thReviewedAt: string | null;
  reviewNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    fullName: string;
    nationalId: string;
    personalEmail: string;
    corporateEmail: string | null;
    operationalArea: OperationalArea | null;
    reportingManagerEmail: string | null;
    jobTitle: string | null;
    status: EmployeeStatus;
  } | null;
  linkedExpiration?: {
    id: string;
    expiresAt: string;
    status: ExpirationStatus;
  } | null;
}

export interface TimeRequestListResponse {
  kpis: {
    totalCount: number;
    pendingCount: number;
    approvedIncapacitiesCount: number;
    approvedIncapacityDays: number;
    approvedLeavesAndPermissionsCount: number;
    approvedOvertimeCount: number;
    approvedOvertimeMinutes: number;
    approvedOvertimeHoursLabel: string;
  };
  items: TimeRequestItem[];
}

export interface ExpirationEvaluationSummary {
  daysRemaining: number;
  severity: ExpirationSeverity;
  effectiveStatus: ExpirationStatus;
  thresholdLevel: number | null;
  daysLabel: string;
  severityLabel: string;
}

export interface ExpirationRecordItem {
  id: string;
  category: ExpirationCategory;
  title: string;
  employeeId: string | null;
  operationalArea: OperationalArea | null;
  referenceCode: string | null;
  providerOrEntity: string | null;
  startsAt: string | null;
  expiresAt: string;
  alertDaysBefore: number;
  notifyEmployee: boolean;
  recipientEmails: string[];
  status: ExpirationStatus;
  lastAlertLevelSent: number | null;
  lastAlertSentAt: string | null;
  renewedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    fullName: string;
    nationalId: string;
    personalEmail: string;
    corporateEmail: string | null;
    operationalArea: OperationalArea | null;
    reportingManagerEmail: string | null;
    status: EmployeeStatus;
  } | null;
  evaluation: ExpirationEvaluationSummary;
}

export interface ExpirationDocumentAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  nationalId: string;
  operationalArea: OperationalArea | null;
  documentType: string;
  fileName: string;
  expirationDate: string;
  evaluation: ExpirationEvaluationSummary;
}

export interface ExpirationListResponse {
  kpis: {
    totalActive: number;
    expiredCount: number;
    urgent7Count: number;
    warning15Count: number;
    upcoming30Count: number;
    onTrackCount: number;
    contractsCount: number;
    licensesCount: number;
    certificationsCount: number;
    documentsWithExpirationCount: number;
  };
  items: ExpirationRecordItem[];
  documentExpirations: ExpirationDocumentAlert[];
}

export interface ExpirationScanResult {
  checkedCount: number;
  statusUpdatedCount: number;
  alertsTriggeredCount: number;
  recipientsCount: number;
  emailsSentCount: number;
  dispatchedTo: Array<{
    email: string;
    itemsCount: number;
    sent: boolean;
    reason?: string;
  }>;
}
