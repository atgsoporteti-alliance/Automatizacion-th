'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Lock,
  RefreshCw,
  ShieldCheck,
  Video,
} from 'lucide-react';
import {
  CANDIDATE_PORTAL_VISIBILITY_DAYS,
  CANDIDATE_STAGE_LABELS,
  CandidateStage,
  detectMeetingPlatform,
  HABEAS_DATA_LEGAL_REVIEW_NOTE,
  HABEAS_DATA_POLICY_TEXT,
  HABEAS_DATA_POLICY_VERSION,
  MEETING_PLATFORM_LABELS,
  MEETING_STATUS_LABELS,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  SUPABASE_FREE_MAX_FILE_SIZE_LABEL,
  computeCandidatePortalVisibility,
} from '@alliance-hcm/shared';
import { apiClient, API_BASE, PublicCandidatePortalResponse } from '@/lib/api';
import { DocumentPreviewModal } from './document-preview-modal';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/primitives';

const JOURNEY_STEPS: Array<{ stage: CandidateStage; label: string }> = [
  { stage: 'REGISTERED', label: 'Postulación' },
  { stage: 'CV_UPLOADED', label: 'Hoja de Vida' },
  { stage: 'IN_SELECTION', label: 'Entrevistas' },
  { stage: 'PRE_ONBOARDING', label: 'Pre-Registro' },
  { stage: 'HIRED_APPROVED', label: 'Contratación' },
];

const STAGE_ORDER: Record<CandidateStage, number> = {
  REGISTERED: 0,
  CV_UPLOADED: 1,
  IN_SELECTION: 2,
  PRE_ONBOARDING: 3,
  HIRED_APPROVED: 4,
  REJECTED: -1,
};

type DemoScenario = 'SELECTION' | 'PRE_ONBOARDING' | 'HIRED_15D' | 'EXPIRED';

const DEMO_SCENARIOS: Array<{ id: DemoScenario; label: string }> = [
  { id: 'SELECTION', label: '1. Selección y CV' },
  { id: 'PRE_ONBOARDING', label: '2. Pre-Registro y Devolución' },
  { id: 'HIRED_15D', label: '3. Contratado (15d)' },
  { id: 'EXPIRED', label: '4. Día 16 (Expirado)' },
];

interface DemoCvState {
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  objectUrl: string | null;
}

function buildValidSamplePdfString(): string {
  const streamContent =
    'BT /F1 16 Tf 50 760 Td (Hoja de Vida Demo - Camila Andrea Suarez) Tj ' +
    '0 -26 Td /F1 11 Tf (Cargo: Analista de Operaciones Alliance | Documento de prueba UAT) Tj ET';
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefOffset = body.length;
  const xrefRows = ['0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)];
  return (
    body +
    `xref\n0 ${objects.length + 1}\n` +
    xrefRows.join('') +
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );
}

function buildDemoPortalResponse(params: {
  scenario: DemoScenario;
  nowMs: number;
  demoCv: DemoCvState;
  readIds: Set<string>;
  extraNotification?: {
    id: string;
    title: string;
    message: string;
    createdAt: string;
  } | null;
}): PublicCandidatePortalResponse {
  const { scenario, nowMs, demoCv, readIds, extraNotification } = params;
  const dayMs = 24 * 60 * 60 * 1000;
  const baseIso = new Date(nowMs).toISOString();

  const hiringApprovedAt =
    scenario === 'HIRED_15D'
      ? new Date(nowMs - 3 * dayMs)
      : scenario === 'EXPIRED'
        ? new Date(nowMs - (CANDIDATE_PORTAL_VISIBILITY_DAYS + 1) * dayMs)
        : null;

  const visibility = computeCandidatePortalVisibility(hiringApprovedAt, new Date(nowMs));

  if (scenario === 'EXPIRED' || visibility.isExpired) {
    return {
      expired: true,
      candidateName: 'Camila Andrea Suárez (Demo)',
      appliedRole: 'Analista de Operaciones Customer',
      visibility,
      message: `El acceso temporal de ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días posteriores a la aprobación de contratación ha finalizado. Tu expediente continúa resguardado internamente por Talento Humano.`,
    };
  }

  const stage: CandidateStage =
    scenario === 'HIRED_15D'
      ? 'HIRED_APPROVED'
      : scenario === 'PRE_ONBOARDING'
        ? 'PRE_ONBOARDING'
        : 'IN_SELECTION';

  const notifications = [
    ...(extraNotification
      ? [
          {
            id: extraNotification.id,
            processId: 'demo-proc',
            type: 'CV_UPLOADED' as const,
            title: extraNotification.title,
            message: extraNotification.message,
            isRead: readIds.has(extraNotification.id),
            createdAt: extraNotification.createdAt,
          },
        ]
      : []),
    ...(scenario === 'HIRED_15D'
      ? [
          {
            id: 'demo-notif-hired',
            processId: 'demo-proc',
            type: 'HIRING_APPROVED' as const,
            title: 'Contratación aprobada por Talento Humano',
            message: `Talento Humano aprobó tu contratación. Este resumen temporal estará disponible durante ${CANDIDATE_PORTAL_VISIBILITY_DAYS} días.`,
            isRead: readIds.has('demo-notif-hired'),
            createdAt: new Date(nowMs - 3 * dayMs).toISOString(),
          },
        ]
      : []),
    ...(scenario === 'PRE_ONBOARDING' || scenario === 'HIRED_15D'
      ? [
          {
            id: 'demo-notif-mod',
            processId: 'demo-proc',
            type: 'MODIFICATION' as const,
            title:
              scenario === 'PRE_ONBOARDING'
                ? 'Corrección solicitada en Pre-Registro'
                : 'Pre-Registro aprobado y enviado a DSI',
            message:
              scenario === 'PRE_ONBOARDING'
                ? 'TH devolvió tu registro temporalmente: "Por favor confirma tu EPS actual y adjunta nuevamente tu cédula legible."'
                : 'Tus 24 campos, anexos y firma Ley 1581 fueron aprobados por Talento Humano.',
            isRead: readIds.has('demo-notif-mod'),
            createdAt: new Date(nowMs - 2 * dayMs).toISOString(),
          },
        ]
      : []),
    {
      id: 'demo-notif-meet',
      processId: 'demo-proc',
      type: 'MEETING' as const,
      title: 'Nueva reunión: Entrevista Técnica con Líder de Área',
      message: 'Programada modalidad virtual con Mateo Saldarriaga.',
      isRead: readIds.has('demo-notif-meet'),
      createdAt: new Date(nowMs - 4 * dayMs).toISOString(),
    },
    {
      id: 'demo-notif-cv',
      processId: 'demo-proc',
      type: 'CV_UPLOADED' as const,
      title: 'Hoja de vida recibida en Selección',
      message: `Se registró "${demoCv.fileName}" para revisión del analista de Talento Humano.`,
      isRead: readIds.has('demo-notif-cv'),
      createdAt: new Date(nowMs - 6 * dayMs).toISOString(),
    },
  ];

  return {
    expired: false,
    visibility,
    process: {
      id: 'demo-proc',
      candidateName: 'Camila Andrea Suárez (Demo)',
      candidateEmail: 'candidato.demo@correo.com',
      nationalId: '1020304050',
      appliedRole: 'Analista de Operaciones Customer',
      stage,
      stageLabel: CANDIDATE_STAGE_LABELS[stage],
      cv: {
        fileName: demoCv.fileName,
        mimeType: demoCv.mimeType,
        fileSize: demoCv.fileSize,
        uploadedAt: demoCv.uploadedAt || baseIso,
      },
      preOnboarding: {
        enabled: scenario === 'PRE_ONBOARDING' || scenario === 'HIRED_15D',
        preOnboardingUrl: '/pre-ingreso/demo',
        workflowStep:
          scenario === 'HIRED_15D'
            ? 'IT_PROVISIONING'
            : scenario === 'PRE_ONBOARDING'
              ? 'CANDIDATE_PENDING'
              : null,
        workflowStepLabel:
          scenario === 'HIRED_15D'
            ? 'Aprovisionamiento IT / DSI'
            : scenario === 'PRE_ONBOARDING'
              ? 'Pendiente corrección del candidato'
              : null,
        correctionNote:
          scenario === 'PRE_ONBOARDING'
            ? 'Por favor confirma tu EPS actual y adjunta nuevamente tu cédula legible.'
            : null,
        submittedAt: scenario === 'HIRED_15D' ? new Date(nowMs - 4 * dayMs).toISOString() : null,
        updatedAt: baseIso,
        documentsCount: scenario === 'HIRED_15D' ? 3 : scenario === 'PRE_ONBOARDING' ? 2 : 0,
        hasHabeasDataSigned: scenario === 'HIRED_15D',
        operationalArea: scenario === 'HIRED_15D' ? 'CUSTOMER' : null,
      },
      meetings: [
        {
          id: 'demo-meet-1',
          processId: 'demo-proc',
          title: 'Entrevista Inicial Talento Humano',
          meetingType: 'Entrevista TH',
          scheduledAt: new Date(nowMs - 5 * dayMs).toISOString(),
          meetingUrl: 'https://meet.google.com/alliance-th-demo',
          location: 'Virtual · Google Meet',
          interviewerName: 'Valeria Quintero (TH)',
          status: 'COMPLETED',
          notes: 'Validación de perfil, disponibilidad y competencias.',
          createdAt: baseIso,
          updatedAt: baseIso,
        },
        {
          id: 'demo-meet-2',
          processId: 'demo-proc',
          title: 'Entrevista Técnica y Líder Operativo',
          meetingType: 'Entrevista Técnica',
          scheduledAt: new Date(nowMs + 2 * dayMs).toISOString(),
          meetingUrl: 'https://meet.google.com/alliance-dsi-demo',
          location: 'Virtual · Google Meet',
          interviewerName: 'Mateo Saldarriaga (Líder Área)',
          status: 'SCHEDULED',
          notes: 'Prueba práctica operativa de 45 minutos.',
          createdAt: baseIso,
          updatedAt: baseIso,
        },
      ],
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    },
  };
}

export function CandidatePortalDashboard({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const isDemoMode =
    token === 'demo' && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [demoConsentAccepted, setDemoConsentAccepted] = useState(false);

  // Estado interactivo del simulador UAT (solo para /candidato/demo)
  const [demoScenario, setDemoScenario] = useState<DemoScenario>('PRE_ONBOARDING');
  const [demoNowMs, setDemoNowMs] = useState<number>(Date.UTC(2026, 10, 22, 15, 0, 0));
  const [demoReadIds, setDemoReadIds] = useState<Set<string>>(
    () => new Set(['demo-notif-cv', 'demo-notif-meet']),
  );
  const [demoExtraNotif, setDemoExtraNotif] = useState<{
    id: string;
    title: string;
    message: string;
    createdAt: string;
  } | null>(null);
  const [demoCv, setDemoCv] = useState<Omit<DemoCvState, 'objectUrl'> & { customObjectUrl: string | null }>({
    fileName: 'Hoja_de_Vida_Camila_Suarez.pdf',
    mimeType: 'application/pdf',
    fileSize: 184320,
    uploadedAt: '2026-11-16T15:00:00.000Z',
    customObjectUrl: null,
  });
  const [demoDefaultBlobUrl, setDemoDefaultBlobUrl] = useState<string | null>(null);
  const [liveCvPreview, setLiveCvPreview] = useState<{
    objectUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({
    objectUrl: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!isDemoMode) return;
    setDemoNowMs(Date.now());
    const blob = new Blob([buildValidSamplePdfString()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setDemoDefaultBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isDemoMode]);

  useEffect(() => {
    return () => {
      if (demoCv.customObjectUrl) {
        URL.revokeObjectURL(demoCv.customObjectUrl);
      }
    };
  }, [demoCv.customObjectUrl]);

  const { data: liveData, isLoading, error, refetch } = useQuery({
    queryKey: ['candidate-portal', token],
    queryFn: () => apiClient.getPublicCandidatePortal(token),
    enabled: !isDemoMode,
  });

  const liveCvVersionKey =
    !isDemoMode && liveData && !liveData.expired && liveData.process?.cv
      ? `${liveData.process.cv.fileName ?? ''}:${liveData.process.cv.uploadedAt ?? ''}:${liveData.process.cv.fileSize}`
      : null;

  useEffect(() => {
    if (isDemoMode || !liveCvVersionKey) {
      setLiveCvPreview((prev) => {
        if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return { objectUrl: null, loading: false, error: null };
      });
      return;
    }

    let cancelled = false;
    let activeBlobUrl: string | null = null;
    setLiveCvPreview((prev) => {
      if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { objectUrl: null, loading: true, error: null };
    });

    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/candidate-portal/public/${encodeURIComponent(token)}/cv/content`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          const text = await res.text();
          let message = `No se pudo cargar el archivo (${res.status}).`;
          try {
            const parsed = JSON.parse(text) as { message?: string | string[] };
            if (Array.isArray(parsed.message)) message = parsed.message.join(', ');
            else if (parsed.message) message = parsed.message;
          } catch {
            // conservar mensaje por defecto
          }
          throw new Error(message);
        }
        const blob = await res.blob();
        if (cancelled) return;
        activeBlobUrl = URL.createObjectURL(blob);
        setLiveCvPreview({ objectUrl: activeBlobUrl, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setLiveCvPreview({
          objectUrl: null,
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'No se pudo obtener la vista previa del documento.',
        });
      }
    })();

    return () => {
      cancelled = true;
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [isDemoMode, liveCvVersionKey, token]);

  const cvMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > SUPABASE_FREE_MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `El archivo "${file.name}" supera el límite de ${SUPABASE_FREE_MAX_FILE_SIZE_LABEL} para Supabase Storage (Free Tier).`,
        );
      }
      if (isDemoMode) {
        const localUrl = URL.createObjectURL(file);
        const nowIso = new Date().toISOString();
        setDemoCv({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileSize: file.size,
          uploadedAt: nowIso,
          customObjectUrl: localUrl,
        });
        setDemoExtraNotif({
          id: `demo-cv-${Date.now()}`,
          title: 'Hoja de vida actualizada (Demo)',
          message: `Archivo "${file.name}" cargado en la vista previa del candidato.`,
          createdAt: nowIso,
        });
        return { cvFileName: file.name };
      }
      return apiClient.uploadCandidateCv(token, file);
    },
    onSuccess: (updated) => {
      setUploadError(null);
      setUploadSuccess(`Hoja de vida "${updated.cvFileName}" guardada correctamente.`);
      if (!isDemoMode) {
        void queryClient.invalidateQueries({ queryKey: ['candidate-portal', token] });
      }
    },
    onError: (err) => {
      setUploadSuccess(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir tu hoja de vida.');
    },
  });

  const acceptConsentMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        setDemoConsentAccepted(true);
        return {
          accepted: true,
          habeasDataAcceptedAt: new Date().toISOString(),
          habeasDataPolicyVersion: HABEAS_DATA_POLICY_VERSION,
        };
      }
      return apiClient.acceptCandidateConsent(token);
    },
    onSuccess: () => {
      if (!isDemoMode) {
        void queryClient.invalidateQueries({ queryKey: ['candidate-portal', token] });
      }
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        setDemoReadIds(
          new Set([
            'demo-notif-cv',
            'demo-notif-meet',
            'demo-notif-mod',
            'demo-notif-hired',
            ...(demoExtraNotif ? [demoExtraNotif.id] : []),
          ]),
        );
        return { marked: 1 };
      }
      return apiClient.markCandidateNotificationsRead(token);
    },
    onSuccess: () => {
      if (!isDemoMode) {
        void queryClient.invalidateQueries({ queryKey: ['candidate-portal', token] });
      }
    },
  });

  const activeDemoUrl = demoCv.customObjectUrl ?? demoDefaultBlobUrl ?? '';
  const demoData = useMemo(() => {
    if (!isDemoMode) return undefined;
    return buildDemoPortalResponse({
      scenario: demoScenario,
      nowMs: demoNowMs,
      demoCv: {
        fileName: demoCv.fileName,
        mimeType: demoCv.mimeType,
        fileSize: demoCv.fileSize,
        uploadedAt: demoCv.uploadedAt,
        objectUrl: activeDemoUrl || null,
      },
      readIds: demoReadIds,
      extraNotification: demoExtraNotif,
    });
  }, [isDemoMode, demoScenario, demoNowMs, demoCv, activeDemoUrl, demoReadIds, demoExtraNotif]);

  const data = isDemoMode ? demoData : liveData;

  const demoBanner = isDemoMode ? (
    <Card className="border-dashed border-zinc-300 dark:border-zinc-700">
      <CardContent className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Modo Vista de Candidato · UAT</Badge>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Cambia de escenario para probar todas las vistas y funcionalidades sin crear datos reales.
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a roles
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DEMO_SCENARIOS.map((sc) => (
            <Button
              key={sc.id}
              type="button"
              size="sm"
              variant={demoScenario === sc.id ? 'default' : 'outline'}
              onClick={() => setDemoScenario(sc.id)}
            >
              {sc.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : null;

  if (!isDemoMode && isLoading) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="p-8 text-center space-y-2">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
          <p className="text-sm font-medium">Cargando portal del candidato...</p>
          <p className="text-xs text-zinc-500">Consultando estado, reuniones y notificaciones.</p>
        </CardContent>
      </Card>
    );
  }

  if ((!isDemoMode && error) || !data) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">Enlace no encontrado</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : 'Este enlace no es válido o fue revocado.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Vista estricta de expiración (después de 15 días tras aprobación de contratación por TH)
  if (data.expired || !data.process) {
    return (
      <div className="space-y-5">
        {demoBanner}
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Lock className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Acceso temporal finalizado</CardTitle>
            <CardDescription>
              {data.candidateName ? `${data.candidateName} · ` : ''}
              {data.appliedRole ?? 'Proceso de Selección Alliance'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {data.message ??
                'La ventana de visualización de 15 días posteriores a la aprobación de contratación ha finalizado.'}
            </p>
            {data.visibility?.hiringApprovedAt && data.visibility?.expiresAt && (
              <div className="rounded-md border border-zinc-200/80 divide-y divide-zinc-200/80 text-xs text-left dark:border-zinc-800/80 dark:divide-zinc-800/80">
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-zinc-500">Contratación aprobada por TH</span>
                  <span>{new Date(data.visibility.hiringApprovedAt).toLocaleDateString('es-CO')}</span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-zinc-500">Vigencia del portal (15 días)</span>
                  <span>Expiró el {new Date(data.visibility.expiresAt).toLocaleDateString('es-CO')}</span>
                </div>
              </div>
            )}
            <p className="text-[11px] text-zinc-400">
              Tu expediente permanece resguardado internamente por Talento Humano.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const proc = data.process;
  const hasDataConsent = isDemoMode
    ? demoConsentAccepted || demoScenario === 'HIRED_15D'
    : Boolean(proc.habeasDataAcceptedAt);
  const currentIdx = STAGE_ORDER[proc.stage];
  const cvUrl = isDemoMode ? activeDemoUrl : liveCvPreview.objectUrl ?? '';
  const cvApiDownloadUrl = isDemoMode
    ? cvUrl
    : liveCvPreview.objectUrl ?? `${API_BASE}/candidate-portal/public/${encodeURIComponent(token)}/cv/content?download=1`;
  const isImageCv = Boolean(proc.cv?.mimeType?.startsWith('image/'));
  const isPdfCv =
    proc.cv?.mimeType === 'application/pdf' ||
    Boolean(proc.cv?.fileName?.toLowerCase().endsWith('.pdf'));

  const preOnboardingHref = (() => {
    const raw = proc.preOnboarding.preOnboardingUrl;
    if (!raw || typeof window === 'undefined') return raw;
    if (raw.startsWith('/')) return raw;
    try {
      const u = new URL(raw);
      return `${window.location.origin}${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  })();

  return (
    <div className="space-y-6">
      {demoBanner}

      {/* Encabezado y etapa actual */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{proc.candidateName}</h1>
            <Badge
              variant={
                proc.stage === 'HIRED_APPROVED'
                  ? 'success'
                  : proc.stage === 'REJECTED'
                    ? 'danger'
                    : 'default'
              }
            >
              {CANDIDATE_STAGE_LABELS[proc.stage]}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {proc.appliedRole ? `${proc.appliedRole} · ` : ''}
            {proc.candidateEmail}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (isDemoMode) setDemoNowMs(Date.now());
            else void refetch();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Banner de visibilidad temporal de 15 días tras aprobación de contratación */}
      {data.visibility.isTemporarilyScoped && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              <strong>Contratación aprobada por TH.</strong> Este portal temporal estará visible para
              ti durante <strong>15 días</strong> (quedan{' '}
              <strong>{data.visibility.daysRemaining} día(s)</strong>, hasta el{' '}
              {data.visibility.expiresAt
                ? new Date(data.visibility.expiresAt).toLocaleDateString('es-CO', {
                    dateStyle: 'long',
                  })
                : '—'}
              ).
            </span>
          </div>
          <Badge variant="success">{data.visibility.daysRemaining}d restantes</Badge>
        </div>
      )}

      {/* Autorización previa Tratamiento de Datos (primera pantalla del candidato) */}
      {!hasDataConsent ? (
        <Card className="border-amber-200/80 dark:border-amber-900/60">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Autorización de Tratamiento de Datos Personales · Ley 1581 de 2012
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Badge variant="warning">Validar con Jurídico</Badge>
                <Badge variant="outline">{HABEAS_DATA_POLICY_VERSION}</Badge>
              </div>
            </div>
            <CardDescription>
              Antes de cargar tu hoja de vida o suministrar tus datos personales, lee y acepta
              nuestra política de tratamiento de datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-36 overflow-y-auto rounded border border-zinc-200/80 bg-zinc-50/70 p-3 text-xs leading-relaxed text-zinc-600 whitespace-pre-line dark:border-zinc-800/80 dark:bg-zinc-950/60 dark:text-zinc-300">
              {HABEAS_DATA_POLICY_TEXT}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {HABEAS_DATA_LEGAL_REVIEW_NOTE}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-start gap-2.5 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span>
                  Acepto el tratamiento de mis datos personales bajo la{' '}
                  <strong>Ley 1581 de 2012</strong> para este proceso de selección.
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                disabled={!consentChecked || acceptConsentMutation.isPending}
                onClick={() => acceptConsentMutation.mutate()}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {acceptConsentMutation.isPending
                  ? 'Registrando...'
                  : 'Aceptar y habilitar carga'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Autorización de Tratamiento de Datos Ley 1581 registrada (
            {proc.habeasDataPolicyVersion ?? HABEAS_DATA_POLICY_VERSION}).
          </span>
        </div>
      )}

      {/* Línea de progreso de selección a contratación */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {JOURNEY_STEPS.map((item, idx) => {
              const reached = currentIdx >= idx && currentIdx !== -1;
              return (
                <div key={item.stage} className="space-y-1.5">
                  <div
                    className={`h-1 w-full rounded-full ${
                      reached ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'
                    }`}
                  />
                  <span
                    className={`block text-[11px] ${
                      reached
                        ? 'font-medium text-zinc-950 dark:text-zinc-100'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    {idx + 1}. {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Hoja de vida + Pre-registro */}
        <div className="lg:col-span-6 space-y-5">
          {/* Hoja de Vida (CV) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-500" />
                Hoja de Vida (Selección)
              </CardTitle>
              <CardDescription>
                Sube o actualiza tu CV en PDF o imagen para el equipo de selección.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {proc.stage !== 'HIRED_APPROVED' &&
                (hasDataConsent ? (
                  <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 p-4 text-center transition-colors hover:border-zinc-500 cursor-pointer dark:border-zinc-700 dark:hover:border-zinc-500">
                    <FileUp className="h-5 w-5 text-zinc-500" />
                    <span className="text-xs font-medium">
                      {cvMutation.isPending
                        ? 'Subiendo hoja de vida...'
                        : proc.cv
                          ? 'Reemplazar hoja de vida'
                          : 'Adjuntar Hoja de Vida (máx. 4 MB · Supabase Free Tier)'}
                    </span>
                    <span className="text-[11px] text-zinc-500">PDF, Word o imagen (hasta 4 MB)</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*,.doc,.docx"
                      className="hidden"
                      disabled={cvMutation.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) cvMutation.mutate(file);
                      }}
                    />
                  </label>
                ) : (
                  <div className="rounded-md border border-dashed border-amber-300/80 bg-amber-50/50 p-4 text-center text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    Acepta primero la Autorización de Tratamiento de Datos en la parte superior para
                    habilitar la carga de tu Hoja de Vida.
                  </div>
                ))}

              {uploadError && (
                <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {uploadError}
                </div>
              )}

              {uploadSuccess && (
                <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {uploadSuccess}
                </div>
              )}

              {proc.cv && (
                <div className="rounded-md border border-zinc-200/80 bg-zinc-50/60 p-3 space-y-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                  {liveCvPreview.loading ? (
                    <div className="flex h-24 items-center justify-center rounded border border-zinc-200/80 bg-white text-xs text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900">
                      Cargando vista previa desde Supabase Storage...
                    </div>
                  ) : liveCvPreview.error ? (
                    <div className="rounded border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      {liveCvPreview.error}
                    </div>
                  ) : (
                    cvUrl &&
                    (isImageCv || isPdfCv) && (
                      <div className="overflow-hidden rounded border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
                        {isImageCv ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cvUrl} alt={proc.cv.fileName ?? 'CV'} className="h-28 w-full object-contain p-1" />
                        ) : (
                          <iframe src={cvUrl} title={proc.cv.fileName ?? 'CV'} className="h-32 w-full bg-white" />
                        )}
                      </div>
                    )
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{proc.cv.fileName}</p>
                      <p className="text-[11px] text-zinc-500">
                        {Math.max(1, Math.round(proc.cv.fileSize / 1024))} KB ·{' '}
                        {isDemoMode ? 'Vista previa local UAT' : 'Guardado en Supabase'}
                      </p>
                    </div>
                    {(cvUrl || liveCvPreview.error || liveCvPreview.loading) && (
                      <div className="flex items-center gap-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Button>
                        {cvUrl && (
                          <a
                            href={cvApiDownloadUrl}
                            download={proc.cv.fileName ?? 'hoja-de-vida.pdf'}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Descargar
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pre-Registro (24 campos) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Pre-Registro de Ingreso</CardTitle>
              <CardDescription>
                Formulario de 24 campos, soportes documentales y firma Ley 1581.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {proc.preOnboarding.enabled && preOnboardingHref ? (
                <>
                  <div className="rounded-md border border-zinc-200/80 divide-y divide-zinc-200/80 text-xs dark:border-zinc-800/80 dark:divide-zinc-800/80">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-zinc-500">Estado del registro</span>
                      <span className="font-medium">
                        {proc.preOnboarding.workflowStepLabel ?? 'Pendiente diligenciar'}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-zinc-500">Soportes adjuntos</span>
                      <span>{proc.preOnboarding.documentsCount} archivo(s)</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-zinc-500">Firma Ley 1581</span>
                      <span>{proc.preOnboarding.hasHabeasDataSigned ? 'Firmada' : 'Pendiente'}</span>
                    </div>
                    {proc.preOnboarding.operationalArea && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Área asignada</span>
                        <span className="font-medium">{proc.preOnboarding.operationalArea}</span>
                      </div>
                    )}
                  </div>

                  {proc.preOnboarding.correctionNote && (
                    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                      <p className="font-medium">Corrección solicitada por TH:</p>
                      <p className="mt-0.5">{proc.preOnboarding.correctionNote}</p>
                    </div>
                  )}

                  {(!proc.preOnboarding.submittedAt ||
                    proc.preOnboarding.workflowStep === 'CANDIDATE_PENDING') && (
                    <a
                      href={preOnboardingHref}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {proc.preOnboarding.workflowStep === 'CANDIDATE_PENDING'
                        ? 'Corregir Pre-Registro ahora'
                        : 'Diligenciar Pre-Registro (24 campos)'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-zinc-500">
                    Talento Humano habilitará tu formulario de pre-registro una vez avances en las
                    entrevistas de selección.
                  </p>
                  {isDemoMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDemoScenario('PRE_ONBOARDING')}
                    >
                      Ver escenario con Pre-Registro habilitado
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: Reuniones + Notificaciones y modificaciones */}
        <div className="lg:col-span-6 space-y-5">
          {/* Reuniones */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-500" />
                Reuniones y Entrevistas ({proc.meetings.length})
              </CardTitle>
              <CardDescription>Agenda programada por Talento Humano y líderes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {proc.meetings.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Aún no tienes reuniones programadas. Te notificaremos aquí cuando se agenden.
                </p>
              ) : (
                proc.meetings.map((m) => {
                  const platform = m.meetingUrl
                    ? detectMeetingPlatform(m.meetingUrl, m.location)
                    : null;
                  const joinLabel =
                    platform === 'TEAMS'
                      ? 'Unirse por Microsoft Teams'
                      : platform === 'MEET'
                        ? 'Unirse por Google Meet'
                        : 'Abrir enlace de reunión';

                  return (
                    <div
                      key={m.id}
                      className="rounded-md border border-zinc-200/80 p-3 space-y-2 text-xs dark:border-zinc-800/80"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium text-zinc-950 dark:text-zinc-100">{m.title}</p>
                            {platform && platform !== 'OTHER' && (
                              <Badge variant={platform === 'TEAMS' ? 'default' : 'success'}>
                                {MEETING_PLATFORM_LABELS[platform]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            {m.meetingType} ·{' '}
                            {new Date(m.scheduledAt).toLocaleString('es-CO', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                        <Badge
                          variant={
                            m.status === 'COMPLETED'
                              ? 'success'
                              : m.status === 'CANCELLED'
                                ? 'danger'
                                : m.status === 'RESCHEDULED'
                                  ? 'warning'
                                  : 'secondary'
                          }
                        >
                          {MEETING_STATUS_LABELS[m.status]}
                        </Badge>
                      </div>
                      {(m.interviewerName || m.location) && (
                        <p className="text-[11px] text-zinc-500">
                          {m.interviewerName ? `Con: ${m.interviewerName}` : ''}
                          {m.interviewerName && m.location ? ' · ' : ''}
                          {m.location ?? ''}
                        </p>
                      )}
                      {m.notes && <p className="text-zinc-600 dark:text-zinc-400">{m.notes}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        {m.meetingUrl && m.status !== 'CANCELLED' ? (
                          <a
                            href={m.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-2.5 text-[11px] font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <Video className="h-3 w-3" />
                            {joinLabel}
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </a>
                        ) : (
                          m.status !== 'CANCELLED' && (
                            <p className="text-[11px] text-zinc-400">
                              Enlace de Teams / Meet pendiente de asignar por Talento Humano.
                            </p>
                          )
                        )}
                        {m.status !== 'CANCELLED' && !isDemoMode && (
                          <a
                            href={`${API_BASE}/candidate-portal/public/${encodeURIComponent(token)}/meetings/${m.id}/ics`}
                            download
                            className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-200 px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          >
                            <Calendar className="h-3 w-3" />
                            Agregar al calendario (.ics)
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Notificaciones y Modificaciones del Registro */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-zinc-500" />
                  Notificaciones y Modificaciones
                  {proc.unreadCount > 0 && <Badge variant="warning">{proc.unreadCount} nuevas</Badge>}
                </CardTitle>
                {proc.unreadCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={markReadMutation.isPending}
                    onClick={() => markReadMutation.mutate()}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar leídas
                  </Button>
                )}
              </div>
              <CardDescription>
                Bitácora de cambios en tu proceso, reuniones y correcciones de registro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {proc.notifications.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin notificaciones registradas.</p>
              ) : (
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {proc.notifications.map((n) => (
                    <div key={n.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          {!n.isRead && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                          )}
                          {n.title}
                        </span>
                        <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleString('es-CO', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {proc.cv && (
        <DocumentPreviewModal
          open={previewOpen}
          fileName={proc.cv.fileName ?? 'hoja-de-vida.pdf'}
          mimeType={proc.cv.mimeType ?? 'application/pdf'}
          objectUrl={cvUrl || null}
          loading={!isDemoMode && liveCvPreview.loading}
          error={!isDemoMode ? liveCvPreview.error : null}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
