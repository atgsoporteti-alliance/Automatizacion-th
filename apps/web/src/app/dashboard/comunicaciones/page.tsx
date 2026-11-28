'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  Lock,
  Megaphone,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  NewsCategory,
  PULSE_QUESTION_TYPES,
  PULSE_QUESTION_TYPE_LABELS,
  PULSE_SURVEY_STATUSES,
  PULSE_SURVEY_STATUS_LABELS,
  PulseQuestionType,
  PulseSurveyStatus,
  USER_OPERATIONAL_AREAS,
  UserOperationalArea,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import {
  apiClient,
  NewsPostItem,
  PulseQuestionAnalytics,
  PulseSurveyItem,
} from '@/lib/api';
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
  Progress,
  Select,
  Textarea,
} from '@/components/ui/primitives';

type ActiveTab = 'NEWS' | 'PULSE';

interface DraftQuestion {
  id: string;
  prompt: string;
  type: PulseQuestionType;
  required: boolean;
  optionsText: string;
}

const AREA_DISPLAY_LABELS: Record<UserOperationalArea, string> = {
  ALL: 'Toda la Compañía',
  CUSTOMER: 'Customer Operations',
  VENTAS: 'Ventas & Comercial',
  DSI: 'DSI / Tecnología',
};

const CATEGORY_BADGE_VARIANT: Record<
  NewsCategory,
  'default' | 'secondary' | 'success' | 'warning' | 'purple' | 'outline'
> = {
  GENERAL: 'default',
  CULTURE: 'purple',
  BENEFITS: 'success',
  RECOGNITION: 'warning',
  OPERATIONS: 'secondary',
  SECURITY: 'outline',
};

const SURVEY_STATUS_BADGE: Record<PulseSurveyStatus, 'default' | 'success' | 'secondary'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  CLOSED: 'default',
};

const WEEKLY_PULSE_PRESET: DraftQuestion[] = [
  {
    id: 'q_climate',
    prompt: '¿Cómo calificas el clima laboral y apoyo de tu equipo esta semana?',
    type: 'SCALE_5',
    required: true,
    optionsText: '',
  },
  {
    id: 'q_enps',
    prompt: 'De 0 a 10, ¿qué tan probable es que recomiendes trabajar en Alliance?',
    type: 'ENPS_10',
    required: true,
    optionsText: '',
  },
  {
    id: 'q_workload',
    prompt: '¿Cómo percibes tu carga de trabajo actual?',
    type: 'SINGLE_CHOICE',
    required: true,
    optionsText: 'Equilibrada, Alta pero manejable, Sobrecargada',
  },
  {
    id: 'q_comment',
    prompt: '¿Qué deberíamos mejorar o mantener en el equipo? (Comentario 100% anónimo)',
    type: 'OPEN_TEXT',
    required: false,
    optionsText: '',
  },
];

const ONBOARDING_PULSE_PRESET: DraftQuestion[] = [
  {
    id: 'q_clarity',
    prompt: '¿Qué tan claro fue tu acompañamiento de ingreso y herramientas?',
    type: 'SCALE_5',
    required: true,
    optionsText: '',
  },
  {
    id: 'q_enps_onb',
    prompt: 'En tu experiencia inicial, ¿qué tanto recomendarías unirte a Alliance? (0-10)',
    type: 'ENPS_10',
    required: true,
    optionsText: '',
  },
  {
    id: 'q_feedback_onb',
    prompt: 'Comparte sugerencias anónimas para mejorar el proceso de onboarding:',
    type: 'OPEN_TEXT',
    required: false,
    optionsText: '',
  },
];

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getEnpsColor(score: number): string {
  if (score >= 9) return 'bg-emerald-600 text-white border-emerald-600';
  if (score >= 7) return 'bg-amber-500 text-white border-amber-500';
  return 'bg-rose-600 text-white border-rose-600';
}

export default function CommunicationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('NEWS');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | ''>('');
  const [surveyStatusFilter, setSurveyStatusFilter] = useState<PulseSurveyStatus | ''>('');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado formulario crear comunicado
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsCategory, setNewsCategory] = useState<NewsCategory>('GENERAL');
  const [newsTargetArea, setNewsTargetArea] = useState<UserOperationalArea>('ALL');
  const [newsPinned, setNewsPinned] = useState(false);
  const [newsPublished, setNewsPublished] = useState(true);

  // Comentarios y confirmaciones por comunicado
  const [openCommentsByPost, setOpenCommentsByPost] = useState<Record<string, boolean>>({});
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<string, string>>({});
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);

  // Estado formulario crear encuesta de pulso
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [surveyArea, setSurveyArea] = useState<UserOperationalArea>('ALL');
  const [surveyStatus, setSurveyStatus] = useState<PulseSurveyStatus>('ACTIVE');
  const [surveyClosesAt, setSurveyClosesAt] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>(WEEKLY_PULSE_PRESET);

  // Respuestas anónimas en progreso por encuesta
  const [answersBySurvey, setAnswersBySurvey] = useState<
    Record<string, Record<string, number | string>>
  >({});
  const [expandedAnalyticsBySurvey, setExpandedAnalyticsBySurvey] = useState<
    Record<string, boolean>
  >({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['communications-overview', categoryFilter, searchTerm, surveyStatusFilter],
    queryFn: () =>
      apiClient.getCommunicationsOverview({
        category: categoryFilter,
        search: searchTerm.trim() || undefined,
        surveyStatus: surveyStatusFilter,
      }),
  });

  const invalidateOverview = async () => {
    await queryClient.invalidateQueries({ queryKey: ['communications-overview'] });
  };

  const createNewsMutation = useMutation({
    mutationFn: apiClient.createNewsPost,
    onSuccess: async () => {
      setShowNewsForm(false);
      setNewsTitle('');
      setNewsSummary('');
      setNewsContent('');
      setNewsPinned(false);
      setNewsPublished(true);
      setFeedbackBanner({
        type: 'success',
        message: 'Comunicado publicado en el muro corporativo.',
      });
      await invalidateOverview();
    },
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const updateNewsMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { isPinned?: boolean; isPublished?: boolean };
    }) => apiClient.updateNewsPost(id, payload),
    onSuccess: invalidateOverview,
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const deleteNewsMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteNewsPost(id),
    onSuccess: async () => {
      setConfirmDeletePostId(null);
      setFeedbackBanner({ type: 'success', message: 'Comunicado eliminado.' });
      await invalidateOverview();
    },
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const reactMutation = useMutation({
    mutationFn: (postId: string) => apiClient.toggleNewsReaction(postId),
    onSuccess: invalidateOverview,
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      apiClient.addNewsComment(postId, body),
    onSuccess: async (_res, vars) => {
      setCommentDraftByPost((prev) => ({ ...prev, [vars.postId]: '' }));
      setOpenCommentsByPost((prev) => ({ ...prev, [vars.postId]: true }));
      await invalidateOverview();
    },
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const createSurveyMutation = useMutation({
    mutationFn: apiClient.createPulseSurvey,
    onSuccess: async () => {
      setShowSurveyForm(false);
      setSurveyTitle('');
      setSurveyDescription('');
      setSurveyClosesAt('');
      setDraftQuestions(WEEKLY_PULSE_PRESET);
      setFeedbackBanner({
        type: 'success',
        message: 'Encuesta de pulso anónima creada exitosamente.',
      });
      await invalidateOverview();
    },
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const updateSurveyStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PulseSurveyStatus }) =>
      apiClient.updatePulseSurveyStatus(id, status),
    onSuccess: invalidateOverview,
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const submitPulseMutation = useMutation({
    mutationFn: ({
      surveyId,
      answers,
    }: {
      surveyId: string;
      answers: Record<string, number | string>;
    }) => apiClient.submitPulseResponse(surveyId, answers),
    onSuccess: async (result) => {
      setAnswersBySurvey((prev) => {
        const next = { ...prev };
        delete next[result.surveyId];
        return next;
      });
      setExpandedAnalyticsBySurvey((prev) => ({ ...prev, [result.surveyId]: true }));
      setFeedbackBanner({
        type: 'success',
        message: result.privacyGuarantee,
      });
      await invalidateOverview();
    },
    onError: (err: Error) => {
      setFeedbackBanner({ type: 'error', message: err.message });
    },
  });

  const canManage = data?.permissions.canManageCommunications ?? false;
  const posts = data?.posts ?? [];
  const surveys = data?.surveys ?? [];

  const pendingPulseCount = data?.surveyKpis.pendingForMeCount ?? 0;

  const setQuestionAnswer = (
    surveyId: string,
    questionId: string,
    value: number | string,
  ) => {
    setAnswersBySurvey((prev) => ({
      ...prev,
      [surveyId]: {
        ...(prev[surveyId] ?? {}),
        [questionId]: value,
      },
    }));
  };

  const applyPreset = (preset: 'WEEKLY' | 'ONBOARDING') => {
    if (preset === 'WEEKLY') {
      setSurveyTitle('Pulso Semanal de Clima y eNPS');
      setSurveyDescription(
        'Termómetro breve y 100% anónimo para medir energía del equipo, carga operativa y recomendación.',
      );
      setDraftQuestions(WEEKLY_PULSE_PRESET);
    } else {
      setSurveyTitle('Pulso de Adaptación Onboarding 30 Días');
      setSurveyDescription(
        'Encuesta anónima sobre herramientas, bienvenida y claridad del rol.',
      );
      setDraftQuestions(ONBOARDING_PULSE_PRESET);
    }
  };

  const addCustomQuestion = () => {
    const idx = draftQuestions.length + 1;
    setDraftQuestions((prev) => [
      ...prev,
      {
        id: `q_custom_${Date.now()}_${idx}`,
        prompt: '',
        type: 'SCALE_5',
        required: true,
        optionsText: '',
      },
    ]);
  };

  const handleCreateNewsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createNewsMutation.mutate({
      title: newsTitle,
      summary: newsSummary || undefined,
      content: newsContent,
      category: newsCategory,
      targetArea: newsTargetArea,
      isPinned: newsPinned,
      isPublished: newsPublished,
    });
  };

  const handleCreateSurveySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const formattedQuestions = draftQuestions.map((q, index) => ({
      id: q.id.trim() || `q_${index + 1}`,
      prompt: q.prompt.trim(),
      type: q.type,
      required: q.required,
      ...(q.type === 'SINGLE_CHOICE'
        ? {
            options: q.optionsText
              .split(',')
              .map((opt) => opt.trim())
              .filter(Boolean),
          }
        : {}),
    }));

    createSurveyMutation.mutate({
      title: surveyTitle,
      description: surveyDescription || undefined,
      status: surveyStatus,
      targetArea: surveyArea,
      closesAt: surveyClosesAt || undefined,
      questions: formattedQuestions,
    });
  };

  const kpiCards = useMemo(() => {
    const enps = data?.surveyKpis.latestEnpsScore;
    return [
      {
        label: 'Comunicados Visibles',
        value: String(data?.newsKpis.totalPosts ?? 0),
        sub: `${data?.newsKpis.pinnedCount ?? 0} fijados · ${data?.newsKpis.totalReactions ?? 0} reacciones`,
      },
      {
        label: 'Conversación Interna',
        value: String(data?.newsKpis.totalComments ?? 0),
        sub: 'Comentarios en comunicados corporativos',
      },
      {
        label: 'Encuestas de Pulso Activas',
        value: String(data?.surveyKpis.activeCount ?? 0),
        sub:
          pendingPulseCount > 0
            ? `${pendingPulseCount} pendiente(s) por tu voto anónimo`
            : 'Estás al día con tus respuestas',
      },
      {
        label: 'eNPS Consolidado',
        value: enps !== null && enps !== undefined ? `${enps > 0 ? '+' : ''}${enps}` : 'k < 3',
        sub: `${data?.surveyKpis.totalResponses ?? 0} respuestas anónimas totales`,
      },
    ];
  }, [data, pendingPulseCount]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="purple">Cultura y Clima</Badge>
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Pulso 100% Anónimo (k ≥ 3)
              </Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Muro de Noticias Corporativas y Encuestas de Pulso
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Anuncios oficiales segmentados por área operativa y termómetro semanal de clima
              sin vínculo de identidad.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setActiveTab('NEWS')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'NEWS'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              Muro de Noticias
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {posts.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PULSE')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'PULSE'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Activity className="h-4 w-4" />
              Encuestas de Pulso
              {pendingPulseCount > 0 ? (
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingPulseCount}
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {surveys.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Alerta de feedback */}
        {feedbackBanner ? (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              feedbackBanner.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {feedbackBanner.message}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* KPIs superiores */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Barra de filtros */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar comunicados, temas o encuestas..."
                  className="pl-9"
                />
              </div>

              {activeTab === 'NEWS' ? (
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as NewsCategory | '')}
                  className="w-full md:w-56"
                >
                  <option value="">Todas las categorías</option>
                  {NEWS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {NEWS_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select
                  value={surveyStatusFilter}
                  onChange={(e) =>
                    setSurveyStatusFilter(e.target.value as PulseSurveyStatus | '')
                  }
                  className="w-full md:w-52"
                >
                  <option value="">Todos los estados</option>
                  {PULSE_SURVEY_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {PULSE_SURVEY_STATUS_LABELS[st]}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {canManage ? (
              activeTab === 'NEWS' ? (
                <Button onClick={() => setShowNewsForm((prev) => !prev)} className="gap-2">
                  {showNewsForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showNewsForm ? 'Cerrar Editor' : 'Publicar Comunicado'}
                </Button>
              ) : (
                <Button onClick={() => setShowSurveyForm((prev) => !prev)} className="gap-2">
                  {showSurveyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showSurveyForm ? 'Cerrar Constructor' : 'Nueva Encuesta de Pulso'}
                </Button>
              )
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-rose-200 dark:border-rose-900">
            <CardContent className="p-6 text-sm text-rose-700 dark:text-rose-300">
              No se pudieron cargar las comunicaciones: {(error as Error).message}
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Cargando muro de noticias y encuestas de pulso...
            </CardContent>
          </Card>
        ) : activeTab === 'NEWS' ? (
          <div className="space-y-6">
            {/* Constructor de comunicado (solo TH / Super Admin) */}
            {canManage && showNewsForm ? (
              <Card className="border-indigo-200 dark:border-indigo-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Megaphone className="h-5 w-5 text-indigo-600" />
                    Nuevo Comunicado Corporativo
                  </CardTitle>
                  <CardDescription>
                    Publica anuncios oficiales para toda la organización o para un área
                    operativa específica.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateNewsSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <Label htmlFor="news-title">Título del Comunicado</Label>
                        <Input
                          id="news-title"
                          required
                          minLength={3}
                          maxLength={180}
                          value={newsTitle}
                          onChange={(e) => setNewsTitle(e.target.value)}
                          placeholder="Ej: Nuevos beneficios de bienestar y día flexible Q4"
                        />
                      </div>
                      <div>
                        <Label htmlFor="news-cat">Categoría</Label>
                        <Select
                          id="news-cat"
                          value={newsCategory}
                          onChange={(e) => setNewsCategory(e.target.value as NewsCategory)}
                        >
                          {NEWS_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {NEWS_CATEGORY_LABELS[cat]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <Label htmlFor="news-summary">Resumen corto (opcional)</Label>
                        <Input
                          id="news-summary"
                          maxLength={320}
                          value={newsSummary}
                          onChange={(e) => setNewsSummary(e.target.value)}
                          placeholder="Extracto rápido visible en el feed"
                        />
                      </div>
                      <div>
                        <Label htmlFor="news-area">Audiencia Objetivo</Label>
                        <Select
                          id="news-area"
                          value={newsTargetArea}
                          onChange={(e) =>
                            setNewsTargetArea(e.target.value as UserOperationalArea)
                          }
                        >
                          {USER_OPERATIONAL_AREAS.map((area) => (
                            <option key={area} value={area}>
                              {AREA_DISPLAY_LABELS[area]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="news-content">Contenido Completo</Label>
                      <Textarea
                        id="news-content"
                        required
                        minLength={5}
                        rows={4}
                        value={newsContent}
                        onChange={(e) => setNewsContent(e.target.value)}
                        placeholder="Escribe aquí el comunicado oficial para los equipos..."
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-6 text-sm">
                        <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={newsPinned}
                            onChange={(e) => setNewsPinned(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Fijar en la parte superior
                        </label>
                        <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={newsPublished}
                            onChange={(e) => setNewsPublished(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Publicar inmediatamente
                        </label>
                      </div>
                      <Button type="submit" disabled={createNewsMutation.isPending}>
                        {createNewsMutation.isPending
                          ? 'Publicando...'
                          : newsPublished
                            ? 'Publicar en Muro'
                            : 'Guardar Borrador'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {/* Feed de noticias */}
            {posts.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <Megaphone className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
                  <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                    No hay comunicados publicados con este filtro
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {canManage
                      ? 'Usa el botón "Publicar Comunicado" para compartir el primer anuncio corporativo.'
                      : 'Cuando Talento Humano publique novedades aparecerán aquí.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {posts.map((post: NewsPostItem) => {
                  const commentsOpen = Boolean(openCommentsByPost[post.id]);
                  const commentDraft = commentDraftByPost[post.id] ?? '';

                  return (
                    <Card
                      key={post.id}
                      className={
                        post.isPinned
                          ? 'border-indigo-200 ring-1 ring-indigo-500/10 dark:border-indigo-900'
                          : undefined
                      }
                    >
                      <CardHeader className="pb-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {post.isPinned ? (
                                <Badge variant="default" className="gap-1">
                                  <Pin className="h-3 w-3" /> Fijado
                                </Badge>
                              ) : null}
                              {!post.isPublished ? (
                                <Badge variant="warning">Borrador privado TH</Badge>
                              ) : null}
                              <Badge variant={CATEGORY_BADGE_VARIANT[post.category]}>
                                {post.categoryLabel}
                              </Badge>
                              <Badge variant="outline">{post.targetAreaLabel}</Badge>
                            </div>
                            <CardTitle className="text-lg">{post.title}</CardTitle>
                            {post.summary ? (
                              <CardDescription className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {post.summary}
                              </CardDescription>
                            ) : null}
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Publicado por{' '}
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {post.authorName}
                              </span>{' '}
                              · {formatDateTime(post.publishedAt)}
                            </p>
                          </div>

                          {canManage ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                title={post.isPinned ? 'Desfijar' : 'Fijar arriba'}
                                onClick={() =>
                                  updateNewsMutation.mutate({
                                    id: post.id,
                                    payload: { isPinned: !post.isPinned },
                                  })
                                }
                              >
                                {post.isPinned ? (
                                  <PinOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Pin className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title={
                                  post.isPublished ? 'Pasar a borrador' : 'Publicar ahora'
                                }
                                onClick={() =>
                                  updateNewsMutation.mutate({
                                    id: post.id,
                                    payload: { isPublished: !post.isPublished },
                                  })
                                }
                              >
                                {post.isPublished ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              {confirmDeletePostId === post.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteNewsMutation.mutate(post.id)}
                                  >
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDeletePostId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setConfirmDeletePostId(post.id)}
                                  title="Eliminar comunicado"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                </Button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                          {post.content}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <Button
                            size="sm"
                            variant={post.hasUserReacted ? 'default' : 'outline'}
                            className="gap-1.5"
                            disabled={reactMutation.isPending}
                            onClick={() => reactMutation.mutate(post.id)}
                          >
                            <Heart
                              className={`h-3.5 w-3.5 ${
                                post.hasUserReacted ? 'fill-current' : ''
                              }`}
                            />
                            {post.hasUserReacted ? 'Te gusta' : 'Apoyar'} ({post.reactionsCount})
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() =>
                              setOpenCommentsByPost((prev) => ({
                                ...prev,
                                [post.id]: !prev[post.id],
                              }))
                            }
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Comentarios ({post.commentsCount})
                          </Button>
                        </div>

                        {commentsOpen ? (
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                            {post.comments.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                Aún no hay comentarios. ¡Sé el primero en participar!
                              </p>
                            ) : (
                              <div className="space-y-2.5">
                                {post.comments.map((comment) => (
                                  <div
                                    key={comment.id}
                                    className="rounded-lg bg-white p-3 text-sm shadow-sm dark:bg-slate-950"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {comment.authorName}
                                      </span>
                                      <span>{formatDateTime(comment.createdAt)}</span>
                                    </div>
                                    <p className="mt-1 text-slate-700 dark:text-slate-300">
                                      {comment.body}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const trimmed = commentDraft.trim();
                                if (trimmed.length < 2) return;
                                commentMutation.mutate({ postId: post.id, body: trimmed });
                              }}
                              className="flex gap-2"
                            >
                              <Input
                                value={commentDraft}
                                onChange={(e) =>
                                  setCommentDraftByPost((prev) => ({
                                    ...prev,
                                    [post.id]: e.target.value,
                                  }))
                                }
                                placeholder="Escribe un comentario constructivo..."
                                maxLength={1000}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  commentMutation.isPending || commentDraft.trim().length < 2
                                }
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Tab Encuestas de Pulso Anónimas */
          <div className="space-y-6">
            {/* Banner técnico de garantía de anonimato */}
            <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-600/10 p-2 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-emerald-950 dark:text-emerald-200">
                      Arquitectura de Anonimato Verificable (Umbral k ≥ 3)
                    </p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300/90">
                      Tus respuestas se almacenan sin usuario, correo, IP ni registro en bitácora
                      de auditoría. El control anti-duplicado utiliza un hash HMAC unidireccional
                      desacoplado y los resultados solo se desbloquean a partir de 3 respuestas.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Constructor de encuestas (solo TH / Super Admin) */}
            {canManage && showSurveyForm ? (
              <Card className="border-indigo-200 dark:border-indigo-900">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Activity className="h-5 w-5 text-indigo-600" />
                        Crear Encuesta de Pulso Anónima
                      </CardTitle>
                      <CardDescription>
                        Usa una plantilla rápida o personaliza preguntas de clima, eNPS y texto
                        abierto.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => applyPreset('WEEKLY')}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Plantilla Pulso + eNPS
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => applyPreset('ONBOARDING')}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Plantilla Onboarding 30d
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateSurveySubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="survey-title">Título de la Encuesta</Label>
                        <Input
                          id="survey-title"
                          required
                          minLength={3}
                          value={surveyTitle}
                          onChange={(e) => setSurveyTitle(e.target.value)}
                          placeholder="Ej: Pulso Quincenal de Clima eNPS"
                        />
                      </div>
                      <div>
                        <Label htmlFor="survey-area">Área Objetivo</Label>
                        <Select
                          id="survey-area"
                          value={surveyArea}
                          onChange={(e) =>
                            setSurveyArea(e.target.value as UserOperationalArea)
                          }
                        >
                          {USER_OPERATIONAL_AREAS.map((area) => (
                            <option key={area} value={area}>
                              {AREA_DISPLAY_LABELS[area]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="survey-closes">Fecha de Cierre (opcional)</Label>
                        <Input
                          id="survey-closes"
                          type="date"
                          value={surveyClosesAt}
                          onChange={(e) => setSurveyClosesAt(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="md:col-span-3">
                        <Label htmlFor="survey-desc">Descripción / Propósito</Label>
                        <Input
                          id="survey-desc"
                          value={surveyDescription}
                          onChange={(e) => setSurveyDescription(e.target.value)}
                          placeholder="Contexto breve para incentivar participación sincera..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="survey-status">Estado Inicial</Label>
                        <Select
                          id="survey-status"
                          value={surveyStatus}
                          onChange={(e) =>
                            setSurveyStatus(e.target.value as PulseSurveyStatus)
                          }
                        >
                          <option value="ACTIVE">Activa (Abierta ahora)</option>
                          <option value="DRAFT">Borrador (Privada TH)</option>
                        </Select>
                      </div>
                    </div>

                    {/* Preguntas configurables */}
                    <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          Preguntas ({draftQuestions.length})
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={addCustomQuestion}
                          disabled={draftQuestions.length >= 12}
                        >
                          + Agregar pregunta
                        </Button>
                      </div>

                      {draftQuestions.map((question, idx) => (
                        <div
                          key={question.id}
                          className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 md:grid-cols-12 dark:border-slate-800 dark:bg-slate-900/50"
                        >
                          <div className="md:col-span-6">
                            <Label>Pregunta #{idx + 1}</Label>
                            <Input
                              required
                              minLength={3}
                              value={question.prompt}
                              onChange={(e) =>
                                setDraftQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, prompt: e.target.value } : item,
                                  ),
                                )
                              }
                              placeholder="Enunciado claro y corto..."
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Label>Tipo</Label>
                            <Select
                              value={question.type}
                              onChange={(e) =>
                                setDraftQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, type: e.target.value as PulseQuestionType }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {PULSE_QUESTION_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {PULSE_QUESTION_TYPE_LABELS[t]}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div className="flex items-end justify-between gap-2 md:col-span-3">
                            <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={question.required}
                                onChange={(e) =>
                                  setDraftQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, required: e.target.checked }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              Obligatoria
                            </label>
                            {draftQuestions.length > 1 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setDraftQuestions((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              </Button>
                            ) : null}
                          </div>

                          {question.type === 'SINGLE_CHOICE' ? (
                            <div className="md:col-span-12">
                              <Label>Opciones (separadas por coma)</Label>
                              <Input
                                required
                                value={question.optionsText}
                                onChange={(e) =>
                                  setDraftQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, optionsText: e.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder="Opción 1, Opción 2, Opción 3"
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={createSurveyMutation.isPending}>
                        {createSurveyMutation.isPending
                          ? 'Creando encuesta...'
                          : 'Lanzar Encuesta de Pulso'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {/* Lista de encuestas */}
            {surveys.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <Activity className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
                  <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                    No hay encuestas de pulso disponibles
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {canManage
                      ? 'Crea una encuesta usando "Nueva Encuesta de Pulso" con nuestras plantillas rápidas.'
                      : 'Cuando Talento Humano habilite una medición de clima la verás aquí.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                {surveys.map((survey: PulseSurveyItem) => {
                  const draftAnswers = answersBySurvey[survey.id] ?? {};
                  const showAnalytics =
                    expandedAnalyticsBySurvey[survey.id] ??
                    (!survey.canRespond || canManage);

                  return (
                    <Card key={survey.id}>
                      <CardHeader className="pb-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={SURVEY_STATUS_BADGE[survey.status]}>
                                {survey.statusLabel}
                              </Badge>
                              <Badge variant="outline">{survey.targetAreaLabel}</Badge>
                              <Badge variant="purple">
                                {survey.totalResponses}{' '}
                                {survey.totalResponses === 1 ? 'respuesta' : 'respuestas'}
                              </Badge>
                              {survey.hasResponded ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Ya votaste anónimamente
                                </Badge>
                              ) : null}
                            </div>
                            <CardTitle className="text-lg">{survey.title}</CardTitle>
                            {survey.description ? (
                              <CardDescription>{survey.description}</CardDescription>
                            ) : null}
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Creada por {survey.createdByName}
                              {survey.closesAt ? ` · Cierra el ${survey.closesAt}` : ''}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {canManage ? (
                              <>
                                {survey.status !== 'ACTIVE' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateSurveyStatusMutation.mutate({
                                        id: survey.id,
                                        status: 'ACTIVE',
                                      })
                                    }
                                  >
                                    Activar
                                  </Button>
                                ) : null}
                                {survey.status === 'ACTIVE' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateSurveyStatusMutation.mutate({
                                        id: survey.id,
                                        status: 'CLOSED',
                                      })
                                    }
                                  >
                                    Cerrar
                                  </Button>
                                ) : null}
                              </>
                            ) : null}

                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() =>
                                setExpandedAnalyticsBySurvey((prev) => ({
                                  ...prev,
                                  [survey.id]: !showAnalytics,
                                }))
                              }
                            >
                              <BarChart3 className="h-3.5 w-3.5" />
                              {showAnalytics ? 'Ocultar analítica' : 'Ver analítica'}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-6">
                        {/* Formulario interactivo de voto anónimo */}
                        {survey.canRespond ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              submitPulseMutation.mutate({
                                surveyId: survey.id,
                                answers: draftAnswers,
                              });
                            }}
                            className="space-y-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20"
                          >
                            <div className="flex items-center justify-between border-b border-indigo-100 pb-3 dark:border-indigo-900/60">
                              <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">
                                Participa de forma 100% anónima
                              </span>
                              <span className="text-xs text-indigo-700 dark:text-indigo-300">
                                1 participación única verificada
                              </span>
                            </div>

                            {survey.questionSummaries.map((q: PulseQuestionAnalytics, qIdx) => {
                              const currentVal = draftAnswers[q.id];

                              return (
                                <div key={q.id} className="space-y-2">
                                  <Label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {qIdx + 1}. {q.prompt}{' '}
                                    {q.required ? (
                                      <span className="text-rose-500">*</span>
                                    ) : (
                                      <span className="text-xs font-normal text-slate-500">
                                        (Opcional)
                                      </span>
                                    )}
                                  </Label>

                                  {q.type === 'SCALE_5' ? (
                                    <div className="flex flex-wrap gap-2">
                                      {[1, 2, 3, 4, 5].map((num) => {
                                        const selected = currentVal === num;
                                        return (
                                          <button
                                            key={num}
                                            type="button"
                                            onClick={() =>
                                              setQuestionAnswer(survey.id, q.id, num)
                                            }
                                            className={`min-w-[64px] rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                              selected
                                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                            }`}
                                          >
                                            {num}{' '}
                                            <span className="block text-[10px] font-normal opacity-80">
                                              {num === 1
                                                ? 'Muy bajo'
                                                : num === 5
                                                  ? 'Excelente'
                                                  : ' '}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : q.type === 'ENPS_10' ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                                        const selected = currentVal === num;
                                        return (
                                          <button
                                            key={num}
                                            type="button"
                                            onClick={() =>
                                              setQuestionAnswer(survey.id, q.id, num)
                                            }
                                            className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                                              selected
                                                ? getEnpsColor(num)
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                            }`}
                                          >
                                            {num}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : q.type === 'SINGLE_CHOICE' ? (
                                    <div className="flex flex-wrap gap-2">
                                      {q.options.map((opt) => {
                                        const selected = currentVal === opt;
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() =>
                                              setQuestionAnswer(survey.id, q.id, opt)
                                            }
                                            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                                              selected
                                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                            }`}
                                          >
                                            {opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <Textarea
                                      rows={2}
                                      maxLength={1000}
                                      value={String(currentVal ?? '')}
                                      onChange={(e) =>
                                        setQuestionAnswer(survey.id, q.id, e.target.value)
                                      }
                                      placeholder="Tu comentario aparecerá mezclado alfabéticamente sin autor ni área..."
                                    />
                                  )}
                                </div>
                              );
                            })}

                            <div className="flex justify-end pt-2">
                              <Button
                                type="submit"
                                disabled={submitPulseMutation.isPending}
                                className="gap-2"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                {submitPulseMutation.isPending
                                  ? 'Enviando sin identidad...'
                                  : 'Enviar Respuesta Anónima'}
                              </Button>
                            </div>
                          </form>
                        ) : null}

                        {/* Analítica agregada protegida */}
                        {showAnalytics ? (
                          !survey.isKAnonymityMet ? (
                            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                              <Lock className="h-5 w-5 shrink-0" />
                              <div>
                                <p className="font-semibold">
                                  Resultados protegidos por umbral de k-anonimidad
                                </p>
                                <p className="text-xs opacity-90">
                                  {survey.privacyNotice} Actual: {survey.totalResponses} de{' '}
                                  {survey.privacyThreshold} requeridas.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                              {/* Resumen eNPS + Áreas */}
                              {(survey.overallEnps || survey.areaBreakdown.length > 0) ? (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                  {survey.overallEnps ? (
                                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Índice eNPS Anónimo
                                      </p>
                                      <div className="mt-2 flex items-baseline gap-3">
                                        <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                                          {survey.overallEnps.score !== null
                                            ? `${survey.overallEnps.score > 0 ? '+' : ''}${survey.overallEnps.score}`
                                            : 'N/A'}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          Escala -100 a +100
                                        </span>
                                      </div>
                                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                          <p className="font-bold">
                                            {survey.overallEnps.promoters}
                                          </p>
                                          <p>Promotores (9-10)</p>
                                        </div>
                                        <div className="rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                          <p className="font-bold">
                                            {survey.overallEnps.passives}
                                          </p>
                                          <p>Pasivos (7-8)</p>
                                        </div>
                                        <div className="rounded-lg bg-rose-50 p-2 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                                          <p className="font-bold">
                                            {survey.overallEnps.detractors}
                                          </p>
                                          <p>Detractores (0-6)</p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}

                                  {survey.areaBreakdown.length > 0 ? (
                                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Participación por Área (Protegida k ≥ 3)
                                      </p>
                                      <div className="mt-3 space-y-2.5">
                                        {survey.areaBreakdown.map((item) => (
                                          <div key={item.area} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                                {item.label}
                                              </span>
                                              <span className="text-slate-500">
                                                {item.count} ({item.percentage}%)
                                              </span>
                                            </div>
                                            <Progress value={item.percentage} />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {/* Desglose por pregunta */}
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {survey.questionSummaries.map((q) => (
                                  <div
                                    key={q.id}
                                    className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {q.prompt}
                                      </p>
                                      {q.average !== null ? (
                                        <Badge variant="default">Prom: {q.average}</Badge>
                                      ) : null}
                                    </div>

                                    {q.distribution.length > 0 ? (
                                      <div className="mt-3 space-y-2">
                                        {q.distribution.map((bucket) => (
                                          <div key={bucket.label} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-slate-600 dark:text-slate-300">
                                                {q.type === 'SCALE_5'
                                                  ? `Nivel ${bucket.label}`
                                                  : bucket.label}
                                              </span>
                                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                                {bucket.count} ({bucket.percentage}%)
                                              </span>
                                            </div>
                                            <Progress value={bucket.percentage} />
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {q.type === 'OPEN_TEXT' ? (
                                      <div className="mt-3 space-y-2">
                                        {q.openTextAnswers.length === 0 ? (
                                          <p className="text-xs text-slate-500">
                                            Sin comentarios abiertos registrados.
                                          </p>
                                        ) : (
                                          q.openTextAnswers.map((comment, idx) => (
                                            <div
                                              key={`${q.id}-${idx}`}
                                              className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                            >
                                              “{comment}”
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
