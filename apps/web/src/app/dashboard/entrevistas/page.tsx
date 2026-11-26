'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Search,
  Star,
  UserCheck,
  Video,
} from 'lucide-react';
import {
  COMPETENCY_SCALE_LABELS,
  computeCompetencyScoreSummary,
  DEFAULT_COMPETENCY_RUBRIC,
  detectMeetingPlatform,
  EVALUATION_RECOMMENDATION_LABELS,
  EVALUATION_RECOMMENDATIONS,
  EvaluationRecommendation,
  INTERVIEW_DURATION_OPTIONS,
  MEETING_PLATFORM_LABELS,
  MEETING_PLATFORM_LOCATIONS,
  MEETING_STATUS_LABELS,
  MEETING_STATUSES,
  MeetingPlatform,
  MeetingStatus,
  OPERATIONAL_AREAS,
  OperationalArea,
  parseMeetingUrl,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient } from '@/lib/api';
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

type MainTab = 'AGENDA' | 'COMPETENCIES';
type AgendaFilter = 'UPCOMING' | 'TODAY' | 'COMPLETED' | 'ALL';

function getRecommendationVariant(
  rec: EvaluationRecommendation | null,
): 'default' | 'success' | 'warning' | 'danger' | 'outline' {
  switch (rec) {
    case 'STRONGLY_RECOMMEND':
    case 'RECOMMEND':
      return 'success';
    case 'RESERVATIONS':
      return 'warning';
    case 'NOT_RECOMMENDED':
      return 'danger';
    default:
      return 'outline';
  }
}

interface RubricDraftItem {
  key: string;
  label: string;
  category: 'TRANSVERSAL' | 'TECNICA';
  weight: number;
  score: number;
  observation: string;
}

function buildInitialRubricDraft(): RubricDraftItem[] {
  return DEFAULT_COMPETENCY_RUBRIC.map((item) => ({
    key: item.key,
    label: item.label,
    category: item.category,
    weight: item.weight,
    score: 4,
    observation: '',
  }));
}

export default function InterviewsAndCompetenciesPage() {
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>('AGENDA');
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>('UPCOMING');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Formulario agendar entrevista
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedProcessId, setSchedProcessId] = useState('');
  const [schedTitle, setSchedTitle] = useState('Entrevista por Competencias');
  const [schedType, setSchedType] = useState('Entrevista TH / Técnica');
  const [schedDate, setSchedDate] = useState('');
  const [schedDuration, setSchedDuration] = useState('45');
  const [schedPlatform, setSchedPlatform] = useState<MeetingPlatform>('TEAMS');
  const [schedUrl, setSchedUrl] = useState('');
  const [schedLocation, setSchedLocation] = useState(MEETING_PLATFORM_LOCATIONS.TEAMS);
  const [schedArea, setSchedArea] = useState<OperationalArea | ''>('');
  const [schedInterviewerName, setSchedInterviewerName] = useState('');
  const [schedInterviewerEmail, setSchedInterviewerEmail] = useState('');
  const [schedNotes, setSchedNotes] = useState('');
  const [allowOverlap, setAllowOverlap] = useState(false);

  // Formulario evaluación de competencias
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalProcessId, setEvalProcessId] = useState('');
  const [evalMeetingId, setEvalMeetingId] = useState('');
  const [evalStageLabel, setEvalStageLabel] = useState('Entrevista por Competencias');
  const [evalArea, setEvalArea] = useState<OperationalArea | ''>('');
  const [rubricScores, setRubricScores] = useState<RubricDraftItem[]>(buildInitialRubricDraft);
  const [evalRecommendation, setEvalRecommendation] =
    useState<EvaluationRecommendation>('RECOMMEND');
  const [evalStrengths, setEvalStrengths] = useState('');
  const [evalImprovements, setEvalImprovements] = useState('');
  const [evalSummaryNotes, setEvalSummaryNotes] = useState('');
  const [markMeetingCompleted, setMarkMeetingCompleted] = useState(true);

  const { data: agendaData, isLoading } = useQuery({
    queryKey: ['interviews-agenda'],
    queryFn: () => apiClient.getInterviewsAgenda(),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['interviews-agenda'] });
    void queryClient.invalidateQueries({ queryKey: ['candidate-processes'] });
  };

  const parsedSchedUrl = parseMeetingUrl(schedUrl);

  const createMeetingMutation = useMutation({
    mutationFn: () => {
      if (parsedSchedUrl.error) {
        throw new Error(parsedSchedUrl.error);
      }
      return apiClient.createCandidateMeeting(schedProcessId, {
        title: schedTitle.trim(),
        meetingType: schedType.trim() || undefined,
        scheduledAt: new Date(schedDate).toISOString(),
        durationMinutes: Number(schedDuration) || 45,
        meetingUrl: parsedSchedUrl.url ?? undefined,
        location: schedLocation.trim() || undefined,
        interviewerName: schedInterviewerName.trim() || undefined,
        interviewerEmail: schedInterviewerEmail.trim() || undefined,
        operationalArea: schedArea || undefined,
        notes: schedNotes.trim() || undefined,
        allowOverlap,
      });
    },
    onSuccess: () => {
      setFeedback(
        'Entrevista agendada en calendario, publicada en portal candidato y notificada por correo.',
      );
      setScheduleOpen(false);
      setSchedDate('');
      setSchedUrl('');
      setSchedNotes('');
      setAllowOverlap(false);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo agendar la entrevista.');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ meetingId, status }: { meetingId: string; status: MeetingStatus }) =>
      apiClient.updateCandidateMeeting(meetingId, { status }),
    onSuccess: () => {
      setFeedback('Estado de entrevista actualizado.');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error actualizando estado.');
    },
  });

  const createEvaluationMutation = useMutation({
    mutationFn: () =>
      apiClient.createCandidateEvaluation(evalProcessId, {
        meetingId: evalMeetingId || undefined,
        stageLabel: evalStageLabel.trim() || undefined,
        operationalArea: evalArea || undefined,
        scores: rubricScores.map((r) => ({
          key: r.key,
          label: r.label,
          score: r.score,
          weight: r.weight,
          observation: r.observation.trim() || undefined,
        })),
        recommendation: evalRecommendation,
        strengths: evalStrengths.trim() || undefined,
        improvementAreas: evalImprovements.trim() || undefined,
        summaryNotes: evalSummaryNotes.trim() || undefined,
        markMeetingCompleted: Boolean(evalMeetingId) && markMeetingCompleted,
      }),
    onSuccess: (created) => {
      setFeedback(
        `Evaluación guardada (${created.overallScore.toFixed(2)} / 5.00 · ${created.recommendationLabel}).`,
      );
      setEvalOpen(false);
      setRubricScores(buildInitialRubricDraft());
      setEvalStrengths('');
      setEvalImprovements('');
      setEvalSummaryNotes('');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error guardando la evaluación.');
    },
  });

  const downloadIcs = async (meetingId: string) => {
    try {
      const res = await apiClient.fetchProtectedBlob(`/candidate-portal/meetings/${meetingId}/ics`);
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = `entrevista-${meetingId.slice(0, 8)}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo descargar el calendario .ics');
    }
  };

  const openEvaluationForMeeting = (params: {
    processId: string;
    meetingId?: string;
    stageLabel?: string;
    area?: OperationalArea | null;
  }) => {
    setScheduleOpen(false);
    setEvalOpen(true);
    setEvalProcessId(params.processId);
    setEvalMeetingId(params.meetingId ?? '');
    setEvalStageLabel(params.stageLabel ?? 'Entrevista por Competencias');
    setEvalArea(params.area ?? '');
  };

  const liveEvalSummary = useMemo(
    () => computeCompetencyScoreSummary(rubricScores),
    [rubricScores],
  );

  const kpis = agendaData?.kpis ?? {
    totalInterviews: 0,
    scheduledTodayCount: 0,
    upcomingCount: 0,
    completedCount: 0,
    evaluationsCount: 0,
  };

  const candidates = agendaData?.candidates ?? [];

  const filteredMeetings = useMemo(() => {
    const rows = agendaData?.meetings ?? [];
    const now = Date.now();
    const todayKey = new Date().toISOString().slice(0, 10);
    const q = searchTerm.trim().toLowerCase();

    return rows.filter((m) => {
      const timeMs = new Date(m.scheduledAt).getTime();
      const dayKey = new Date(m.scheduledAt).toISOString().slice(0, 10);

      if (agendaFilter === 'TODAY') {
        if (m.status === 'CANCELLED' || dayKey !== todayKey) return false;
      } else if (agendaFilter === 'UPCOMING') {
        if (m.status === 'CANCELLED' || m.status === 'COMPLETED' || timeMs < now - 3600_000) {
          return false;
        }
      } else if (agendaFilter === 'COMPLETED') {
        if (m.status !== 'COMPLETED') return false;
      }

      if (!q) return true;
      return [
        m.title,
        m.meetingType,
        m.interviewerName,
        m.interviewerEmail,
        m.process?.candidateName,
        m.process?.appliedRole,
      ].some((val) => val?.toLowerCase().includes(q));
    });
  }, [agendaData?.meetings, agendaFilter, searchTerm]);

  const filteredCandidates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return candidates.filter((c) => {
      if (!q) return true;
      return [c.candidateName, c.candidateEmail, c.appliedRole, c.nationalId].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [candidates, searchTerm]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Agendamiento de Entrevistas y Evaluación de Competencias
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Agenda consolidada con validación anti-traslapes, descarga .ics, links Teams/Meet y
              rúbrica ponderada (escala 1–5) para TH y Líderes de Área.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setScheduleOpen(false);
                setEvalOpen((v) => !v);
                if (!evalProcessId && candidates[0]) {
                  setEvalProcessId(candidates[0].id);
                }
              }}
            >
              <Award className="h-3.5 w-3.5" />
              {evalOpen ? 'Cerrar evaluación' : 'Evaluar competencias'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEvalOpen(false);
                setScheduleOpen((v) => !v);
                if (!schedProcessId && candidates[0]) {
                  setSchedProcessId(candidates[0].id);
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {scheduleOpen ? 'Cerrar agenda' : 'Agendar entrevista'}
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Entrevistas hoy
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.scheduledTodayCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Próximas programadas
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.upcomingCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Realizadas
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.completedCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-4 py-3 dark:border-emerald-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Evaluaciones de competencias
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {kpis.evaluationsCount}
            </p>
          </div>
        </div>

        {feedback && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Formulario agendar entrevista con detección de conflictos */}
        {scheduleOpen && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarPlus className="h-4 w-4 text-zinc-500" />
                Agendar entrevista en Teams / Meet
              </CardTitle>
              <CardDescription>
                Valida traslapes del entrevistador, notifica al candidato y al entrevistador y genera
                archivo .ics descargable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!schedProcessId || !schedDate || parsedSchedUrl.error) return;
                  createMeetingMutation.mutate();
                }}
                className="grid gap-3 sm:grid-cols-3"
              >
                <div className="space-y-1">
                  <Label className="text-[11px]">Candidato *</Label>
                  <Select
                    value={schedProcessId}
                    onChange={(e) => setSchedProcessId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona candidato...</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.candidateName} ({c.appliedRole ?? 'Sin cargo'})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Título entrevista *</Label>
                  <Input
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Etapa / Tipo</Label>
                  <Input
                    value={schedType}
                    onChange={(e) => setSchedType(e.target.value)}
                    placeholder="Entrevista TH / Técnica Líder"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Fecha y hora *</Label>
                  <Input
                    type="datetime-local"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Duración</Label>
                  <Select
                    value={schedDuration}
                    onChange={(e) => setSchedDuration(e.target.value)}
                  >
                    {INTERVIEW_DURATION_OPTIONS.map((mins) => (
                      <option key={mins} value={String(mins)}>
                        {mins} minutos
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Área evaluadora</Label>
                  <Select
                    value={schedArea}
                    onChange={(e) => setSchedArea((e.target.value as OperationalArea) || '')}
                  >
                    <option value="">TH / Transversal</option>
                    {OPERATIONAL_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-[11px]">Enlace Microsoft Teams o Google Meet</Label>
                    <div className="flex gap-1">
                      {(['TEAMS', 'MEET', 'OTHER'] as MeetingPlatform[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setSchedPlatform(p);
                            setSchedLocation(MEETING_PLATFORM_LOCATIONS[p]);
                          }}
                          className={`rounded border px-2 py-0.5 text-[10px] font-medium cursor-pointer ${
                            schedPlatform === p
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                              : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
                          }`}
                        >
                          {p === 'TEAMS' ? 'Teams' : p === 'MEET' ? 'Google Meet' : 'Presencial/Otro'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    value={schedUrl}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSchedUrl(v);
                      const parsed = parseMeetingUrl(v);
                      if (parsed.platform === 'TEAMS' || parsed.platform === 'MEET') {
                        setSchedPlatform(parsed.platform);
                        setSchedLocation(MEETING_PLATFORM_LOCATIONS[parsed.platform]);
                      }
                    }}
                    placeholder={
                      schedPlatform === 'TEAMS'
                        ? 'https://teams.microsoft.com/l/meetup-join/...'
                        : schedPlatform === 'MEET'
                          ? 'https://meet.google.com/xxx-xxxx-xxx'
                          : 'https://... (opcional)'
                    }
                  />
                  {parsedSchedUrl.error && (
                    <p className="text-[11px] text-rose-600">{parsedSchedUrl.error}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Modalidad / Sala</Label>
                  <Input
                    value={schedLocation}
                    onChange={(e) => setSchedLocation(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Nombre entrevistador</Label>
                  <Input
                    value={schedInterviewerName}
                    onChange={(e) => setSchedInterviewerName(e.target.value)}
                    placeholder="Ej. Carolina Mejía (TH)"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px]">
                    Correo entrevistador (envía citación automática y valida cruces)
                  </Label>
                  <Input
                    type="email"
                    value={schedInterviewerEmail}
                    onChange={(e) => setSchedInterviewerEmail(e.target.value)}
                    placeholder="entrevistador@alliance.com.co"
                  />
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-[11px]">Indicaciones / Temas</Label>
                  <Textarea
                    rows={2}
                    value={schedNotes}
                    onChange={(e) => setSchedNotes(e.target.value)}
                    placeholder="Ej. Evaluar competencias técnicas y prueba práctica..."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowOverlap}
                      onChange={(e) => setAllowOverlap(e.target.checked)}
                    />
                    Permitir cruce horario si el entrevistador atiende en paralelo
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduleOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        createMeetingMutation.isPending ||
                        !schedProcessId ||
                        !schedDate ||
                        Boolean(parsedSchedUrl.error)
                      }
                    >
                      {createMeetingMutation.isPending ? 'Agendando...' : 'Confirmar entrevista'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Rúbrica estructurada de Evaluación de Competencias */}
        {evalOpen && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Award className="h-4 w-4 text-zinc-500" />
                    Rúbrica de Evaluación de Competencias (Escala 1–5)
                  </CardTitle>
                  <CardDescription>
                    Evaluación confidencial interna de TH y Líderes Técnicos (no visible para el
                    candidato).
                  </CardDescription>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  Promedio ponderado:{' '}
                  <strong className="text-emerald-700 dark:text-emerald-300">
                    {liveEvalSummary.overallScore.toFixed(2)} / 5.00 ({liveEvalSummary.percentageScore}%)
                  </strong>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!evalProcessId) return;
                  createEvaluationMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Candidato *</Label>
                    <Select
                      value={evalProcessId}
                      onChange={(e) => {
                        setEvalProcessId(e.target.value);
                        setEvalMeetingId('');
                      }}
                      required
                    >
                      <option value="">Selecciona candidato...</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.candidateName} ({c.appliedRole ?? 'Sin cargo'})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">Etapa evaluada</Label>
                    <Input
                      value={evalStageLabel}
                      onChange={(e) => setEvalStageLabel(e.target.value)}
                      placeholder="Entrevista TH / Técnica"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">Área</Label>
                    <Select
                      value={evalArea}
                      onChange={(e) => setEvalArea((e.target.value as OperationalArea) || '')}
                    >
                      <option value="">Transversal / TH</option>
                      {OPERATIONAL_AREAS.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Matriz de 6 competencias */}
                <div className="divide-y divide-zinc-200/80 rounded-md border border-zinc-200/80 dark:divide-zinc-800/80 dark:border-zinc-800/80">
                  {rubricScores.map((item, idx) => (
                    <div
                      key={item.key}
                      className="grid gap-2.5 p-3 text-xs sm:grid-cols-12 sm:items-center"
                    >
                      <div className="sm:col-span-5 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-950 dark:text-zinc-100">
                            {item.label}
                          </span>
                          <Badge variant="outline">Peso {item.weight}%</Badge>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          {DEFAULT_COMPETENCY_RUBRIC[idx]?.description}
                        </p>
                      </div>

                      <div className="sm:col-span-3 flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              title={COMPETENCY_SCALE_LABELS[n]}
                              onClick={() =>
                                setRubricScores((prev) =>
                                  prev.map((row, i) => (i === idx ? { ...row, score: n } : row)),
                                )
                              }
                              className={`h-7 w-7 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                                item.score === n
                                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {COMPETENCY_SCALE_LABELS[item.score]}
                        </span>
                      </div>

                      <div className="sm:col-span-4">
                        <Input
                          value={item.observation}
                          onChange={(e) =>
                            setRubricScores((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, observation: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Evidencia o comentario (opcional)"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Recomendación final *</Label>
                    <Select
                      value={evalRecommendation}
                      onChange={(e) =>
                        setEvalRecommendation(e.target.value as EvaluationRecommendation)
                      }
                    >
                      {EVALUATION_RECOMMENDATIONS.map((rec) => (
                        <option key={rec} value={rec}>
                          {EVALUATION_RECOMMENDATION_LABELS[rec]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Fortalezas clave</Label>
                    <Input
                      value={evalStrengths}
                      onChange={(e) => setEvalStrengths(e.target.value)}
                      placeholder="Puntos destacados en la entrevista..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Brechas / Oportunidades de mejora</Label>
                    <Input
                      value={evalImprovements}
                      onChange={(e) => setEvalImprovements(e.target.value)}
                      placeholder="Aspectos a reforzar en onboarding..."
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Conclusión general del entrevistador</Label>
                  <Textarea
                    rows={2}
                    value={evalSummaryNotes}
                    onChange={(e) => setEvalSummaryNotes(e.target.value)}
                    placeholder="Concepto técnico / cultural para decisión de contratación..."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {evalMeetingId ? (
                    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={markMeetingCompleted}
                        onChange={(e) => setMarkMeetingCompleted(e.target.checked)}
                      />
                      Marcar entrevista asociada como Realizada automáticamente
                    </label>
                  ) : (
                    <span />
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEvalOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={createEvaluationMutation.isPending || !evalProcessId}
                    >
                      {createEvaluationMutation.isPending ? 'Guardando...' : 'Guardar evaluación'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabs y buscador */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-zinc-200/80 bg-white p-1 dark:border-zinc-800/80 dark:bg-[#0f0f12]">
            <button
              type="button"
              onClick={() => setMainTab('AGENDA')}
              className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                mainTab === 'AGENDA'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              Agenda de Entrevistas ({kpis.totalInterviews})
            </button>
            <button
              type="button"
              onClick={() => setMainTab('COMPETENCIES')}
              className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                mainTab === 'COMPETENCIES'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              Matriz de Competencias por Candidato ({candidates.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar candidato, cargo o entrevistador..."
                className="w-60 pl-8 text-xs"
              />
            </div>
            {mainTab === 'AGENDA' && (
              <Select
                value={agendaFilter}
                onChange={(e) => setAgendaFilter(e.target.value as AgendaFilter)}
                className="w-44 text-xs"
              >
                <option value="UPCOMING">Próximas activas</option>
                <option value="TODAY">Solo hoy</option>
                <option value="COMPLETED">Realizadas</option>
                <option value="ALL">Todas las entrevistas</option>
              </Select>
            )}
          </div>
        </div>

        {/* Contenido Tab 1: Agenda */}
        {mainTab === 'AGENDA' ? (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  Cargando agenda de entrevistas...
                </div>
              ) : filteredMeetings.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No hay entrevistas programadas en este filtro.
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {filteredMeetings.map((m) => {
                    const platform = m.meetingUrl
                      ? detectMeetingPlatform(m.meetingUrl, m.location)
                      : null;

                    return (
                      <div
                        key={m.id}
                        className="flex flex-col gap-3 p-4 text-xs lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
                              {m.process?.candidateName ?? 'Candidato'}
                            </span>
                            {m.process?.appliedRole && (
                              <span className="text-zinc-500">· {m.process.appliedRole}</span>
                            )}
                            <Badge variant="outline">{m.meetingType}</Badge>
                            {m.operationalArea && (
                              <Badge variant="secondary">{m.operationalArea}</Badge>
                            )}
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3" /> {m.durationMinutes ?? 45} min
                            </Badge>
                            {platform && platform !== 'OTHER' && (
                              <Badge variant={platform === 'TEAMS' ? 'default' : 'success'}>
                                {MEETING_PLATFORM_LABELS[platform]}
                              </Badge>
                            )}
                            {m.evaluation && (
                              <Badge variant={getRecommendationVariant(m.evaluation.recommendation)}>
                                <Star className="h-3 w-3" /> {m.evaluation.overallScore.toFixed(2)} / 5 ·{' '}
                                {m.evaluation.recommendationLabel}
                              </Badge>
                            )}
                          </div>

                          <p className="text-zinc-600 dark:text-zinc-400">
                            <strong>{m.title}</strong> ·{' '}
                            {new Date(m.scheduledAt).toLocaleString('es-CO', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                            {m.interviewerName ? ` · Entrevistador: ${m.interviewerName}` : ''}
                            {m.location ? ` · ${m.location}` : ''}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {m.meetingUrl && m.status !== 'CANCELLED' && (
                              <a
                                href={m.meetingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                              >
                                <Video className="h-3 w-3" />
                                {platform && platform !== 'OTHER'
                                  ? `Unirse por ${MEETING_PLATFORM_LABELS[platform]}`
                                  : 'Abrir videollamada'}
                                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadIcs(m.id)}
                              className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 text-[11px] hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 cursor-pointer"
                            >
                              <Calendar className="h-3 w-3" />
                              Calendario (.ics)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openEvaluationForMeeting({
                                  processId: m.processId,
                                  meetingId: m.id,
                                  stageLabel: m.meetingType || m.title,
                                  area: m.operationalArea,
                                })
                              }
                              className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 cursor-pointer"
                            >
                              <Award className="h-3 w-3" />
                              {m.evaluation ? 'Agregar otra evaluación' : 'Evaluar competencias'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={m.status}
                            onChange={(e) =>
                              updateStatusMutation.mutate({
                                meetingId: m.id,
                                status: e.target.value as MeetingStatus,
                              })
                            }
                            className="w-36 text-xs"
                          >
                            {MEETING_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {MEETING_STATUS_LABELS[st]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Contenido Tab 2: Matriz de competencias consolidada por candidato */
          <div className="space-y-4">
            {filteredCandidates.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-xs text-zinc-500">
                  No hay candidatos que coincidan con el buscador.
                </CardContent>
              </Card>
            ) : (
              filteredCandidates.map((cand) => (
                <Card key={cand.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                          <UserCheck className="h-4 w-4 text-zinc-500" />
                          {cand.candidateName}
                          <Badge variant="outline">{cand.stageLabel}</Badge>
                          {cand.evaluationSummary.averageScore !== null ? (
                            <Badge
                              variant={getRecommendationVariant(
                                cand.evaluationSummary.latestRecommendation,
                              )}
                            >
                              <Star className="h-3 w-3" />
                              Promedio: {cand.evaluationSummary.averageScore.toFixed(2)} / 5.00 (
                              {cand.evaluationSummary.averagePercentage}%) ·{' '}
                              {cand.evaluationSummary.latestRecommendationLabel}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Sin evaluaciones aún</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {cand.appliedRole ?? 'Cargo por definir'} · {cand.candidateEmail}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href="/dashboard/candidatos"
                          className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        >
                          Ver proceso completo
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openEvaluationForMeeting({ processId: cand.id })}
                        >
                          <Award className="h-3.5 w-3.5" />
                          Evaluar
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {cand.evaluations.length > 0 && (
                    <CardContent className="space-y-3 pt-0">
                      {cand.evaluations.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-md border border-zinc-200/80 bg-zinc-50/50 p-3 text-xs space-y-2 dark:border-zinc-800/80 dark:bg-zinc-900/40"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{ev.stageLabel}</span>
                              <span className="text-zinc-500">
                                por {ev.evaluatorName} ({ev.evaluatorRole})
                              </span>
                              <Badge variant={getRecommendationVariant(ev.recommendation)}>
                                {ev.overallScore.toFixed(2)} / 5 · {ev.recommendationLabel}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-zinc-400">
                              {new Date(ev.createdAt).toLocaleString('es-CO', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            {ev.scores.map((s) => (
                              <div
                                key={s.key}
                                className="rounded border border-zinc-200/80 bg-white px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-medium truncate">{s.label}</span>
                                  <strong>{s.score}/5</strong>
                                </div>
                                <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                                  <div
                                    className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                                    style={{ width: `${(s.score / 5) * 100}%` }}
                                  />
                                </div>
                                {s.observation && (
                                  <p className="mt-1 text-[10px] text-zinc-500">{s.observation}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          {(ev.strengths || ev.improvementAreas || ev.summaryNotes) && (
                            <div className="grid gap-2 pt-1 text-[11px] text-zinc-600 dark:text-zinc-300 sm:grid-cols-3">
                              {ev.strengths && (
                                <p>
                                  <strong className="text-emerald-700 dark:text-emerald-400">
                                    Fortalezas:
                                  </strong>{' '}
                                  {ev.strengths}
                                </p>
                              )}
                              {ev.improvementAreas && (
                                <p>
                                  <strong className="text-amber-700 dark:text-amber-400">
                                    Por mejorar:
                                  </strong>{' '}
                                  {ev.improvementAreas}
                                </p>
                              )}
                              {ev.summaryNotes && (
                                <p>
                                  <strong>Conclusión:</strong> {ev.summaryNotes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
