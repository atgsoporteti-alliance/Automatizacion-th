'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Award,
  BellRing,
  CheckCircle2,
  Clock,
  FileCheck2,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import {
  EXPIRATION_CATEGORIES,
  EXPIRATION_CATEGORY_LABELS,
  EXPIRATION_SEVERITY_LABELS,
  EXPIRATION_STATUS_LABELS,
  ExpirationCategory,
  ExpirationSeverity,
  OPERATIONAL_AREAS,
  OperationalArea,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import {
  apiClient,
  EmployeeRecord,
  ExpirationDocumentAlert,
  ExpirationRecordItem,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
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

type CategoryTab = ExpirationCategory | 'ALL' | 'DOCUMENTS';
type AlertFilter = 'ACTIVE_ONLY' | 'AT_RISK' | 'EXPIRED' | 'URGENT_7' | 'OK' | 'ALL_INCLUDING_ARCHIVED';

function getSeverityBadgeVariant(
  severity: ExpirationSeverity,
): 'default' | 'success' | 'warning' | 'danger' | 'outline' {
  switch (severity) {
    case 'EXPIRED':
      return 'danger';
    case 'URGENT_7':
    case 'WARNING_15':
      return 'warning';
    case 'UPCOMING_30':
      return 'default';
    default:
      return 'success';
  }
}

function getCategoryIcon(category: ExpirationCategory) {
  if (category === 'CONTRACT') return FileCheck2;
  if (category === 'LICENSE') return KeyRound;
  return Award;
}

function parseEmailCsv(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  );
}

function formatDateDisplay(dateOnly: string): string {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateOnly;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function ExpirationsDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isItSupport = user?.role === 'IT_SUPPORT';
  const canManageAll =
    !user ||
    user.role === 'TH_ANALYST' ||
    user.role === 'TH_ADMIN' ||
    user.role === 'SUPER_ADMIN';
  const canCreateOrEdit = canManageAll || isItSupport;

  const [activeTab, setActiveTab] = useState<CategoryTab>(isItSupport ? 'LICENSE' : 'ALL');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('ACTIVE_ONLY');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Formulario nuevo registro
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<ExpirationCategory>(
    isItSupport ? 'LICENSE' : 'CONTRACT',
  );
  const [title, setTitle] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [operationalArea, setOperationalArea] = useState<OperationalArea | ''>('');
  const [referenceCode, setReferenceCode] = useState('');
  const [providerOrEntity, setProviderOrEntity] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [alertDaysBefore, setAlertDaysBefore] = useState('30');
  const [recipientEmailsRaw, setRecipientEmailsRaw] = useState('');
  const [notifyEmployee, setNotifyEmployee] = useState(false);
  const [notes, setNotes] = useState('');

  // Acción en línea: Renovar / Editar
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewExpiresAt, setRenewExpiresAt] = useState('');
  const [renewReference, setRenewReference] = useState('');
  const [renewNotes, setRenewNotes] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editAlertDays, setEditAlertDays] = useState('30');
  const [editRecipientsRaw, setEditRecipientsRaw] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Asignar fecha de vencimiento a documento existente de colaborador
  const [docAssignEmployeeId, setDocAssignEmployeeId] = useState('');
  const [docAssignDocId, setDocAssignDocId] = useState('');
  const [docAssignDate, setDocAssignDate] = useState('');

  const { data: expirationsData, isLoading } = useQuery({
    queryKey: ['expirations', alertFilter === 'ALL_INCLUDING_ARCHIVED'],
    queryFn: () =>
      apiClient.getExpirations({
        includeArchived: alertFilter === 'ALL_INCLUDING_ARCHIVED',
      }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient.getEmployees(),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['expirations'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createExpiration({
        category,
        title: title.trim(),
        employeeId: employeeId || undefined,
        operationalArea: operationalArea || undefined,
        referenceCode: referenceCode.trim() || undefined,
        providerOrEntity: providerOrEntity.trim() || undefined,
        startsAt: startsAt || undefined,
        expiresAt,
        alertDaysBefore: Number(alertDaysBefore) || 30,
        notifyEmployee,
        recipientEmails: parseEmailCsv(recipientEmailsRaw),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (created) => {
      setFeedback(`Vencimiento registrado: "${created.title}" (${created.evaluation.daysLabel}).`);
      setTitle('');
      setReferenceCode('');
      setProviderOrEntity('');
      setStartsAt('');
      setExpiresAt('');
      setRecipientEmailsRaw('');
      setNotifyEmployee(false);
      setNotes('');
      setCreateOpen(false);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo registrar el vencimiento.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof apiClient.updateExpiration>[1];
    }) => apiClient.updateExpiration(id, payload),
    onSuccess: () => {
      setEditingId(null);
      setFeedback('Vencimiento actualizado correctamente.');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error actualizando el registro.');
    },
  });

  const renewMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof apiClient.renewExpiration>[1];
    }) => apiClient.renewExpiration(id, payload),
    onSuccess: (res) => {
      setRenewingId(null);
      setFeedback(
        `Renovación registrada hasta ${formatDateDisplay(res.expiresAt)}. Umbrales de alerta reiniciados.`,
      );
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo renovar el registro.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.archiveExpiration(id),
    onSuccess: () => {
      setFeedback('Registro archivado.');
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo archivar.');
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => apiClient.runExpirationScan(false),
    onSuccess: (res) => {
      setFeedback(
        `Verificación completada: ${res.checkedCount} registros revisados, ${res.alertsTriggeredCount} nuevas alertas por umbral y ${res.emailsSentCount} correo(s) enviados.`,
      );
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error ejecutando el escaneo de alertas.');
    },
  });

  const assignDocExpirationMutation = useMutation({
    mutationFn: () => apiClient.updateDocumentExpiration(docAssignDocId, docAssignDate || null),
    onSuccess: () => {
      setDocAssignDocId('');
      setDocAssignDate('');
      setFeedback('Fecha de vencimiento asignada al documento del expediente.');
      invalidateAll();
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo asignar la fecha al documento.');
    },
  });

  const kpis = expirationsData?.kpis ?? {
    totalActive: 0,
    expiredCount: 0,
    urgent7Count: 0,
    warning15Count: 0,
    upcoming30Count: 0,
    onTrackCount: 0,
    contractsCount: 0,
    licensesCount: 0,
    certificationsCount: 0,
    documentsWithExpirationCount: 0,
  };

  const filteredItems = useMemo(() => {
    const items = expirationsData?.items ?? [];
    const q = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      if (activeTab !== 'ALL' && activeTab !== 'DOCUMENTS' && item.category !== activeTab) {
        return false;
      }
      if (alertFilter === 'ACTIVE_ONLY') {
        if (item.status === 'ARCHIVED' || item.status === 'RENEWED') return false;
      } else if (alertFilter === 'AT_RISK') {
        if (
          item.status === 'ARCHIVED' ||
          item.status === 'RENEWED' ||
          item.evaluation.severity === 'OK'
        ) {
          return false;
        }
      } else if (alertFilter === 'EXPIRED') {
        if (item.evaluation.severity !== 'EXPIRED') return false;
      } else if (alertFilter === 'URGENT_7') {
        if (item.evaluation.severity !== 'URGENT_7' && item.evaluation.severity !== 'EXPIRED') {
          return false;
        }
      } else if (alertFilter === 'OK') {
        if (item.evaluation.severity !== 'OK') return false;
      }

      if (!q) return true;
      return [
        item.title,
        item.referenceCode,
        item.providerOrEntity,
        item.employee?.fullName,
        item.employee?.nationalId,
        item.notes,
      ].some((field) => field?.toLowerCase().includes(q));
    });
  }, [expirationsData?.items, activeTab, alertFilter, searchTerm]);

  const documentAlerts = useMemo(() => {
    const docs = expirationsData?.documentExpirations ?? [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.fileName.toLowerCase().includes(q) ||
        d.employeeName.toLowerCase().includes(q) ||
        d.documentType.toLowerCase().includes(q),
    );
  }, [expirationsData?.documentExpirations, searchTerm]);

  const selectedDocEmployee: EmployeeRecord | undefined = employees.find(
    (e) => e.id === docAssignEmployeeId,
  );

  const openEdit = (item: ExpirationRecordItem) => {
    if (editingId === item.id) {
      setEditingId(null);
      return;
    }
    setRenewingId(null);
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditExpiresAt(item.expiresAt);
    setEditAlertDays(String(item.alertDaysBefore));
    setEditRecipientsRaw(item.recipientEmails.join(', '));
    setEditNotes(item.notes ?? '');
  };

  const openRenew = (item: ExpirationRecordItem) => {
    if (renewingId === item.id) {
      setRenewingId(null);
      return;
    }
    setEditingId(null);
    setRenewingId(item.id);
    setRenewExpiresAt('');
    setRenewReference(item.referenceCode ?? '');
    setRenewNotes('');
  };

  const promoteDocumentToAlert = (doc: ExpirationDocumentAlert) => {
    setCreateOpen(true);
    setCategory('CERTIFICATION');
    setTitle(`${doc.documentType} — ${doc.employeeName}`);
    setEmployeeId(doc.employeeId);
    setOperationalArea(doc.operationalArea ?? '');
    setReferenceCode(doc.fileName);
    setExpiresAt(doc.expirationDate);
    setAlertDaysBefore('30');
    setNotifyEmployee(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Alertas Automáticas de Vencimiento
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Seguimiento diario automático (08:00 AM) de contratos, licencias y certificaciones con
              notificación escalonada (30, 15, 7 días y vencidos).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreateOrEdit && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={scanMutation.isPending}
                  onClick={() => scanMutation.mutate()}
                >
                  <Send className="h-3.5 w-3.5" />
                  {scanMutation.isPending ? 'Verificando...' : 'Verificar y enviar alertas'}
                </Button>
                <Button type="button" size="sm" onClick={() => setCreateOpen((v) => !v)}>
                  <Plus className="h-3.5 w-3.5" />
                  {createOpen ? 'Cerrar formulario' : 'Registrar vencimiento'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-rose-200/80 bg-white px-4 py-3 dark:border-rose-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Vencidos
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-rose-700 dark:text-rose-300">
              {kpis.expiredCount}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200/80 bg-white px-4 py-3 dark:border-amber-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Críticos (≤ 7 días)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              {kpis.urgent7Count}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Próximos (8–30 días)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {kpis.warning15Count + kpis.upcoming30Count}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-4 py-3 dark:border-emerald-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Vigentes al día
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {kpis.onTrackCount}
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

        {/* Formulario creación */}
        {createOpen && canCreateOrEdit && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BellRing className="h-4 w-4 text-zinc-500" />
                Nuevo contrato, licencia o certificación monitoreada
              </CardTitle>
              <CardDescription>
                Si dejas destinatarios vacíos, el sistema alertará automáticamente a Talento Humano
                (o IT Support para licencias).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!title.trim() || !expiresAt) return;
                  createMutation.mutate();
                }}
                className="grid gap-3 sm:grid-cols-3"
              >
                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-[11px]">Categoría *</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRATION_CATEGORIES.map((cat) => {
                      const disabled = isItSupport && cat !== 'LICENSE';
                      const active = category === cat;
                      const Icon = getCategoryIcon(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          disabled={disabled}
                          onClick={() => setCategory(cat)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            active
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {EXPIRATION_CATEGORY_LABELS[cat]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px]">Título o descripción *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      category === 'CONTRACT'
                        ? 'Contrato Término Fijo — Ejecutivo Ventas'
                        : category === 'LICENSE'
                          ? 'Licencia Microsoft 365 E3 / Conducción'
                          : 'Certificación SST / Trabajo en Alturas / AWS'
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Fecha de vencimiento *</Label>
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Colaborador asociado (opcional)</Label>
                  <Select
                    value={employeeId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setEmployeeId(nextId);
                      const found = employees.find((emp) => emp.id === nextId);
                      if (found?.operationalArea && !operationalArea) {
                        setOperationalArea(found.operationalArea);
                      }
                    }}
                  >
                    <option value="">General / Corporativo</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.nationalId})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Área operativa</Label>
                  <Select
                    value={operationalArea}
                    onChange={(e) => setOperationalArea((e.target.value as OperationalArea) || '')}
                  >
                    <option value="">Transversal / Todas</option>
                    {OPERATIONAL_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Días de anticipación (umbral inicial)</Label>
                  <Select
                    value={alertDaysBefore}
                    onChange={(e) => setAlertDaysBefore(e.target.value)}
                  >
                    <option value="7">7 días antes</option>
                    <option value="15">15 días antes</option>
                    <option value="30">30 días antes (recomendado)</option>
                    <option value="60">60 días antes</option>
                    <option value="90">90 días antes</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Código / Referencia</Label>
                  <Input
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    placeholder="CTR-2026-014 / LIC-992"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Entidad / Proveedor</Label>
                  <Input
                    value={providerOrEntity}
                    onChange={(e) => setProviderOrEntity(e.target.value)}
                    placeholder="Microsoft / SENA / ARL Sura / TH"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Fecha inicio / emisión (opcional)</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px]">
                    Destinatarios de alerta (correos separados por coma, opcional)
                  </Label>
                  <Input
                    value={recipientEmailsRaw}
                    onChange={(e) => setRecipientEmailsRaw(e.target.value)}
                    placeholder="talento.humano@alliance.com.co, lider.dsi@alliance.com.co"
                  />
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEmployee}
                      onChange={(e) => setNotifyEmployee(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    Notificar también al colaborador
                  </label>
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-[11px]">Notas / Plan de renovación</Label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Confirmar continuidad con líder 15 días antes o renovar póliza..."
                  />
                </div>

                <div className="flex justify-end gap-2 sm:col-span-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Guardando...' : 'Guardar vencimiento'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabs y Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-zinc-200/80 bg-white p-1 dark:border-zinc-800/80 dark:bg-[#0f0f12]">
            {(
              [
                { id: 'ALL', label: `Todos (${kpis.totalActive})` },
                { id: 'CONTRACT', label: `Contratos (${kpis.contractsCount})` },
                { id: 'LICENSE', label: `Licencias (${kpis.licensesCount})` },
                { id: 'CERTIFICATION', label: `Certificaciones (${kpis.certificationsCount})` },
                {
                  id: 'DOCUMENTS',
                  label: `Docs. Expediente (${kpis.documentsWithExpirationCount})`,
                },
              ] as Array<{ id: CategoryTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar título, persona o código..."
                className="w-56 pl-8 text-xs"
              />
            </div>
            {activeTab !== 'DOCUMENTS' && (
              <Select
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value as AlertFilter)}
                className="w-48 text-xs"
              >
                <option value="ACTIVE_ONLY">Activos y por vencer</option>
                <option value="AT_RISK">Solo en alerta / vencidos</option>
                <option value="URGENT_7">Críticos (≤ 7d) y vencidos</option>
                <option value="EXPIRED">Solo vencidos</option>
                <option value="OK">Vigentes al día</option>
                <option value="ALL_INCLUDING_ARCHIVED">Incluir archivados</option>
              </Select>
            )}
          </div>
        </div>

        {/* Vista principal: Lista de contratos, licencias y certificaciones */}
        {activeTab !== 'DOCUMENTS' ? (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  Cargando matriz de vencimientos...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No hay vencimientos registrados que coincidan con el filtro actual.
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {filteredItems.map((item) => {
                    const Icon = getCategoryIcon(item.category);
                    const canModifyRow =
                      canManageAll || (isItSupport && item.category === 'LICENSE');

                    return (
                      <div key={item.id} className="space-y-3 p-4 text-xs">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Icon className="h-3.5 w-3.5 text-zinc-500" />
                              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
                                {item.title}
                              </span>
                              <Badge variant="outline">
                                {EXPIRATION_CATEGORY_LABELS[item.category]}
                              </Badge>
                              <Badge variant={getSeverityBadgeVariant(item.evaluation.severity)}>
                                {item.evaluation.severity === 'EXPIRED' ? (
                                  <AlertTriangle className="h-3 w-3" />
                                ) : item.evaluation.severity === 'OK' ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <Clock className="h-3 w-3" />
                                )}
                                {item.evaluation.daysLabel}
                              </Badge>
                              {item.status === 'ARCHIVED' && (
                                <Badge variant="secondary">
                                  {EXPIRATION_STATUS_LABELS[item.status]}
                                </Badge>
                              )}
                            </div>

                            <p className="text-zinc-500 dark:text-zinc-400">
                              Vence: <strong>{formatDateDisplay(item.expiresAt)}</strong> ·
                              Preaviso {item.alertDaysBefore}d
                              {item.employee ? ` · ${item.employee.fullName}` : ''}
                              {item.operationalArea ? ` · Área ${item.operationalArea}` : ''}
                              {item.providerOrEntity ? ` · ${item.providerOrEntity}` : ''}
                              {item.referenceCode ? ` · Ref: ${item.referenceCode}` : ''}
                            </p>

                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {item.recipientEmails.length > 0
                                  ? item.recipientEmails.join(', ')
                                  : item.category === 'LICENSE'
                                    ? 'Auto: IT / TH'
                                    : 'Auto: Talento Humano'}
                                {item.notifyEmployee && item.employee ? ' + Colaborador' : ''}
                              </span>
                              <span>
                                {item.lastAlertSentAt
                                  ? `Última alerta (umbral ${item.lastAlertLevelSent}d): ${new Date(
                                      item.lastAlertSentAt,
                                    ).toLocaleString('es-CO', {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })}`
                                  : 'Sin alertas enviadas aún'}
                              </span>
                              <span>
                                Severidad: {EXPIRATION_SEVERITY_LABELS[item.evaluation.severity]}
                              </span>
                            </p>

                            {item.notes && (
                              <p className="text-zinc-600 dark:text-zinc-300">{item.notes}</p>
                            )}
                          </div>

                          {canModifyRow && item.status !== 'ARCHIVED' && (
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openRenew(item)}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Renovar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={archiveMutation.isPending}
                                onClick={() => archiveMutation.mutate(item.id)}
                              >
                                <Archive className="h-3 w-3" />
                                Archivar
                              </Button>
                            </div>
                          )}
                        </div>

                        {renewingId === item.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!renewExpiresAt) return;
                              renewMutation.mutate({
                                id: item.id,
                                payload: {
                                  newExpiresAt: renewExpiresAt,
                                  referenceCode: renewReference.trim() || undefined,
                                  notes: renewNotes.trim() || undefined,
                                },
                              });
                            }}
                            className="grid gap-2.5 rounded-md border border-emerald-200/80 bg-emerald-50/40 p-3 sm:grid-cols-3 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                          >
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nueva fecha vencimiento *</Label>
                              <Input
                                type="date"
                                value={renewExpiresAt}
                                onChange={(e) => setRenewExpiresAt(e.target.value)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nueva referencia / Otrosí</Label>
                              <Input
                                value={renewReference}
                                onChange={(e) => setRenewReference(e.target.value)}
                                placeholder="Ej. OTROSI-2027"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nota de renovación</Label>
                              <Input
                                value={renewNotes}
                                onChange={(e) => setRenewNotes(e.target.value)}
                                placeholder="Opcional..."
                              />
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setRenewingId(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={renewMutation.isPending || !renewExpiresAt}
                              >
                                {renewMutation.isPending
                                  ? 'Renovando...'
                                  : 'Confirmar renovación'}
                              </Button>
                            </div>
                          </form>
                        )}

                        {editingId === item.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateMutation.mutate({
                                id: item.id,
                                payload: {
                                  title: editTitle.trim(),
                                  expiresAt: editExpiresAt,
                                  alertDaysBefore: Number(editAlertDays) || 30,
                                  recipientEmails: parseEmailCsv(editRecipientsRaw),
                                  notes: editNotes.trim(),
                                },
                              });
                            }}
                            className="grid gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/60 p-3 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900/50"
                          >
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-[11px]">Título</Label>
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Fecha vencimiento</Label>
                              <Input
                                type="date"
                                value={editExpiresAt}
                                onChange={(e) => setEditExpiresAt(e.target.value)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Preaviso (días)</Label>
                              <Input
                                type="number"
                                min={1}
                                max={180}
                                value={editAlertDays}
                                onChange={(e) => setEditAlertDays(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-[11px]">Destinatarios (separados por coma)</Label>
                              <Input
                                value={editRecipientsRaw}
                                onChange={(e) => setEditRecipientsRaw(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-3">
                              <Label className="text-[11px]">Notas</Label>
                              <Input
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </Button>
                              <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Pestaña Documentos del Expediente con vencimiento */
          <div className="space-y-4">
            {canManageAll && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    Asignar vencimiento a documento del expediente digital
                  </CardTitle>
                  <CardDescription>
                    Controla fechas de vigencia sobre certificados cargados en Pre-Ingreso (EPS,
                    pensión, certificados académicos, etc.).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!docAssignDocId || !docAssignDate) return;
                      assignDocExpirationMutation.mutate();
                    }}
                    className="grid gap-3 sm:grid-cols-4"
                  >
                    <div className="space-y-1">
                      <Label className="text-[11px]">Colaborador</Label>
                      <Select
                        value={docAssignEmployeeId}
                        onChange={(e) => {
                          setDocAssignEmployeeId(e.target.value);
                          setDocAssignDocId('');
                        }}
                      >
                        <option value="">Selecciona colaborador...</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Documento</Label>
                      <Select
                        value={docAssignDocId}
                        onChange={(e) => setDocAssignDocId(e.target.value)}
                        disabled={!selectedDocEmployee}
                      >
                        <option value="">Selecciona soporte...</option>
                        {(selectedDocEmployee?.documents ?? []).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.documentType} · {d.fileName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Fecha vencimiento</Label>
                      <Input
                        type="date"
                        value={docAssignDate}
                        onChange={(e) => setDocAssignDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          assignDocExpirationMutation.isPending ||
                          !docAssignDocId ||
                          !docAssignDate
                        }
                      >
                        {assignDocExpirationMutation.isPending
                          ? 'Guardando...'
                          : 'Asignar vencimiento'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                {documentAlerts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Ningún documento del expediente tiene fecha de vencimiento asignada todavía.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {documentAlerts.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{doc.fileName}</span>
                            <Badge variant="outline">{doc.documentType}</Badge>
                            <Badge variant={getSeverityBadgeVariant(doc.evaluation.severity)}>
                              {doc.evaluation.daysLabel}
                            </Badge>
                          </div>
                          <p className="text-zinc-500">
                            {doc.employeeName} ({doc.nationalId})
                            {doc.operationalArea ? ` · Área ${doc.operationalArea}` : ''} · Vence:{' '}
                            <strong>{formatDateDisplay(doc.expirationDate)}</strong>
                          </p>
                        </div>

                        {canManageAll && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => promoteDocumentToAlert(doc)}
                          >
                            <BellRing className="h-3 w-3" />
                            Crear alerta automática
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
