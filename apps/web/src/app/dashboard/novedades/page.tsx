'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Clock4,
  Download,
  Eye,
  FilePlus2,
  HeartPulse,
  Plus,
  Search,
  TimerReset,
  XCircle,
} from 'lucide-react';
import {
  computeDurationMinutes,
  computeInclusiveDays,
  formatDurationFromMinutes,
  OVERTIME_SURCHARGE_PERCENT,
  TIME_REQUEST_CATEGORIES,
  TIME_REQUEST_CATEGORY_LABELS,
  TIME_REQUEST_STATUS_LABELS,
  TIME_REQUEST_SUBTYPES,
  TimeRequestCategory,
  TimeRequestStatus,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { DocumentPreviewModal } from '@/components/document-preview-modal';
import { apiClient, TimeRequestItem } from '@/lib/api';
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

type CategoryFilterTab = TimeRequestCategory | 'ALL';

function getStatusBadgeVariant(
  status: TimeRequestStatus,
): 'default' | 'success' | 'warning' | 'danger' | 'outline' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PENDING_LEADER':
    case 'PENDING_TH':
      return 'warning';
    default:
      return 'outline';
  }
}

function getCategoryIcon(cat: TimeRequestCategory) {
  switch (cat) {
    case 'INCAPACITY':
      return HeartPulse;
    case 'LICENSE':
      return CalendarDays;
    case 'PERSONAL_PERMISSION':
      return Clock;
    case 'OVERTIME':
      return TimerReset;
  }
}

function formatDateDisplay(dateOnly: string): string {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateOnly;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function TimeRequestsDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isThOrAdmin =
    !user ||
    user.role === 'TH_ANALYST' ||
    user.role === 'TH_ADMIN' ||
    user.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<CategoryFilterTab>('ALL');
  const [statusFilter, setStatusFilter] = useState<TimeRequestStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Creación
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState<TimeRequestCategory>('INCAPACITY');
  const [subtype, setSubtype] = useState(TIME_REQUEST_SUBTYPES.INCAPACITY[0].value);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('2026-11-26');
  const [endDate, setEndDate] = useState('2026-11-28');
  const [permissionByHours, setPermissionByHours] = useState(true);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('11:00');
  const [isPaid, setIsPaid] = useState(true);
  const [medicalEntity, setMedicalEntity] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [compensationType, setCompensationType] = useState('REMUNERADO');
  const [reason, setReason] = useState('');
  const [createExpirationAlert, setCreateExpirationAlert] = useState(true);
  const [alertDaysBefore, setAlertDaysBefore] = useState('3');
  const [autoApproveByTh, setAutoApproveByTh] = useState(false);
  const [supportFile, setSupportFile] = useState<File | null>(null);

  // Revisión en línea
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewCreateAlert, setReviewCreateAlert] = useState(false);

  // Modal previsualización de soporte
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

  const { data: listData, isLoading } = useQuery({
    queryKey: ['time-requests'],
    queryFn: () => apiClient.getTimeRequests(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient.getEmployees(),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['time-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['expirations'] });
    void queryClient.invalidateQueries({ queryKey: ['expirations-summary'] });
  };

  const handleSelectCategory = (nextCat: TimeRequestCategory) => {
    setCategory(nextCat);
    const firstOpt = TIME_REQUEST_SUBTYPES[nextCat][0];
    setSubtype(firstOpt.value);
    setIsPaid(firstOpt.defaultPaid);
    if (nextCat === 'OVERTIME') {
      setStartTime('18:00');
      setEndTime('21:00');
      setCompensationType('RECARGO_NOMINA');
      setEndDate(startDate);
      setCreateExpirationAlert(false);
    } else if (nextCat === 'PERSONAL_PERMISSION') {
      setStartTime('09:00');
      setEndTime('12:00');
      setCompensationType('REMUNERADO');
      setEndDate(startDate);
      setCreateExpirationAlert(false);
    } else {
      setCreateExpirationAlert(true);
    }
  };

  const liveCalculationLabel = useMemo(() => {
    if (category === 'OVERTIME') {
      const mins = computeDurationMinutes(startTime, endTime);
      const pct = OVERTIME_SURCHARGE_PERCENT[subtype] ?? 0;
      return mins > 0
        ? `${formatDurationFromMinutes(mins)}${pct > 0 ? ` · Recargo +${pct}%` : ''}`
        : 'Horario inválido';
    }
    if (category === 'PERSONAL_PERMISSION' && permissionByHours) {
      const mins = computeDurationMinutes(startTime, endTime);
      return mins > 0 ? formatDurationFromMinutes(mins) : 'Horario inválido';
    }
    const days = computeInclusiveDays(startDate, endDate || startDate);
    return days > 0 ? `${days} día${days === 1 ? '' : 's'}` : 'Rango de fechas inválido';
  }, [category, startDate, endDate, startTime, endTime, permissionByHours, subtype]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const needsTimes =
        category === 'OVERTIME' || (category === 'PERSONAL_PERMISSION' && permissionByHours);
      const effectiveEndDate =
        category === 'OVERTIME' || (category === 'PERSONAL_PERMISSION' && permissionByHours)
          ? startDate
          : endDate || startDate;

      const created = await apiClient.createTimeRequest({
        employeeId,
        category,
        subtype,
        title: title.trim(),
        startDate,
        endDate: effectiveEndDate,
        startTime: needsTimes ? startTime : undefined,
        endTime: needsTimes ? endTime : undefined,
        isPaid,
        medicalEntity: medicalEntity.trim() || undefined,
        diagnosisCode: diagnosisCode.trim() || undefined,
        compensationType:
          category === 'OVERTIME' || category === 'PERSONAL_PERMISSION'
            ? compensationType
            : undefined,
        reason: reason.trim() || undefined,
        createExpirationAlert:
          category === 'INCAPACITY' || category === 'LICENSE' ? createExpirationAlert : false,
        alertDaysBefore: Number(alertDaysBefore) || 7,
        autoApproveByTh: isThOrAdmin ? autoApproveByTh : false,
      });

      if (supportFile) {
        await apiClient.uploadTimeRequestSupport(created.id, supportFile);
      }

      return created;
    },
    onSuccess: (created) => {
      setFeedback(
        `Novedad registrada: "${created.title}" (${created.durationLabel}).${
          created.linkedExpirationId
            ? ' Se creó alerta automática de vencimiento / retorno.'
            : ''
        }`,
      );
      setTitle('');
      setMedicalEntity('');
      setDiagnosisCode('');
      setReason('');
      setSupportFile(null);
      setCreateOpen(false);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo registrar la novedad.');
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      note,
      createAlert,
    }: {
      id: string;
      decision: 'APPROVE' | 'REJECT' | 'CANCEL';
      note?: string;
      createAlert?: boolean;
    }) =>
      apiClient.reviewTimeRequest(id, {
        decision,
        note: note?.trim() || undefined,
        createExpirationAlert: createAlert,
      }),
    onSuccess: (updated) => {
      setReviewingId(null);
      setReviewNote('');
      setFeedback(
        `Novedad "${updated.title}" actualizada a ${TIME_REQUEST_STATUS_LABELS[updated.status]}.`,
      );
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'Error procesando la revisión.');
    },
  });

  const uploadRowSupportMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      apiClient.uploadTimeRequestSupport(id, file),
    onSuccess: (updated) => {
      setFeedback(`Soporte "${updated.supportFileName ?? 'archivo'}" cargado correctamente.`);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo subir el soporte.');
    },
  });

  const openSupportPreview = async (item: TimeRequestItem) => {
    setPreviewState({
      open: true,
      fileName: item.supportFileName ?? 'soporte-novedad.pdf',
      mimeType: item.supportMimeType ?? 'application/pdf',
      objectUrl: null,
      loading: true,
      error: null,
    });
    try {
      const res = await apiClient.fetchProtectedBlob(`/time-requests/${item.id}/support/content`);
      setPreviewState({
        open: true,
        fileName: item.supportFileName ?? 'soporte-novedad.pdf',
        mimeType: item.supportMimeType || res.contentType,
        objectUrl: res.objectUrl,
        loading: false,
        error: null,
      });
    } catch (err) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo abrir el soporte.',
      }));
    }
  };

  const downloadSupport = async (item: TimeRequestItem) => {
    try {
      const res = await apiClient.fetchProtectedBlob(
        `/time-requests/${item.id}/support/content?download=1`,
      );
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = item.supportFileName ?? 'soporte-novedad.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo descargar el soporte.');
    }
  };

  const kpis = listData?.kpis ?? {
    totalCount: 0,
    pendingCount: 0,
    approvedIncapacitiesCount: 0,
    approvedIncapacityDays: 0,
    approvedLeavesAndPermissionsCount: 0,
    approvedOvertimeCount: 0,
    approvedOvertimeMinutes: 0,
    approvedOvertimeHoursLabel: '0 h',
  };

  const filteredItems = useMemo(() => {
    const rows = listData?.items ?? [];
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((item) => {
      if (activeTab !== 'ALL' && item.category !== activeTab) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!q) return true;
      return [
        item.title,
        item.subtypeLabel,
        item.employee?.fullName,
        item.employee?.nationalId,
        item.medicalEntity,
        item.reason,
      ].some((f) => f?.toLowerCase().includes(q));
    });
  }, [listData?.items, activeTab, statusFilter, searchTerm]);

  const activeEmployees = employees.filter(
    (e) => e.status === 'ACTIVE' || e.status === 'PRE_ONBOARDING',
  );

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Cabecera */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Incapacidades, Licencias, Permisos y Horas Extra
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Registro de ausentismos médicos, permisos personales, novedades de nómina y recargos
              con flujo de aprobación Líder / Talento Humano y enlace con alertas de vencimiento.
            </p>
          </div>

          <Button type="button" size="sm" onClick={() => setCreateOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
            {createOpen ? 'Cerrar formulario' : 'Registrar novedad'}
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-amber-200/80 bg-white px-4 py-3 dark:border-amber-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Pendientes aprobación
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              {kpis.pendingCount}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Incapacidades aprobadas
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {kpis.approvedIncapacitiesCount}{' '}
              <span className="text-xs font-normal text-zinc-500">
                ({kpis.approvedIncapacityDays} días)
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Licencias y permisos
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {kpis.approvedLeavesAndPermissionsCount}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-4 py-3 dark:border-emerald-900/50 dark:bg-zinc-900/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Horas extra aprobadas
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {kpis.approvedOvertimeHoursLabel}{' '}
              <span className="text-xs font-normal text-zinc-500">
                ({kpis.approvedOvertimeCount})
              </span>
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
        {createOpen && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock4 className="h-4 w-4 text-zinc-500" />
                Nueva solicitud o registro de novedad laboral
              </CardTitle>
              <CardDescription>
                Calcula automáticamente días calendario o duración por horas (incluyendo turnos
                nocturnos).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!employeeId || !title.trim() || !startDate) return;
                  createMutation.mutate();
                }}
                className="grid gap-3 sm:grid-cols-3"
              >
                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-[11px]">Tipo de novedad *</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_REQUEST_CATEGORIES.map((cat) => {
                      const active = category === cat;
                      const Icon = getCategoryIcon(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleSelectCategory(cat)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {TIME_REQUEST_CATEGORY_LABELS[cat]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Colaborador *</Label>
                  <Select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona colaborador...</option>
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.operationalArea ?? 'Sin área'})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Subtipo / Clasificación *</Label>
                  <Select
                    value={subtype}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSubtype(val);
                      const matched = TIME_REQUEST_SUBTYPES[category].find((s) => s.value === val);
                      if (matched) setIsPaid(matched.defaultPaid);
                    }}
                  >
                    {TIME_REQUEST_SUBTYPES[category].map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Título breve *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      category === 'INCAPACITY'
                        ? 'Incapacidad médica EPS'
                        : category === 'LICENSE'
                          ? 'Licencia de paternidad / luto'
                          : category === 'PERSONAL_PERMISSION'
                            ? 'Cita odontológica / diligencia'
                            : 'Despliegue / cierre mensual'
                    }
                    required
                  />
                </div>

                {category === 'PERSONAL_PERMISSION' && (
                  <div className="flex items-center gap-3 sm:col-span-3">
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissionByHours}
                        onChange={(e) => setPermissionByHours(e.target.checked)}
                      />
                      Permiso por horas en un solo día (si se desmarca aplica por días calendario)
                    </label>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">
                    {category === 'OVERTIME' ||
                    (category === 'PERSONAL_PERMISSION' && permissionByHours)
                      ? 'Fecha *'
                      : 'Fecha inicio *'}
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                {category === 'OVERTIME' ||
                (category === 'PERSONAL_PERMISSION' && permissionByHours) ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Hora inicio *</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Hora fin *</Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Fecha fin *</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="flex items-end pb-1">
                  <div className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="text-zinc-500">Cálculo automático: </span>
                    <strong className="text-zinc-900 dark:text-zinc-100">
                      {liveCalculationLabel}
                    </strong>
                  </div>
                </div>

                {(category === 'INCAPACITY' || category === 'LICENSE') && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[11px]">
                        {category === 'INCAPACITY' ? 'EPS / ARL / Entidad' : 'Entidad / Soporte'}
                      </Label>
                      <Input
                        value={medicalEntity}
                        onChange={(e) => setMedicalEntity(e.target.value)}
                        placeholder={category === 'INCAPACITY' ? 'EPS Sura / ARL Bolívar' : 'Opcional'}
                      />
                    </div>
                    {category === 'INCAPACITY' && (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Código diagnóstico (CIE-10)</Label>
                        <Input
                          value={diagnosisCode}
                          onChange={(e) => setDiagnosisCode(e.target.value)}
                          placeholder="Ej. J06.9 (opcional)"
                        />
                      </div>
                    )}
                  </>
                )}

                {(category === 'PERSONAL_PERMISSION' || category === 'OVERTIME') && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tratamiento / Compensación</Label>
                    <Select
                      value={compensationType}
                      onChange={(e) => setCompensationType(e.target.value)}
                    >
                      {category === 'OVERTIME' ? (
                        <>
                          <option value="RECARGO_NOMINA">Pago con recargo en nómina</option>
                          <option value="COMPENSATORIO">Banco de tiempo compensatorio</option>
                        </>
                      ) : (
                        <>
                          <option value="REMUNERADO">Permiso remunerado</option>
                          <option value="NO_REMUNERADO">Permiso no remunerado</option>
                          <option value="A_REPONER">Tiempo a reponer</option>
                          <option value="CARGO_A_COMPENSATORIO">Con cargo a compensatorio</option>
                        </>
                      )}
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Soporte PDF o imagen (opcional)</Label>
                  <Input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setSupportFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPaid}
                      onChange={(e) => setIsPaid(e.target.checked)}
                    />
                    Remunerada / con pago salarial
                  </label>

                  {(category === 'INCAPACITY' || category === 'LICENSE') && (
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createExpirationAlert}
                        onChange={(e) => setCreateExpirationAlert(e.target.checked)}
                      />
                      Crear alerta automática de vencimiento / retorno ({alertDaysBefore}d antes)
                    </label>
                  )}

                  {isThOrAdmin && (
                    <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoApproveByTh}
                        onChange={(e) => setAutoApproveByTh(e.target.checked)}
                      />
                      Aprobar inmediatamente como TH
                    </label>
                  )}
                </div>

                {createExpirationAlert && (category === 'INCAPACITY' || category === 'LICENSE') && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Días preaviso de retorno</Label>
                    <Select
                      value={alertDaysBefore}
                      onChange={(e) => setAlertDaysBefore(e.target.value)}
                    >
                      <option value="1">1 día antes</option>
                      <option value="3">3 días antes</option>
                      <option value="7">7 días antes</option>
                      <option value="15">15 días antes</option>
                    </Select>
                  </div>
                )}

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-[11px]">Motivo / Detalles</Label>
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Observaciones médicas, tarea ejecutada en horas extra o motivo del permiso..."
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
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createMutation.isPending || !employeeId || !title.trim()}
                  >
                    {createMutation.isPending ? 'Guardando...' : 'Registrar novedad'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-zinc-200/80 bg-white p-1 dark:border-zinc-800/80 dark:bg-[#0f0f12]">
            {(
              [
                { id: 'ALL', label: `Todas (${kpis.totalCount})` },
                { id: 'INCAPACITY', label: 'Incapacidades' },
                { id: 'LICENSE', label: 'Licencias' },
                { id: 'PERSONAL_PERMISSION', label: 'Permisos' },
                { id: 'OVERTIME', label: 'Horas Extra' },
              ] as Array<{ id: CategoryFilterTab; label: string }>
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
                placeholder="Buscar colaborador, EPS o motivo..."
                className="w-56 pl-8 text-xs"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TimeRequestStatus | 'ALL')}
              className="w-44 text-xs"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDING_TH">Pendiente TH</option>
              <option value="PENDING_LEADER">Pendiente Líder</option>
              <option value="APPROVED">Aprobadas</option>
              <option value="REJECTED">Rechazadas</option>
              <option value="CANCELLED">Canceladas</option>
            </Select>
          </div>
        </div>

        {/* Listado */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Cargando novedades laborales y horas extra...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No hay registros que coincidan con el filtro seleccionado.
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                {filteredItems.map((item) => {
                  const Icon = getCategoryIcon(item.category);
                  const canApproveThis =
                    item.status === 'PENDING_LEADER' ||
                    (item.status === 'PENDING_TH' && isThOrAdmin);

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
                              {TIME_REQUEST_CATEGORY_LABELS[item.category]}
                            </Badge>
                            <Badge variant={getStatusBadgeVariant(item.status)}>
                              {TIME_REQUEST_STATUS_LABELS[item.status]}
                            </Badge>
                            <Badge variant="secondary">{item.durationLabel}</Badge>
                            {item.surchargePercent !== null && item.surchargePercent > 0 && (
                              <Badge variant="default">+{item.surchargePercent}% recargo</Badge>
                            )}
                          </div>

                          <p className="text-zinc-500 dark:text-zinc-400">
                            <strong>{item.employee?.fullName ?? 'Colaborador'}</strong>
                            {item.operationalArea ? ` · ${item.operationalArea}` : ''} ·{' '}
                            {item.subtypeLabel} ·{' '}
                            {item.startDate === item.endDate
                              ? formatDateDisplay(item.startDate)
                              : `${formatDateDisplay(item.startDate)} al ${formatDateDisplay(
                                  item.endDate,
                                )}`}
                            {item.startTime && item.endTime
                              ? ` (${item.startTime}–${item.endTime})`
                              : ''}
                            {item.medicalEntity ? ` · ${item.medicalEntity}` : ''}
                            {item.diagnosisCode ? ` · CIE-10 ${item.diagnosisCode}` : ''}
                            {!item.isPaid ? ' · No remunerada' : ''}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {item.supportS3Key ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openSupportPreview(item)}
                                  className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 text-[11px] font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 cursor-pointer"
                                >
                                  <Eye className="h-3 w-3" />
                                  Ver soporte ({item.supportFileName ?? 'archivo'})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadSupport(item)}
                                  className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 text-[11px] hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 cursor-pointer"
                                >
                                  <Download className="h-3 w-3" />
                                  Descargar
                                </button>
                              </>
                            ) : (
                              <label className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-zinc-300 px-2 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 cursor-pointer">
                                <FilePlus2 className="h-3 w-3" />
                                Adjuntar soporte
                                <input
                                  type="file"
                                  accept=".pdf,image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                      uploadRowSupportMutation.mutate({ id: item.id, file: f });
                                    }
                                  }}
                                />
                              </label>
                            )}

                            {item.linkedExpirationId && (
                              <Link
                                href="/dashboard/vencimientos"
                                className="inline-flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                              >
                                <BellRing className="h-3 w-3" />
                                Con alerta en Vencimientos
                              </Link>
                            )}
                          </div>

                          {item.reason && (
                            <p className="text-zinc-600 dark:text-zinc-300">{item.reason}</p>
                          )}
                          {item.reviewNote && (
                            <p className="text-[11px] text-zinc-500">
                              Nota revisión: {item.reviewNote}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {canApproveThis && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (reviewingId === item.id) {
                                  setReviewingId(null);
                                } else {
                                  setReviewingId(item.id);
                                  setReviewNote('');
                                  setReviewCreateAlert(item.pendingExpirationAlert);
                                }
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Revisar / Aprobar
                            </Button>
                          )}
                        </div>
                      </div>

                      {reviewingId === item.id && (
                        <div className="grid gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/70 p-3 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                          <div className="space-y-1 sm:col-span-3">
                            <Label className="text-[11px]">Observación de aprobación o rechazo</Label>
                            <Input
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              placeholder="Opcional al aprobar; recomendado al rechazar..."
                            />
                          </div>
                          {isThOrAdmin &&
                            !item.linkedExpirationId &&
                            (item.category === 'INCAPACITY' || item.category === 'LICENSE') && (
                              <label className="flex items-center gap-2 text-xs sm:col-span-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={reviewCreateAlert}
                                  onChange={(e) => setReviewCreateAlert(e.target.checked)}
                                />
                                Crear alerta automática de vencimiento / retorno al aprobar
                              </label>
                            )}
                          <div className="flex flex-wrap justify-end gap-2 sm:col-span-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setReviewingId(null)}
                            >
                              Cerrar
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={reviewMutation.isPending}
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: item.id,
                                  decision: 'REJECT',
                                  note: reviewNote,
                                })
                              }
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Rechazar
                            </Button>
                            <Button
                              type="button"
                              variant="success"
                              size="sm"
                              disabled={reviewMutation.isPending}
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: item.id,
                                  decision: 'APPROVE',
                                  note: reviewNote,
                                  createAlert: reviewCreateAlert,
                                })
                              }
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {isThOrAdmin ? 'Aprobar novedad' : 'Avalar (enviar a TH)'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DocumentPreviewModal
        open={previewState.open}
        fileName={previewState.fileName}
        mimeType={previewState.mimeType}
        objectUrl={previewState.objectUrl}
        loading={previewState.loading}
        error={previewState.error}
        onClose={() => {
          if (previewState.objectUrl) URL.revokeObjectURL(previewState.objectUrl);
          setPreviewState((prev) => ({ ...prev, open: false, objectUrl: null }));
        }}
      />
    </AppShell>
  );
}
