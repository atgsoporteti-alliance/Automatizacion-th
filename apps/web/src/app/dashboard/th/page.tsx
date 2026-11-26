'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  AREA_PROVISIONING_RULES,
  OPERATIONAL_AREAS,
  OperationalArea,
  WORKFLOW_STEP_LABELS,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { DocumentPreviewModal } from '@/components/document-preview-modal';
import { apiClient, WorkflowRecord } from '@/lib/api';
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
  Textarea,
} from '@/components/ui/primitives';

export default function ThDashboardPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<OperationalArea>('CUSTOMER');
  const [jobTitle, setJobTitle] = useState('Especialista Operativo');
  const [costCenter, setCostCenter] = useState('CC-CUST-101');
  const [managerEmail, setManagerEmail] = useState('lider.operaciones@alliance.com.co');
  const [hireDate, setHireDate] = useState('2026-12-01');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Generador de Magic Link seguro para candidatos
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState<{
    magicLink: string;
    expiresIn: string;
    emailSent?: boolean;
    emailMessageId?: string;
    emailReason?: string;
    targetEmail?: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Devolución al candidato para corrección
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnedLink, setReturnedLink] = useState<string | null>(null);
  const [copiedReturnLink, setCopiedReturnLink] = useState(false);

  // Modal de previsualización y descarga en la misma página
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

  const openDocumentPreview = async (path: string, fileName: string, mimeType = 'application/pdf') => {
    setPreviewState({
      open: true,
      fileName,
      mimeType,
      objectUrl: null,
      loading: true,
      error: null,
    });
    try {
      const res = await apiClient.fetchProtectedBlob(path);
      setPreviewState({
        open: true,
        fileName,
        mimeType: res.contentType || mimeType,
        objectUrl: res.objectUrl,
        loading: false,
        error: null,
      });
    } catch (err) {
      setPreviewState({
        open: true,
        fileName,
        mimeType,
        objectUrl: null,
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo cargar el documento.',
      });
    }
  };

  const downloadDocument = async (path: string, fileName: string) => {
    try {
      const res = await apiClient.fetchProtectedBlob(path);
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 10_000);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo descargar el documento.');
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('invite') === '1') {
        setInviteOpen(true);
      }
    }
  }, []);

  const { data: kpis } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => apiClient.getKpis(),
  });

  const { data: workflows = [], isLoading, error } = useQuery({
    queryKey: ['workflows', 'ONBOARDING'],
    queryFn: () => apiClient.getWorkflows({ flowType: 'ONBOARDING' }),
  });

  const { data: expirationsSummary } = useQuery({
    queryKey: ['expirations-summary'],
    queryFn: () => apiClient.getExpirations(),
  });
  const expiringAlertCount =
    (expirationsSummary?.kpis.expiredCount ?? 0) +
    (expirationsSummary?.kpis.urgent7Count ?? 0) +
    (expirationsSummary?.kpis.warning15Count ?? 0);

  const selectedWorkflow: WorkflowRecord | undefined =
    workflows.find((w) => w.id === selectedId) ?? workflows[0];

  const handleSelectWorkflow = (wf: WorkflowRecord) => {
    setSelectedId(wf.id);
    if (wf.employee.operationalArea) setSelectedArea(wf.employee.operationalArea);
    if (wf.employee.jobTitle) setJobTitle(wf.employee.jobTitle);
    if (wf.employee.costCenter) setCostCenter(wf.employee.costCenter);
    if (wf.employee.reportingManagerEmail) setManagerEmail(wf.employee.reportingManagerEmail);
    if (wf.employee.hireDate) setHireDate(wf.employee.hireDate);
    setFeedback(null);
    setReturnedLink(null);
  };

  const approveThMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiClient.approveThWorkflow(workflowId, {
        operationalArea: selectedArea,
        jobTitle,
        costCenter,
        reportingManagerEmail: managerEmail,
        hireDate,
      }),
    onSuccess: () => {
      setFeedback(
        selectedArea === 'DSI'
          ? 'Aprobado por TH. Por regla DSI, pasó a aprobación obligatoria del Líder DSI.'
          : 'Aprobado por TH. Ticket encolado a ManageEngine ServiceDesk Plus vía BullMQ.',
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const approveDsiMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiClient.approveDsiWorkflow(workflowId, {
        approverEmail: 'lider.dsi@alliance.com.co',
        notes: 'Perfil VPN, Git y Hardware de Alto Rendimiento aprobados por Líder DSI.',
      }),
    onSuccess: () => {
      setFeedback('Aprobación Líder DSI registrada. Ticket disparado a Helpdesk.');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const cancelNoShowMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiClient.cancelNoShow(workflowId, 'Candidato reportado como No-Show el Día 1.'),
    onSuccess: () => {
      setFeedback('Workflow cancelado por No-Show y ticket Helpdesk revocado.');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const normalizePortalLink = (rawUrl: string) => {
    if (typeof window === 'undefined') return rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.endsWith('.netlify.app') || parsed.origin !== window.location.origin) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      if (rawUrl.startsWith('/')) {
        return `${window.location.origin}${rawUrl}`;
      }
    }
    return rawUrl;
  };

  const returnCandidateMutation = useMutation({
    mutationFn: (vars: { workflowId: string; reason: string }) =>
      apiClient.returnToCandidate(vars.workflowId, vars.reason),
    onSuccess: (res) => {
      setReturnedLink(normalizePortalLink(res.correctionMagicLink));
      setCopiedReturnLink(false);
      setReturnReason('');
      setReturnOpen(true);
      setFeedback(
        'Pre-ingreso devuelto al candidato (CANDIDATE_PENDING). Comparte el enlace de corrección.',
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const magicLinkMutation = useMutation({
    mutationFn: () => {
      setInviteError(null);
      return apiClient.generateMagicLink({
        candidateName: inviteName.trim() || undefined,
        candidateEmail: inviteEmail.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      setGeneratedLink({
        magicLink: normalizePortalLink(res.magicLink),
        expiresIn: res.expiresIn,
        emailSent: res.emailSent,
        emailMessageId: res.emailMessageId,
        emailReason: res.emailReason,
        targetEmail: inviteEmail.trim() || undefined,
      });
      setCopiedLink(false);
    },
    onError: (err) => {
      setInviteError(err instanceof Error ? err.message : 'No se pudo generar el enlace.');
    },
  });

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink.magicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const activeRule = AREA_PROVISIONING_RULES[selectedArea];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Validación Talento Humano</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Expedientes digitales (24 campos), asignación organizacional y disparo a IT.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/vencimientos"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              <BellRing className="h-3.5 w-3.5" />
              Vencimientos
              {expiringAlertCount > 0 && (
                <Badge variant="danger">{expiringAlertCount}</Badge>
              )}
            </Link>
            <Link
              href="/dashboard/candidatos"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              <Calendar className="h-3.5 w-3.5" />
              Reuniones y candidatos
            </Link>
            <Button
              variant={inviteOpen ? 'secondary' : 'default'}
              size="sm"
              onClick={() => setInviteOpen((v) => !v)}
            >
              <Link2 className="h-3.5 w-3.5" />
              {inviteOpen ? 'Cerrar enlace' : 'Generar link pre-ingreso'}
            </Button>
          </div>
        </div>

        {inviteOpen && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Enlace seguro de pre-ingreso (JWT 72h)</CardTitle>
                  <CardDescription>
                    Opcionalmente ingresa el correo del candidato para enviarlo por Gmail de forma automática.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={magicLinkMutation.isPending}
                  onClick={() => magicLinkMutation.mutate()}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {magicLinkMutation.isPending ? 'Generando...' : 'Crear y enviar enlace'}
                </Button>
              </div>
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nombre del candidato (opcional)</Label>
                  <Input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Laura Marcela Gómez"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Correo para envío automático (opcional)</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="candidato@correo.com"
                  />
                </div>
              </div>
              {inviteError && (
                <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {inviteError}
                </div>
              )}
            </CardHeader>
            {generatedLink && (
              <CardContent>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      Activo · Expira en {generatedLink.expiresIn}
                      {generatedLink.emailSent ? ` · Enviado a ${generatedLink.targetEmail ?? 'correo'}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={handleCopyLink}>
                        {copiedLink ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </>
                        )}
                      </Button>
                      <a
                        href={generatedLink.magicLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Abrir
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <code className="block break-all text-[11px] text-zinc-500 dark:text-zinc-400">
                    {generatedLink.magicLink}
                  </code>
                  {generatedLink.emailSent && generatedLink.targetEmail && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Aceptado por Gmail SMTP hacia <strong>{generatedLink.targetEmail}</strong>
                      {generatedLink.emailMessageId ? ` (${generatedLink.emailMessageId})` : ''}. Si no
                      aparece en Recibidos, revisa <strong>Spam</strong> o <strong>Promociones</strong>.
                    </p>
                  )}
                  {generatedLink.targetEmail && !generatedLink.emailSent && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      El enlace se generó correctamente, pero no se pudo enviar al correo (
                      {generatedLink.emailReason ?? 'SMTP no disponible'}). Cópialo y compártelo manualmente.
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Barra de métricas unificada */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200/80 dark:divide-zinc-800/80 rounded-lg border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-[#0f0f12]">
          <div className="p-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ingresos activos</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {kpis?.activeOnboardings ?? '—'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Pendientes aprobación</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {kpis?.pendingApprovals ?? '—'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Alertas fuera SLA</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-rose-600 dark:text-rose-400">
              {kpis?.outOfSlaAlerts ?? '—'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Retiros Paz y Salvo</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {kpis?.pendingOffboardingClearances ?? '—'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            No se pudo conectar con la API en <code>NEXT_PUBLIC_API_URL</code>. Verifica el servicio
            backend activo.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Cola de candidatos */}
          <Card className="lg:col-span-4 h-fit overflow-hidden">
            <CardHeader className="border-b border-zinc-200/80 pb-3 dark:border-zinc-800/80">
              <CardTitle>Cola de ingresos ({workflows.length})</CardTitle>
              <CardDescription>Selecciona un expediente para revisar.</CardDescription>
            </CardHeader>
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
              {isLoading && (
                <p className="p-4 text-xs text-zinc-500">Cargando ingresos...</p>
              )}
              {workflows.map((wf) => {
                const isSelected = selectedWorkflow?.id === wf.id;
                return (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => handleSelectWorkflow(wf)}
                    className={`w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-50 border-l-2 border-l-zinc-900 dark:bg-zinc-900/70 dark:border-l-zinc-100'
                        : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                          {wf.employee.fullName}
                        </p>
                        <p className="text-xs text-zinc-500">CC {wf.employee.nationalId}</p>
                      </div>
                      {wf.isOutOfSla && <Badge variant="danger">Fuera SLA</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{WORKFLOW_STEP_LABELS[wf.currentStep]}</Badge>
                      {wf.employee.operationalArea && (
                        <Badge variant="outline">{wf.employee.operationalArea}</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Detalle de revisión TH */}
          <div className="lg:col-span-8 space-y-5">
            {selectedWorkflow ? (
              <>
                <Card>
                  <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{selectedWorkflow.employee.fullName}</CardTitle>
                        <CardDescription>
                          {selectedWorkflow.employee.personalEmail} · Credencial:{' '}
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {selectedWorkflow.employee.preferredNameCredentials}
                          </span>
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="success">
                          <ShieldCheck className="h-3 w-3" /> Ley 1581 (
                          {selectedWorkflow.employee.consentSignatures?.length ?? 0})
                        </Badge>
                        <Badge variant="secondary">
                          Documentos: {selectedWorkflow.employee.documents?.length ?? 0}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-5 space-y-6">
                    {/* Los 24 campos en grilla tipográfica limpia */}
                    <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-3 text-xs">
                      {[
                        ['Cédula', selectedWorkflow.employee.nationalId],
                        ['Expedición', selectedWorkflow.employee.idIssuePlace],
                        [
                          'Nacimiento',
                          `${selectedWorkflow.employee.birthDate} (${selectedWorkflow.employee.age} años)`,
                        ],
                        ['Lugar nac.', selectedWorkflow.employee.birthPlace],
                        ['Estado civil', selectedWorkflow.employee.maritalStatus],
                        ['Dirección', selectedWorkflow.employee.address],
                        ['Barrio / Ciudad', selectedWorkflow.employee.neighborhoodCity],
                        ['Celular', selectedWorkflow.employee.phone],
                        ['Correo corp.', selectedWorkflow.employee.corporateEmail ?? 'Por asignar'],
                        ['Escolaridad', selectedWorkflow.employee.educationLevel],
                        ['Último título', selectedWorkflow.employee.lastAcademicTitle],
                        ['EPS', selectedWorkflow.employee.eps],
                        ['Pensión', selectedWorkflow.employee.pensionFund || 'No reportado'],
                        ['Cesantías', selectedWorkflow.employee.severanceFund || 'No reportado'],
                        [
                          'Hijos',
                          selectedWorkflow.employee.hasChildren
                            ? `Sí (${selectedWorkflow.employee.childrenCount})`
                            : 'No',
                        ],
                        ['Bancolombia', selectedWorkflow.employee.hasBancolombiaAccount ? 'Sí' : 'No'],
                        ['Talla camiseta', selectedWorkflow.employee.shirtSize],
                        [
                          'Emergencia',
                          `${selectedWorkflow.employee.emergencyContactName} (${selectedWorkflow.employee.emergencyContactRelationship}) · ${selectedWorkflow.employee.emergencyContactPhone}`,
                        ],
                      ].map(([label, val]) => (
                        <div key={label} className="space-y-0.5">
                          <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</dt>
                          <dd className="font-medium text-zinc-900 dark:text-zinc-100 break-words">
                            {val}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/* Soportes documentales */}
                    <div className="space-y-3 pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Soportes · Supabase Storage (alliance)
                        </span>
                        {(selectedWorkflow.employee.consentSignatures?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void openDocumentPreview(
                                  `/employees/${selectedWorkflow.employee.id}/signature/content`,
                                  `firma-ley1581-${selectedWorkflow.employee.nationalId}.png`,
                                  'image/png',
                                )
                              }
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Firma Ley 1581
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void downloadDocument(
                                  `/employees/${selectedWorkflow.employee.id}/signature/content?download=1`,
                                  `firma-ley1581-${selectedWorkflow.employee.nationalId}.png`,
                                )
                              }
                              title="Descargar firma"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {selectedWorkflow.employee.documents &&
                      selectedWorkflow.employee.documents.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedWorkflow.employee.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-zinc-200/80 px-3 py-2 text-xs dark:border-zinc-800/80"
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">{doc.fileName}</p>
                                <p className="text-[11px] text-zinc-400">{doc.documentType}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    void openDocumentPreview(
                                      `/employees/documents/${doc.id}/content`,
                                      doc.fileName,
                                      doc.mimeType || 'application/pdf',
                                    )
                                  }
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Ver
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    void downloadDocument(
                                      `/employees/documents/${doc.id}/content?download=1`,
                                      doc.fileName,
                                    )
                                  }
                                  title="Descargar archivo"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">Sin documentos adjuntos registrados.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Asignación Organizacional & Acciones TH */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle>Asignación y motor de reglas</CardTitle>
                    <CardDescription>
                      Define área operativa y datos contractuales para disparar el aprovisionamiento.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {OPERATIONAL_AREAS.map((area) => {
                        const rule = AREA_PROVISIONING_RULES[area];
                        const active = selectedArea === area;
                        return (
                          <button
                            key={area}
                            type="button"
                            onClick={() => setSelectedArea(area)}
                            className={`rounded-md border p-3 text-left transition-colors cursor-pointer ${
                              active
                                ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900'
                                : 'border-zinc-200/80 hover:border-zinc-400 dark:border-zinc-800/80 dark:hover:border-zinc-600'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold">{area}</span>
                              {rule.requiresDsiLeaderApproval && (
                                <Badge variant="warning">Gate DSI</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              {rule.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-md border border-zinc-200/80 bg-zinc-50/70 p-3.5 space-y-2 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Regla {activeRule.area} · SLA {activeRule.slaHours}h
                        </span>
                        <Badge variant="outline">{activeRule.helpdeskTemplate}</Badge>
                      </div>
                      <ul className="grid gap-1 sm:grid-cols-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {activeRule.provisioningItems.map((item) => (
                          <li key={item} className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      {activeRule.requiresDsiLeaderApproval && (
                        <div className="flex items-center gap-2 pt-1 text-xs text-amber-700 dark:text-amber-300">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Requiere aprobación de <code>DSI_LEADER_APPROVAL</code> antes de crear
                            ticket.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Cargo</Label>
                        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Centro de costos</Label>
                        <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Correo jefe directo</Label>
                        <Input
                          value={managerEmail}
                          onChange={(e) => setManagerEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fecha de ingreso</Label>
                        <Input
                          type="date"
                          value={hireDate}
                          onChange={(e) => setHireDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {feedback && (
                      <div className="rounded-md bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {feedback}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => approveThMutation.mutate(selectedWorkflow.id)}
                          disabled={approveThMutation.isPending}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Aprobar y disparar a IT
                        </Button>

                        {selectedWorkflow.currentStep === 'DSI_LEADER_APPROVAL' && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => approveDsiMutation.mutate(selectedWorkflow.id)}
                            disabled={approveDsiMutation.isPending}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Aprobar Líder DSI
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={returnOpen ? 'secondary' : 'outline'}
                          onClick={() => setReturnOpen((v) => !v)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Devolver corrección
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          onClick={() => cancelNoShowMutation.mutate(selectedWorkflow.id)}
                          disabled={cancelNoShowMutation.isPending}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          No-Show
                        </Button>
                      </div>
                    </div>

                    {(returnOpen || returnedLink) && (
                      <div className="rounded-md border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Devolver pre-ingreso para corrección de datos
                          </span>
                        </div>
                        <Textarea
                          placeholder="Indica qué debe corregir el colaborador (ej: Cédula borrosa o error en dirección)..."
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                        />
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              returnReason.trim().length < 4 || returnCandidateMutation.isPending
                            }
                            onClick={() =>
                              returnCandidateMutation.mutate({
                                workflowId: selectedWorkflow.id,
                                reason: returnReason.trim(),
                              })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {returnCandidateMutation.isPending
                              ? 'Generando enlace...'
                              : 'Devolver y generar link de corrección'}
                          </Button>
                        </div>

                        {returnedLink && (
                          <div className="rounded-md border border-zinc-200 bg-white p-3 space-y-2 dark:border-zinc-800 dark:bg-[#0f0f12]">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                Link de corrección (pre-carga los 24 campos)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(returnedLink);
                                    setCopiedReturnLink(true);
                                    setTimeout(() => setCopiedReturnLink(false), 2500);
                                  }}
                                >
                                  {copiedReturnLink ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" /> Copiar
                                    </>
                                  )}
                                </Button>
                                <a
                                  href={returnedLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 px-3 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                                >
                                  Abrir
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                            <code className="block break-all text-[11px] text-zinc-500 dark:text-zinc-400">
                              {returnedLink}
                            </code>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-xs text-zinc-500">
                  No hay flujos de Onboarding registrados aún.
                </CardContent>
              </Card>
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
