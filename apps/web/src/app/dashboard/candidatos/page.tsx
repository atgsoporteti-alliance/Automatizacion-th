'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  Lock,
  Plus,
  Search,
  Send,
  UserCheck,
  Video,
} from 'lucide-react';
import {
  CANDIDATE_STAGE_LABELS,
  CANDIDATE_STAGES,
  CandidateStage,
  MEETING_STATUS_LABELS,
  MEETING_STATUSES,
  MeetingStatus,
  WORKFLOW_STEP_LABELS,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { DocumentPreviewModal } from '@/components/document-preview-modal';
import { apiClient, CandidateProcessRecord } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui/primitives';

function toSameOriginUrl(rawUrl: string | null | undefined, fallbackPath?: string): string {
  if (typeof window === 'undefined') {
    return rawUrl ?? fallbackPath ?? '';
  }
  if (!rawUrl && fallbackPath) {
    return `${window.location.origin}${fallbackPath}`;
  }
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    return `${window.location.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl.startsWith('/') ? `${window.location.origin}${rawUrl}` : rawUrl;
  }
}

function getStageBadgeVariant(
  stage: CandidateStage,
): 'default' | 'success' | 'warning' | 'danger' | 'outline' {
  switch (stage) {
    case 'HIRED_APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PRE_ONBOARDING':
      return 'warning';
    case 'IN_SELECTION':
    case 'CV_UPLOADED':
      return 'default';
    default:
      return 'outline';
  }
}

export default function ThCandidatesPage() {
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Formulario nuevo candidato
  const [createOpen, setCreateOpen] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [appliedRole, setAppliedRole] = useState('');

  // Cambio de etapa
  const [nextStage, setNextStage] = useState<CandidateStage>('IN_SELECTION');
  const [stageNote, setStageNote] = useState('');

  // Programar reunión
  const [meetingTitle, setMeetingTitle] = useState('Entrevista Talento Humano');
  const [meetingType, setMeetingType] = useState('Entrevista TH');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('Virtual · Google Meet / Teams');
  const [interviewerName, setInterviewerName] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');

  // Modal de previsualización / descarga de Hoja de Vida
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    fileName: string;
    mimeType: string;
    objectUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    fileName: '',
    mimeType: 'application/pdf',
    objectUrl: null,
    loading: false,
    error: null,
  });

  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['candidate-processes'],
    queryFn: () => apiClient.getCandidateProcesses(),
  });

  const filteredProcesses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return processes.filter((p) => {
      const matchesStage = stageFilter === 'ALL' || p.stage === stageFilter;
      const matchesQuery =
        !q ||
        p.candidateName.toLowerCase().includes(q) ||
        p.candidateEmail.toLowerCase().includes(q) ||
        (p.appliedRole ?? '').toLowerCase().includes(q) ||
        (p.nationalId ?? '').toLowerCase().includes(q);
      return matchesStage && matchesQuery;
    });
  }, [processes, searchTerm, stageFilter]);

  const selected: CandidateProcessRecord | undefined =
    processes.find((p) => p.id === selectedId) ?? filteredProcesses[0] ?? processes[0];

  useEffect(() => {
    if (selected) {
      setNextStage(selected.stage);
    }
  }, [selected?.id, selected?.stage]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['candidate-processes'] });
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2500);
    } catch {
      setFeedback('No se pudo copiar automáticamente; selecciona y copia el enlace manualmente.');
    }
  };

  const openCvPreview = async (proc: CandidateProcessRecord) => {
    setPreviewState({
      open: true,
      fileName: proc.cvFileName ?? 'hoja-de-vida.pdf',
      mimeType: proc.cvMimeType ?? 'application/pdf',
      objectUrl: null,
      loading: true,
      error: null,
    });

    try {
      const res = await apiClient.fetchProtectedBlob(
        `/candidate-portal/processes/${proc.id}/cv/content`,
      );
      setPreviewState((prev) => ({
        ...prev,
        objectUrl: res.objectUrl,
        mimeType: proc.cvMimeType || res.contentType,
        loading: false,
      }));
    } catch (err) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo cargar la hoja de vida.',
      }));
    }
  };

  const downloadCv = async (proc: CandidateProcessRecord) => {
    try {
      const res = await apiClient.fetchProtectedBlob(
        `/candidate-portal/processes/${proc.id}/cv/content?download=1`,
      );
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = proc.cvFileName ?? 'hoja-de-vida.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo descargar la hoja de vida.');
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createCandidateProcess({
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim(),
        nationalId: nationalId.trim() || undefined,
        appliedRole: appliedRole.trim() || undefined,
      }),
    onSuccess: (created) => {
      setFeedback(`Portal creado para ${created.candidateName}.`);
      setCandidateName('');
      setCandidateEmail('');
      setNationalId('');
      setAppliedRole('');
      setCreateOpen(false);
      setSelectedId(created.id);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error creando proceso de candidato.');
    },
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage, note }: { id: string; stage: CandidateStage; note?: string }) =>
      apiClient.updateCandidateStage(id, { stage, note: note?.trim() || undefined }),
    onSuccess: () => {
      setFeedback('Etapa actualizada y notificada en el portal del candidato.');
      setStageNote('');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error actualizando etapa.');
    },
  });

  const approveHiringMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.approveCandidateHiring(
        id,
        'Tu contratación fue aprobada por Talento Humano. El portal permanecerá visible durante 15 días.',
      ),
    onSuccess: () => {
      setFeedback(
        'Contratación aprobada por TH. La ventana temporal de 15 días del candidato ha iniciado.',
      );
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error al aprobar contratación.');
    },
  });

  const enablePreOnboardingMutation = useMutation({
    mutationFn: (id: string) => apiClient.enableCandidatePreOnboarding(id),
    onSuccess: () => {
      setFeedback('Formulario de Pre-Registro (24 campos) habilitado dentro del portal del candidato.');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error habilitando pre-registro.');
    },
  });

  const addMeetingMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.createCandidateMeeting(id, {
        title: meetingTitle.trim(),
        meetingType: meetingType.trim() || undefined,
        scheduledAt: new Date(meetingDate).toISOString(),
        meetingUrl: meetingUrl.trim() || undefined,
        location: meetingLocation.trim() || undefined,
        interviewerName: interviewerName.trim() || undefined,
        notes: meetingNotes.trim() || undefined,
      }),
    onSuccess: () => {
      setFeedback('Reunión programada y publicada en el portal del candidato.');
      setMeetingTitle('Entrevista Técnica / Líder');
      setMeetingDate('');
      setMeetingUrl('');
      setInterviewerName('');
      setMeetingNotes('');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error programando reunión.');
    },
  });

  const updateMeetingMutation = useMutation({
    mutationFn: ({ meetingId, status }: { meetingId: string; status: MeetingStatus }) =>
      apiClient.updateCandidateMeeting(meetingId, { status }),
    onSuccess: () => {
      setFeedback('Estado de reunión actualizado y notificado al candidato.');
      invalidateAll();
    },
  });

  const kpis = useMemo(() => {
    const total = processes.length;
    const inProcess = processes.filter(
      (p) => p.stage !== 'HIRED_APPROVED' && p.stage !== 'REJECTED',
    ).length;
    const active15d = processes.filter(
      (p) => p.hiringApprovedAt && !p.visibility.isExpired,
    ).length;
    const expiredForCandidate = processes.filter((p) => p.visibility.isExpired).length;
    return { total, inProcess, active15d, expiredForCandidate };
  }, [processes]);

  const portalLink = selected
    ? toSameOriginUrl(selected.portalUrl, `/candidato/${selected.accessToken}`)
    : '';
  const preOnboardingLink = selected?.preOnboardingUrl
    ? toSameOriginUrl(selected.preOnboardingUrl)
    : selected?.preOnboardingToken
      ? toSameOriginUrl(null, `/pre-ingreso/${selected.preOnboardingToken}`)
      : '';

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Cabecera minimalista */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Selección &amp; Portal de Candidatos
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Seguimiento completo de hoja de vida, entrevistas, pre-registro y notificaciones.
              Visible 15 días para el candidato tras aprobación TH; permanente para TH.
            </p>
          </div>

          <Button type="button" onClick={() => setCreateOpen((v) => !v)}>
            <Plus className="h-4 w-4" />
            {createOpen ? 'Cerrar formulario' : 'Nuevo candidato'}
          </Button>
        </div>

        {/* KPIs compactos */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Total procesos
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.total}</p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              En selección / pre-registro
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.inProcess}</p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Contratados · Ventana 15d
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {kpis.active15d}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Expirados p/ candidato
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-500">
              {kpis.expiredForCandidate}
            </p>
          </div>
        </div>

        {feedback && (
          <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Formulario colapsable de creación */}
        {createOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Registrar candidato y generar portal</CardTitle>
              <CardDescription>
                Crea el acceso único del candidato para subir su Hoja de Vida y seguir todo su
                proceso desde cualquier navegador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="cand-name">Nombre completo *</Label>
                  <Input
                    id="cand-name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Laura Marcela Gómez"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cand-email">Correo del candidato *</Label>
                  <Input
                    id="cand-email"
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="laura.gomez@correo.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cand-role">Cargo / Vacante</Label>
                  <Input
                    id="cand-role"
                    value={appliedRole}
                    onChange={(e) => setAppliedRole(e.target.value)}
                    placeholder="Analista de Operaciones"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cand-nid">Cédula (opcional)</Label>
                  <Input
                    id="cand-nid"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="1020304050"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creando...' : 'Crear y generar portal'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Vista maestro - detalle */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Lista izquierda */}
          <Card className="lg:col-span-5">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Candidatos ({filteredProcesses.length})</CardTitle>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar nombre, correo, cargo..."
                    className="pl-8 text-xs"
                  />
                </div>
                <Select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="text-xs"
                >
                  <option value="ALL">Todas las etapas</option>
                  {CANDIDATE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {CANDIDATE_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-6 text-center text-xs text-zinc-500">Cargando procesos...</p>
              ) : filteredProcesses.length === 0 ? (
                <p className="p-6 text-center text-xs text-zinc-500">
                  No hay procesos de selección que coincidan con el filtro.
                </p>
              ) : (
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {filteredProcesses.map((proc) => {
                    const isSelected = selected?.id === proc.id;
                    return (
                      <button
                        key={proc.id}
                        type="button"
                        onClick={() => setSelectedId(proc.id)}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-zinc-100/90 dark:bg-zinc-800/70'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{proc.candidateName}</p>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {proc.appliedRole ? `${proc.appliedRole} · ` : ''}
                              {proc.candidateEmail}
                            </p>
                          </div>
                          <Badge variant={getStageBadgeVariant(proc.stage)}>
                            {CANDIDATE_STAGE_LABELS[proc.stage]}
                          </Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                          <span>{proc.cvFileName ? 'CV cargado' : 'Sin CV'}</span>
                          <span>·</span>
                          <span>{proc.meetings.length} reuniones</span>
                          {proc.hiringApprovedAt && (
                            <>
                              <span>·</span>
                              <span
                                className={
                                  proc.visibility.isExpired
                                    ? 'text-zinc-500'
                                    : 'font-medium text-emerald-600 dark:text-emerald-400'
                                }
                              >
                                {proc.visibility.isExpired
                                  ? 'Portal expirado p/ candidato (TH activo)'
                                  : `Portal: ${proc.visibility.daysRemaining}d restantes`}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detalle derecho */}
          <div className="space-y-6 lg:col-span-7">
            {!selected ? (
              <Card>
                <CardContent className="p-8 text-center text-xs text-zinc-500">
                  Selecciona o crea un candidato para gestionar su portal de selección y
                  pre-registro.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 1. Enlace, etapa y regla 15 días */}
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{selected.candidateName}</CardTitle>
                          <Badge variant={getStageBadgeVariant(selected.stage)}>
                            {CANDIDATE_STAGE_LABELS[selected.stage]}
                          </Badge>
                        </div>
                        <CardDescription>
                          {selected.appliedRole ? `${selected.appliedRole} · ` : ''}
                          {selected.candidateEmail}
                          {selected.nationalId ? ` · CC ${selected.nationalId}` : ''}
                        </CardDescription>
                      </div>

                      {!selected.hiringApprovedAt ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => approveHiringMutation.mutate(selected.id)}
                          disabled={approveHiringMutation.isPending}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {approveHiringMutation.isPending
                            ? 'Aprobando...'
                            : 'Aprobar Contratación (15d)'}
                        </Button>
                      ) : (
                        <Badge variant={selected.visibility.isExpired ? 'outline' : 'success'}>
                          {selected.visibility.isExpired ? (
                            <>
                              <Lock className="mr-1 h-3 w-3" /> Expirado p/ candidato
                            </>
                          ) : (
                            <>
                              <Clock className="mr-1 h-3 w-3" /> {selected.visibility.daysRemaining}d
                              visibles
                            </>
                          )}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Link portal candidato */}
                    <div className="rounded-md border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                          Enlace del Portal del Candidato
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCopy(portalLink, 'portal')}
                          >
                            {copiedKey === 'portal' ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" /> Copiar
                              </>
                            )}
                          </Button>
                          <Link
                            href={`/candidato/${selected.accessToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Abrir
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                      <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {portalLink}
                      </p>
                    </div>

                    {/* Info de vigencia 15 días si ya fue aprobado */}
                    {selected.hiringApprovedAt && selected.visibility.expiresAt && (
                      <div className="rounded-md border border-zinc-200/80 px-3.5 py-2.5 text-xs dark:border-zinc-800/80">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {selected.visibility.isExpired
                              ? 'Ventana de 15 días finalizada para el candidato'
                              : `Ventana temporal activa para el candidato (${selected.visibility.daysRemaining} días restantes)`}
                          </span>
                          <span className="text-zinc-500">
                            Aprobado:{' '}
                            {new Date(selected.hiringApprovedAt).toLocaleDateString('es-CO')} ·
                            Límite:{' '}
                            {new Date(selected.visibility.expiresAt).toLocaleDateString('es-CO')}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          TH conserva acceso permanente a este registro histórico y al expediente.
                        </p>
                      </div>
                    )}

                    {/* Selector de etapa manual */}
                    <div className="grid gap-3 border-t border-zinc-200/80 pt-3 sm:grid-cols-12 dark:border-zinc-800/80">
                      <div className="space-y-1 sm:col-span-4">
                        <Label className="text-[11px]">Etapa del proceso</Label>
                        <Select
                          value={nextStage}
                          onChange={(e) => setNextStage(e.target.value as CandidateStage)}
                        >
                          {CANDIDATE_STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {CANDIDATE_STAGE_LABELS[stage]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-5">
                        <Label className="text-[11px]">Nota para el candidato (opcional)</Label>
                        <Input
                          value={stageNote}
                          onChange={(e) => setStageNote(e.target.value)}
                          placeholder="Mensaje visible en notificaciones..."
                        />
                      </div>
                      <div className="flex items-end sm:col-span-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={stageMutation.isPending}
                          onClick={() =>
                            stageMutation.mutate({
                              id: selected.id,
                              stage: nextStage,
                              note: stageNote,
                            })
                          }
                        >
                          {stageMutation.isPending ? 'Guardando...' : 'Aplicar etapa'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Hoja de Vida (CV) + Pre-Registro */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-zinc-500" />
                        Hoja de Vida (Selección)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      {selected.cvFileName ? (
                        <>
                          <div className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                            <p className="truncate font-medium">{selected.cvFileName}</p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {(selected.cvFileSize / 1024).toFixed(1)} KB
                              {selected.cvUploadedAt
                                ? ` · ${new Date(selected.cvUploadedAt).toLocaleString('es-CO')}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void openCvPreview(selected)}
                            >
                              <Eye className="h-3.5 w-3.5" /> Previsualizar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void downloadCv(selected)}
                            >
                              <Download className="h-3.5 w-3.5" /> Descargar
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-500">
                          El candidato aún no ha cargado su Hoja de Vida desde su enlace.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Link2 className="h-4 w-4 text-zinc-500" />
                        Pre-Registro (24 campos)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      {selected.workflow ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between rounded-md border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                            <div>
                              <p className="font-medium">
                                {WORKFLOW_STEP_LABELS[selected.workflow.currentStep]}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                Ticket: {selected.workflow.helpdeskTicketId ?? 'Pendiente DSI'}
                              </p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <Link
                            href="/dashboard/th"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                          >
                            Ver expediente en Validación TH
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : preOnboardingLink ? (
                        <div className="space-y-2">
                          <p className="text-zinc-600 dark:text-zinc-400">
                            Pre-Registro habilitado en el portal del candidato (pendiente envío).
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleCopy(preOnboardingLink, 'pre')}
                            >
                              {copiedKey === 'pre' ? 'Copiado' : 'Copiar link Pre-Ingreso'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-zinc-500">
                            Habilita el formulario de 24 campos, anexos PDF y firma Ley 1581 dentro
                            del dashboard del candidato.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => enablePreOnboardingMutation.mutate(selected.id)}
                            disabled={enablePreOnboardingMutation.isPending}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {enablePreOnboardingMutation.isPending
                              ? 'Habilitando...'
                              : 'Habilitar Pre-Registro'}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* 3. Reuniones y Entrevistas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-zinc-500" />
                      Reuniones y Entrevistas ({selected.meetings.length})
                    </CardTitle>
                    <CardDescription>
                      Las reuniones programadas se muestran inmediatamente en el portal del candidato.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selected.meetings.length > 0 && (
                      <div className="divide-y divide-zinc-200/80 rounded-md border border-zinc-200/80 dark:divide-zinc-800/80 dark:border-zinc-800/80">
                        {selected.meetings.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-col gap-2 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{m.title}</span>
                                <Badge variant="outline">{m.meetingType}</Badge>
                              </div>
                              <p className="text-zinc-500">
                                {new Date(m.scheduledAt).toLocaleString('es-CO', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                                {m.interviewerName ? ` · Con ${m.interviewerName}` : ''}
                                {m.location ? ` · ${m.location}` : ''}
                              </p>
                              {m.meetingUrl && (
                                <a
                                  href={m.meetingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 underline dark:text-zinc-300"
                                >
                                  <Video className="h-3 w-3" /> Enlace de videollamada
                                </a>
                              )}
                            </div>

                            <Select
                              value={m.status}
                              onChange={(e) =>
                                updateMeetingMutation.mutate({
                                  meetingId: m.id,
                                  status: e.target.value as MeetingStatus,
                                })
                              }
                              className="w-40 text-xs"
                            >
                              {MEETING_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {MEETING_STATUS_LABELS[st]}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Formulario nueva reunión */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!meetingDate) return;
                        addMeetingMutation.mutate(selected.id);
                      }}
                      className="grid gap-3 rounded-md border border-zinc-200/80 bg-zinc-50/40 p-3.5 sm:grid-cols-3 dark:border-zinc-800/80 dark:bg-zinc-900/30"
                    >
                      <div className="space-y-1">
                        <Label className="text-[11px]">Título de reunión *</Label>
                        <Input
                          value={meetingTitle}
                          onChange={(e) => setMeetingTitle(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tipo</Label>
                        <Input
                          value={meetingType}
                          onChange={(e) => setMeetingType(e.target.value)}
                          placeholder="Entrevista TH / Técnica"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Fecha y hora *</Label>
                        <Input
                          type="datetime-local"
                          value={meetingDate}
                          onChange={(e) => setMeetingDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">URL videollamada</Label>
                        <Input
                          value={meetingUrl}
                          onChange={(e) => setMeetingUrl(e.target.value)}
                          placeholder="https://meet.google.com/..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Entrevistador</Label>
                        <Input
                          value={interviewerName}
                          onChange={(e) => setInterviewerName(e.target.value)}
                          placeholder="Nombre líder / analista"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Modalidad / Sala</Label>
                        <Input
                          value={meetingLocation}
                          onChange={(e) => setMeetingLocation(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-3">
                        <Label className="text-[11px]">Notas para el candidato</Label>
                        <Textarea
                          rows={2}
                          value={meetingNotes}
                          onChange={(e) => setMeetingNotes(e.target.value)}
                          placeholder="Indicaciones o temas a preparar..."
                        />
                      </div>
                      <div className="flex justify-end sm:col-span-3">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={addMeetingMutation.isPending || !meetingDate}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {addMeetingMutation.isPending ? 'Programando...' : 'Programar reunión'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {/* 4. Notificaciones y modificaciones del registro */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Bell className="h-4 w-4 text-zinc-500" />
                      Notificaciones y Modificaciones ({selected.notifications.length})
                    </CardTitle>
                    <CardDescription>
                      Historial enviado al portal del candidato (etapas, reuniones, devoluciones y
                      cambios de estado).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selected.notifications.length === 0 ? (
                      <p className="text-xs text-zinc-500">Sin notificaciones aún.</p>
                    ) : (
                      <div className="max-h-72 divide-y divide-zinc-200/80 overflow-y-auto rounded-md border border-zinc-200/80 dark:divide-zinc-800/80 dark:border-zinc-800/80">
                        {selected.notifications.map((n) => (
                          <div key={n.id} className="px-3.5 py-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{n.title}</span>
                              <span className="text-[11px] text-zinc-400">
                                {new Date(n.createdAt).toLocaleString('es-CO', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                            <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      <DocumentPreviewModal
        open={previewState.open}
        fileName={previewState.fileName}
        mimeType={previewState.mimeType}
        objectUrl={previewState.objectUrl}
        loading={previewState.loading}
        error={previewState.error}
        onClose={() => {
          if (previewState.objectUrl) {
            URL.revokeObjectURL(previewState.objectUrl);
          }
          setPreviewState((prev) => ({ ...prev, open: false, objectUrl: null }));
        }}
      />
    </AppShell>
  );
}
