'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Link2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
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

  // Generador de Magic Link seguro para candidatos (Rol aislado)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{
    magicLink: string;
    expiresIn: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

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
          ? 'Aprobado por TH. Por regla DSI, el flujo pasó a Aprobación obligatoria del Líder DSI.'
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

  const magicLinkMutation = useMutation({
    mutationFn: () => apiClient.generateMagicLink(),
    onSuccess: (res) => {
      setGeneratedLink({ magicLink: res.magicLink, expiresIn: res.expiresIn });
      setCopiedLink(false);
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
            <h1 className="text-2xl font-bold tracking-tight">Dashboard y Consola de Validación TH</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Revisión de expedientes digitales (24 campos), asignación de campaña y disparo automatizado a IT.
            </p>
          </div>
          <Button
            variant={inviteOpen ? 'secondary' : 'default'}
            onClick={() => setInviteOpen((v) => !v)}
          >
            <Link2 className="h-4 w-4" />
            {inviteOpen ? 'Cerrar Invitación' : 'Generar Link Seguro de Pre-Ingreso'}
          </Button>
        </div>

        {inviteOpen && (
          <Card className="border-slate-300 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Enlace Seguro de Pre-Ingreso (Rol Candidato Aislado)
              </CardTitle>
              <CardDescription>
                Genera un Magic Link JWT firmado (vigencia 72h) para compartirlo con el candidato.
                El candidato diligenciará todos sus datos directamente en el portal sin acceso al HCM interno.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={magicLinkMutation.isPending}
                  onClick={() => magicLinkMutation.mutate()}
                >
                  <Link2 className="h-4 w-4" />
                  {magicLinkMutation.isPending ? 'Generando enlace...' : 'Generar Nuevo Link Seguro'}
                </Button>
              </div>

              {generatedLink && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Enlace seguro generado (expira en {generatedLink.expiresIn})
                    </span>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={handleCopyLink}>
                        {copiedLink ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copiar enlace
                          </>
                        )}
                      </Button>
                      <a
                        href={generatedLink.magicLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Abrir vista candidato
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                  <code className="block break-all rounded bg-white/90 p-2 text-[11px] text-slate-700 border border-emerald-200 dark:bg-slate-950 dark:text-slate-300 dark:border-emerald-900">
                    {generatedLink.magicLink}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPIs superiores */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Ingresos Activos</p>
                <p className="text-3xl font-bold mt-1">{kpis?.activeOnboardings ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Pendientes Aprobación</p>
                <p className="text-3xl font-bold mt-1">{kpis?.pendingApprovals ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Alertas Fuera de SLA</p>
                <p className="text-3xl font-bold mt-1 text-rose-600">{kpis?.outOfSlaAlerts ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Retiros en Paz y Salvo</p>
                <p className="text-3xl font-bold mt-1">{kpis?.pendingOffboardingClearances ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <FileCheck2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            No se pudo conectar con la API en <code>NEXT_PUBLIC_API_URL</code>. Levanta Docker y la API con{' '}
            <code>npm run docker:up &amp;&amp; npm run db:push &amp;&amp; npm run db:seed &amp;&amp; npm run dev</code>.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Lista de candidatos */}
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>Cola de Ingresos ({workflows.length})</CardTitle>
              <CardDescription>Selecciona un candidato para validar sus 24 campos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {isLoading && <p className="text-sm text-slate-500">Cargando ingresos...</p>}
              {workflows.map((wf) => {
                const isSelected = selectedWorkflow?.id === wf.id;
                return (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => handleSelectWorkflow(wf)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-all cursor-pointer ${isSelected
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{wf.employee.fullName}</p>
                        <p className="text-xs text-slate-500">CC {wf.employee.nationalId}</p>
                      </div>
                      {wf.isOutOfSla && <Badge variant="danger">Fuera SLA</Badge>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Badge variant="default">{WORKFLOW_STEP_LABELS[wf.currentStep]}</Badge>
                      {wf.employee.operationalArea && (
                        <Badge variant="purple">{wf.employee.operationalArea}</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Detalle de revisión TH */}
          <div className="lg:col-span-8 space-y-6">
            {selectedWorkflow ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl">{selectedWorkflow.employee.fullName}</CardTitle>
                        <CardDescription>
                          {selectedWorkflow.employee.personalEmail} · Credencial:{' '}
                          <strong>{selectedWorkflow.employee.preferredNameCredentials}</strong>
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">
                          <ShieldCheck className="h-3.5 w-3.5" /> Ley 1581 Firmado (
                          {selectedWorkflow.employee.consentSignatures?.length ?? 0})
                        </Badge>
                        <Badge variant="secondary">
                          Documentos: {selectedWorkflow.employee.documents?.length ?? 0}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Los 24 campos */}
                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      {[
                        ['Cédula', selectedWorkflow.employee.nationalId],
                        ['Expedición', selectedWorkflow.employee.idIssuePlace],
                        ['Nacimiento', `${selectedWorkflow.employee.birthDate} (${selectedWorkflow.employee.age} años)`],
                        ['Lugar Nac.', selectedWorkflow.employee.birthPlace],
                        ['Estado Civil', selectedWorkflow.employee.maritalStatus],
                        ['Dirección', selectedWorkflow.employee.address],
                        ['Barrio/Ciudad', selectedWorkflow.employee.neighborhoodCity],
                        ['Celular', selectedWorkflow.employee.phone],
                        ['Correo Corp.', selectedWorkflow.employee.corporateEmail ?? 'Por asignar'],
                        ['Escolaridad', selectedWorkflow.employee.educationLevel],
                        ['Último Título', selectedWorkflow.employee.lastAcademicTitle],
                        ['EPS', selectedWorkflow.employee.eps],
                        ['Pensión', selectedWorkflow.employee.pensionFund],
                        ['Cesantías', selectedWorkflow.employee.severanceFund],
                        ['Hijos', selectedWorkflow.employee.hasChildren ? `Sí (${selectedWorkflow.employee.childrenCount})` : 'No'],
                        ['Bancolombia', selectedWorkflow.employee.hasBancolombiaAccount ? 'Sí' : 'No'],
                        ['Talla Camiseta', selectedWorkflow.employee.shirtSize],
                        [
                          'Emergencia',
                          `${selectedWorkflow.employee.emergencyContactName} (${selectedWorkflow.employee.emergencyContactRelationship}) · ${selectedWorkflow.employee.emergencyContactPhone}`,
                        ],
                      ].map(([label, val]) => (
                        <div key={label} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950">
                          <span className="block text-[10px] font-semibold uppercase text-slate-500">
                            {label}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{val}</span>
                        </div>
                      ))}
                    </div>

                    {/* Soportes documentales (Previsualización en página + Descarga desde Supabase S3) */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Soportes en Supabase Storage (Bucket alliance)
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
                              Ver Firma Ley 1581
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void downloadDocument(
                                  `/employees/${selectedWorkflow.employee.id}/signature/content?download=1`,
                                  `firma-ley1581-${selectedWorkflow.employee.nationalId}.png`,
                                )
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              Descargar Firma
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
                              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{doc.fileName}</p>
                                <p className="text-[11px] text-slate-500">{doc.documentType}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
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
                                  size="sm"
                                  variant="secondary"
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
                        <p className="text-xs text-slate-500">
                          No hay documentos adjuntos registrados todavía.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Selector visual de Campaña + Aprobación TH */}
                <Card>
                  <CardHeader>
                    <CardTitle>Asignación Organizacional y Motor de Reglas</CardTitle>
                    <CardDescription>
                      Selecciona el área operativa para previsualizar el aprovisionamiento automático de IT.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {OPERATIONAL_AREAS.map((area) => {
                        const rule = AREA_PROVISIONING_RULES[area];
                        const active = selectedArea === area;
                        return (
                          <button
                            key={area}
                            type="button"
                            onClick={() => setSelectedArea(area)}
                            className={`rounded-xl border p-3.5 text-left transition-all cursor-pointer ${active
                                ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 dark:bg-blue-950/50'
                                : 'border-slate-200 hover:border-blue-400 dark:border-slate-800'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm">{area}</span>
                              {rule.requiresDsiLeaderApproval && (
                                <Badge variant="warning">Gate DSI</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{rule.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Preview Motor de Reglas */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Regla automática para {activeRule.area} (SLA {activeRule.slaHours}h)
                        </span>
                        <Badge variant="outline">{activeRule.helpdeskTemplate}</Badge>
                      </div>
                      <ul className="grid gap-1.5 sm:grid-cols-2 text-xs">
                        {activeRule.provisioningItems.map((item) => (
                          <li key={item} className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      {activeRule.requiresDsiLeaderApproval && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-100/80 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          <span>
                            <strong>Regla obligatoria DSI:</strong> Al aprobar TH, el flujo pasará a{' '}
                            <code>DSI_LEADER_APPROVAL</code> antes de crear el ticket en Helpdesk.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Cargo</Label>
                        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Centro de Costos</Label>
                        <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Correo Jefe Directo</Label>
                        <Input value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fecha de Ingreso</Label>
                        <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
                      </div>
                    </div>

                    {feedback && (
                      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {feedback}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Button
                        onClick={() => approveThMutation.mutate(selectedWorkflow.id)}
                        disabled={approveThMutation.isPending}
                      >
                        <Send className="h-4 w-4" />
                        Aprobar Ingreso y Disparar Ticket a IT
                      </Button>

                      {selectedWorkflow.currentStep === 'DSI_LEADER_APPROVAL' && (
                        <Button
                          variant="success"
                          onClick={() => approveDsiMutation.mutate(selectedWorkflow.id)}
                          disabled={approveDsiMutation.isPending}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Aprobar como Líder DSI
                        </Button>
                      )}

                      <Button
                        variant="destructive"
                        onClick={() => cancelNoShowMutation.mutate(selectedWorkflow.id)}
                        disabled={cancelNoShowMutation.isPending}
                      >
                        <Ban className="h-4 w-4" />
                        Cancelar por No-Show (Día 1)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-sm text-slate-500">
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
