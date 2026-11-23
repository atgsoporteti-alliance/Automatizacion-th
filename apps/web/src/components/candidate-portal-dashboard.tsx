'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Lock,
  RefreshCw,
  Video,
} from 'lucide-react';
import {
  CANDIDATE_STAGE_LABELS,
  CandidateStage,
  MEETING_STATUS_LABELS,
} from '@alliance-hcm/shared';
import { apiClient, API_BASE } from '@/lib/api';
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

export function CandidatePortalDashboard({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['candidate-portal', token],
    queryFn: () => apiClient.getPublicCandidatePortal(token),
  });

  const cvMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadCandidateCv(token, file),
    onSuccess: (updated) => {
      setUploadError(null);
      setUploadSuccess(`Hoja de vida "${updated.cvFileName}" guardada correctamente.`);
      void queryClient.invalidateQueries({ queryKey: ['candidate-portal', token] });
    },
    onError: (err) => {
      setUploadSuccess(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir tu hoja de vida.');
    },
  });

  const markReadMutation = useMutation({
    mutationFn: () => apiClient.markCandidateNotificationsRead(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['candidate-portal', token] });
    },
  });

  if (isLoading) {
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

  if (error || !data) {
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
    );
  }

  const proc = data.process;
  const currentIdx = STAGE_ORDER[proc.stage];
  const cvUrl = `${API_BASE}/candidate-portal/public/${encodeURIComponent(token)}/cv/content`;
  const cvDownloadUrl = `${cvUrl}?download=1`;
  const isImageCv = Boolean(proc.cv?.mimeType?.startsWith('image/'));
  const isPdfCv =
    proc.cv?.mimeType === 'application/pdf' ||
    Boolean(proc.cv?.fileName?.toLowerCase().endsWith('.pdf'));

  const preOnboardingHref = (() => {
    const raw = proc.preOnboarding.preOnboardingUrl;
    if (!raw || typeof window === 'undefined') return raw;
    try {
      const u = new URL(raw);
      return `${window.location.origin}${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  })();

  return (
    <div className="space-y-6">
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

        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
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
              {proc.stage !== 'HIRED_APPROVED' && (
                <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 p-4 text-center transition-colors hover:border-zinc-500 cursor-pointer dark:border-zinc-700 dark:hover:border-zinc-500">
                  <FileUp className="h-5 w-5 text-zinc-500" />
                  <span className="text-xs font-medium">
                    {cvMutation.isPending
                      ? 'Subiendo hoja de vida...'
                      : proc.cv
                        ? 'Reemplazar hoja de vida'
                        : 'Adjuntar Hoja de Vida (máx. 10 MB)'}
                  </span>
                  <span className="text-[11px] text-zinc-500">PDF, Word o imagen</span>
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
              )}

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
                  {(isImageCv || isPdfCv) && (
                    <div className="overflow-hidden rounded border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
                      {isImageCv ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cvUrl} alt={proc.cv.fileName ?? 'CV'} className="h-28 w-full object-contain p-1" />
                      ) : (
                        <iframe src={cvUrl} title={proc.cv.fileName ?? 'CV'} className="h-32 w-full bg-white" />
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{proc.cv.fileName}</p>
                      <p className="text-[11px] text-zinc-500">
                        {Math.max(1, Math.round(proc.cv.fileSize / 1024))} KB · Guardado en Supabase
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                      <a
                        href={cvDownloadUrl}
                        download={proc.cv.fileName ?? 'hoja-de-vida.pdf'}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Descargar
                      </a>
                    </div>
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
                <p className="text-xs text-zinc-500">
                  Talento Humano habilitará tu formulario de pre-registro una vez avances en las
                  entrevistas de selección.
                </p>
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
                proc.meetings.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-md border border-zinc-200/80 p-3 space-y-2 text-xs dark:border-zinc-800/80"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-950 dark:text-zinc-100">{m.title}</p>
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
                    {m.meetingUrl && m.status !== 'CANCELLED' && (
                      <a
                        href={m.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-200 px-2.5 text-[11px] font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <Video className="h-3 w-3" />
                        Abrir enlace de reunión
                      </a>
                    )}
                  </div>
                ))
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
          objectUrl={cvUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
