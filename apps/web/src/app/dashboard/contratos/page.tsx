'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Download,
  Eye,
  FilePlus2,
  FileText,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  CONTRACT_MODALITY_OPTIONS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  ContractStatus,
  ContractType,
  OPERATIONAL_AREAS,
  OperationalArea,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  SUPABASE_FREE_MAX_FILE_SIZE_LABEL,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { DocumentPreviewModal } from '@/components/document-preview-modal';
import {
  apiClient,
  ContractItem,
  EmployeeRecord,
  EmployeeWithoutContractSummary,
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
  Select,
  Textarea,
} from '@/components/ui/primitives';

type QuickViewMode =
  | 'ALL'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'INDEFINITE'
  | 'FIXED_TERM'
  | 'RECENT_30D'
  | 'WITHOUT_PDF'
  | 'WITHOUT_CONTRACT';

type DateFieldFilter = 'any' | 'startsAt' | 'endsAt' | 'signedAt';
type SortOption =
  | 'startsAt_desc'
  | 'startsAt_asc'
  | 'endsAt_asc'
  | 'endsAt_desc'
  | 'name_asc'
  | 'updated_desc';

function formatDateDisplay(dateOnly?: string | null): string {
  if (!dateOnly) return '—';
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateOnly;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatCop(amount?: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusBadgeVariant(
  status: ContractStatus,
): 'default' | 'success' | 'warning' | 'danger' | 'outline' {
  switch (status) {
    case 'ACTIVE':
    case 'RENEWED':
      return 'success';
    case 'EXPIRING_SOON':
      return 'warning';
    case 'EXPIRED':
    case 'TERMINATED':
      return 'danger';
    default:
      return 'outline';
  }
}

function dateInRange(candidateDate: string | null, from?: string, to?: string): boolean {
  if (!candidateDate) return false;
  if (from && candidateDate < from) return false;
  if (to && candidateDate > to) return false;
  return true;
}

export default function ContratosDashboardPage() {
  const queryClient = useQueryClient();

  // Buscador inteligente y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [quickMode, setQuickMode] = useState<QuickViewMode>('ALL');
  const [contractTypeFilter, setContractTypeFilter] = useState<ContractType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'ALL'>('ALL');
  const [areaFilter, setAreaFilter] = useState<OperationalArea | 'ALL'>('ALL');
  const [dateField, setDateField] = useState<DateFieldFilter>('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('startsAt_desc');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formulario nuevo contrato
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [title, setTitle] = useState('');
  const [contractType, setContractType] = useState<ContractType>('FIXED_TERM');
  const [status, setStatus] = useState<ContractStatus>('ACTIVE');
  const [operationalArea, setOperationalArea] = useState<OperationalArea | ''>('');
  const [jobTitle, setJobTitle] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [workModality, setWorkModality] = useState<string>('Híbrido');
  const [salaryCop, setSalaryCop] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [alertDaysBefore, setAlertDaysBefore] = useState('30');
  const [notes, setNotes] = useState('');
  const [newPdfFile, setNewPdfFile] = useState<File | null>(null);

  // Acciones en línea (Editar / Prorrogar / Terminar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<ContractType>('FIXED_TERM');
  const [editStatus, setEditStatus] = useState<ContractStatus>('ACTIVE');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editCostCenter, setEditCostCenter] = useState('');
  const [editModality, setEditModality] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editSignedAt, setEditSignedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewEndsAt, setRenewEndsAt] = useState('');
  const [renewType, setRenewType] = useState<ContractType>('FIXED_TERM');
  const [renewCode, setRenewCode] = useState('');
  const [renewSalary, setRenewSalary] = useState('');
  const [renewNotes, setRenewNotes] = useState('');

  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [terminateDate, setTerminateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [terminateNotes, setTerminateNotes] = useState('');

  const [uploadingContractId, setUploadingContractId] = useState<string | null>(null);

  // Modal de previsualización
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

  const { data: contractsData, isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => apiClient.getContracts(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient.getEmployees(),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    void queryClient.invalidateQueries({ queryKey: ['expirations'] });
  };

  const prefillFromEmployee = (emp: EmployeeRecord | EmployeeWithoutContractSummary) => {
    setEmployeeId(emp.id);
    setOperationalArea(emp.operationalArea ?? '');
    setJobTitle(emp.jobTitle ?? '');
    setCostCenter(emp.costCenter ?? '');
    const hireDateStr = emp.hireDate ? String(emp.hireDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    setStartsAt(hireDateStr);
    setTitle(
      `Contrato Laboral${emp.jobTitle ? ` — ${emp.jobTitle}` : ''} (${emp.fullName})`.slice(0, 180),
    );
    setCreateOpen(true);
    setErrorMsg(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await apiClient.createContract({
        employeeId,
        contractCode: contractCode.trim() || undefined,
        title: title.trim(),
        contractType,
        status,
        operationalArea: operationalArea || undefined,
        jobTitle: jobTitle.trim() || undefined,
        costCenter: costCenter.trim() || undefined,
        workModality: workModality.trim() || undefined,
        salaryCop: salaryCop.trim() ? Number(salaryCop) : undefined,
        startsAt,
        endsAt: contractType === 'INDEFINITE' && !endsAt ? undefined : endsAt || undefined,
        signedAt: signedAt || undefined,
        alertDaysBefore: Number(alertDaysBefore) || 30,
        notes: notes.trim() || undefined,
      });

      if (newPdfFile) {
        return apiClient.uploadContractDocument(created.id, newPdfFile);
      }
      return created;
    },
    onSuccess: (created) => {
      setErrorMsg(null);
      setFeedback(
        `Contrato "${created.title}" registrado (${created.contractCode ?? 'sin código'}).${
          created.hasDocument ? ' PDF guardado en Supabase Storage.' : ''
        }`,
      );
      setCreateOpen(false);
      setEmployeeId('');
      setContractCode('');
      setTitle('');
      setJobTitle('');
      setCostCenter('');
      setSalaryCop('');
      setEndsAt('');
      setSignedAt('');
      setNotes('');
      setNewPdfFile(null);
      invalidateAll();
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo registrar el contrato.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof apiClient.updateContract>[1];
    }) => apiClient.updateContract(id, payload),
    onSuccess: () => {
      setErrorMsg(null);
      setFeedback('Contrato actualizado correctamente.');
      setEditingId(null);
      invalidateAll();
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar el contrato.');
    },
  });

  const renewMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof apiClient.renewContract>[1];
    }) => apiClient.renewContract(id, payload),
    onSuccess: () => {
      setErrorMsg(null);
      setFeedback('Prórroga / renovación registrada correctamente.');
      setRenewingId(null);
      invalidateAll();
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo renovar el contrato.');
    },
  });

  const terminateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof apiClient.terminateContract>[1];
    }) => apiClient.terminateContract(id, payload),
    onSuccess: () => {
      setErrorMsg(null);
      setFeedback('Contrato marcado como terminado.');
      setTerminatingId(null);
      invalidateAll();
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo terminar el contrato.');
    },
  });

  const handleUploadPdf = async (contractId: string, file: File | null) => {
    if (!file) return;
    if (file.size > SUPABASE_FREE_MAX_FILE_SIZE_BYTES) {
      setErrorMsg(
        `El archivo "${file.name}" supera el límite de ${SUPABASE_FREE_MAX_FILE_SIZE_LABEL} para Supabase Storage (Free Tier).`,
      );
      return;
    }
    setUploadingContractId(contractId);
    setErrorMsg(null);
    try {
      const updated = await apiClient.uploadContractDocument(contractId, file);
      setFeedback(`PDF "${updated.fileName}" cargado en Supabase Storage (alliance).`);
      invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo subir el PDF del contrato.');
    } finally {
      setUploadingContractId(null);
    }
  };

  const openDocumentPreview = async (item: ContractItem) => {
    setPreviewState({
      open: true,
      fileName: item.fileName ?? `${item.contractCode ?? 'contrato'}.pdf`,
      mimeType: item.mimeType ?? 'application/pdf',
      objectUrl: null,
      loading: true,
      error: null,
    });
    try {
      const res = await apiClient.fetchProtectedBlob(`/contracts/${item.id}/document/content`);
      setPreviewState({
        open: true,
        fileName: item.fileName ?? `${item.contractCode ?? 'contrato'}.pdf`,
        mimeType: res.contentType || item.mimeType || 'application/pdf',
        objectUrl: res.objectUrl,
        loading: false,
        error: null,
      });
    } catch (err) {
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo cargar el PDF del contrato.',
      }));
    }
  };

  const downloadContractPdf = async (item: ContractItem) => {
    try {
      const res = await apiClient.fetchProtectedBlob(
        `/contracts/${item.id}/document/content?download=1`,
      );
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = item.fileName ?? `${item.contractCode ?? 'contrato'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo descargar el contrato.');
    }
  };

  const kpis = contractsData?.kpis ?? {
    totalContracts: 0,
    activeCount: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    terminatedCount: 0,
    indefiniteCount: 0,
    fixedTermCount: 0,
    withDocumentCount: 0,
    employeesWithoutContractCount: 0,
    legacyExpirationContractsCount: 0,
  };

  const recentCutoffDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const filteredContracts = useMemo(() => {
    const rows = contractsData?.items ?? [];
    const q = searchTerm.trim().toLowerCase();

    const filtered = rows.filter((item) => {
      if (quickMode === 'WITHOUT_CONTRACT') return false;
      if (quickMode === 'ACTIVE' && item.effectiveStatus !== 'ACTIVE' && item.effectiveStatus !== 'RENEWED') {
        return false;
      }
      if (quickMode === 'EXPIRING_SOON' && item.effectiveStatus !== 'EXPIRING_SOON') return false;
      if (quickMode === 'EXPIRED' && item.effectiveStatus !== 'EXPIRED') return false;
      if (quickMode === 'INDEFINITE' && item.contractType !== 'INDEFINITE') return false;
      if (quickMode === 'FIXED_TERM' && item.contractType !== 'FIXED_TERM') return false;
      if (quickMode === 'WITHOUT_PDF' && item.hasDocument) return false;
      if (quickMode === 'RECENT_30D' && item.startsAt < recentCutoffDate) return false;

      if (contractTypeFilter !== 'ALL' && item.contractType !== contractTypeFilter) return false;
      if (statusFilter !== 'ALL' && item.effectiveStatus !== statusFilter) return false;
      if (areaFilter !== 'ALL') {
        const area = item.operationalArea ?? item.employee?.operationalArea;
        if (area !== areaFilter) return false;
      }

      if (dateFrom || dateTo) {
        const matchesDate =
          dateField === 'startsAt'
            ? dateInRange(item.startsAt, dateFrom || undefined, dateTo || undefined)
            : dateField === 'endsAt'
              ? dateInRange(item.endsAt, dateFrom || undefined, dateTo || undefined)
              : dateField === 'signedAt'
                ? dateInRange(item.signedAt, dateFrom || undefined, dateTo || undefined)
                : dateInRange(item.startsAt, dateFrom || undefined, dateTo || undefined) ||
                  dateInRange(item.endsAt, dateFrom || undefined, dateTo || undefined) ||
                  dateInRange(item.signedAt, dateFrom || undefined, dateTo || undefined);
        if (!matchesDate) return false;
      }

      if (q) {
        const haystacks = [
          item.employee?.fullName,
          item.employee?.nationalId,
          item.employee?.personalEmail,
          item.employee?.corporateEmail,
          item.contractCode,
          item.title,
          item.contractTypeLabel,
          item.effectiveStatusLabel,
          item.jobTitle ?? item.employee?.jobTitle,
          item.costCenter ?? item.employee?.costCenter,
          item.operationalArea ?? item.employee?.operationalArea,
          item.workModality,
          item.fileName,
          item.notes,
        ];
        if (!haystacks.some((v) => v?.toLowerCase().includes(q))) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'startsAt_asc':
          return a.startsAt.localeCompare(b.startsAt);
        case 'endsAt_asc':
          return (a.endsAt ?? '9999-12-31').localeCompare(b.endsAt ?? '9999-12-31');
        case 'endsAt_desc':
          return (b.endsAt ?? '').localeCompare(a.endsAt ?? '');
        case 'name_asc':
          return (a.employee?.fullName ?? '').localeCompare(b.employee?.fullName ?? '', 'es');
        case 'updated_desc':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'startsAt_desc':
        default:
          return b.startsAt.localeCompare(a.startsAt);
      }
    });
  }, [
    contractsData,
    searchTerm,
    quickMode,
    contractTypeFilter,
    statusFilter,
    areaFilter,
    dateField,
    dateFrom,
    dateTo,
    sortBy,
    recentCutoffDate,
  ]);

  const filteredEmployeesWithoutContract = useMemo(() => {
    const list = contractsData?.employeesWithoutContract ?? [];
    const q = searchTerm.trim().toLowerCase();

    return list.filter((emp) => {
      if (areaFilter !== 'ALL' && emp.operationalArea !== areaFilter) return false;
      if (dateFrom || dateTo) {
        const hireOnly = emp.hireDate ? String(emp.hireDate).slice(0, 10) : null;
        if (!dateInRange(hireOnly, dateFrom || undefined, dateTo || undefined)) return false;
      }
      if (!q) return true;
      return [
        emp.fullName,
        emp.nationalId,
        emp.personalEmail,
        emp.corporateEmail,
        emp.jobTitle,
        emp.costCenter,
        emp.operationalArea,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [contractsData, searchTerm, areaFilter, dateFrom, dateTo]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      quickMode !== 'ALL' ||
      contractTypeFilter !== 'ALL' ||
      statusFilter !== 'ALL' ||
      areaFilter !== 'ALL' ||
      dateFrom ||
      dateTo,
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setQuickMode('ALL');
    setContractTypeFilter('ALL');
    setStatusFilter('ALL');
    setAreaFilter('ALL');
    setDateField('any');
    setDateFrom('');
    setDateTo('');
  };

  const exportCsv = () => {
    const headers = [
      'Codigo',
      'Colaborador',
      'Cedula',
      'Correo',
      'Area',
      'Cargo',
      'Centro de Costos',
      'Tipo de Contrato',
      'Modalidad',
      'Estado',
      'Fecha Inicio',
      'Fecha Fin',
      'Fecha Firma',
      'Salario COP',
      'Archivo PDF',
      'Notas',
    ];
    const escapeCell = (val: string | number | null | undefined) => {
      const s = val === null || val === undefined ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csvRows = [
      headers.map(escapeCell).join(','),
      ...filteredContracts.map((c) =>
        [
          c.contractCode,
          c.employee?.fullName,
          c.employee?.nationalId,
          c.employee?.corporateEmail ?? c.employee?.personalEmail,
          c.operationalArea ?? c.employee?.operationalArea,
          c.jobTitle ?? c.employee?.jobTitle,
          c.costCenter ?? c.employee?.costCenter,
          c.contractTypeLabel,
          c.workModality,
          c.effectiveStatusLabel,
          c.startsAt,
          c.endsAt ?? 'Indefinido',
          c.signedAt ?? '',
          c.salaryCop ?? '',
          c.fileName ?? 'Sin adjunto',
          c.notes ?? '',
        ]
          .map(escapeCell)
          .join(','),
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contratos-alliance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Contratos Laborales · TH</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Repositorio centralizado de contratos con búsqueda por nombre, cédula, cargo, fechas y soporte PDF en Supabase Storage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filteredContracts.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV ({filteredContracts.length})
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreateOpen((prev) => !prev);
                setErrorMsg(null);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {createOpen ? 'Ocultar formulario' : 'Nuevo contrato'}
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total contratos', value: kpis.totalContracts, tone: '' },
            { label: 'Vigentes', value: kpis.activeCount, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Por vencer (≤ 30d)', value: kpis.expiringSoonCount, tone: 'text-amber-600 dark:text-amber-400' },
            { label: 'Vencidos', value: kpis.expiredCount, tone: 'text-rose-600 dark:text-rose-400' },
            { label: 'Con PDF adjunto', value: kpis.withDocumentCount, tone: '' },
            {
              label: 'Sin contrato asignado',
              value: kpis.employeesWithoutContractCount,
              tone: kpis.employeesWithoutContractCount > 0 ? 'text-sky-600 dark:text-sky-400' : '',
            },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{kpi.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${kpi.tone}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {feedback && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {feedback}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Formulario Nuevo Contrato */}
        {createOpen && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Registrar nuevo contrato laboral</CardTitle>
              <CardDescription>
                Si defines fecha de fin/vencimiento, se sincroniza automáticamente con Alertas de Vencimiento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!employeeId || !title.trim() || !startsAt) return;
                  createMutation.mutate();
                }}
                className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Colaborador *</Label>
                  <Select
                    value={employeeId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setEmployeeId(id);
                      const found = employees.find((emp) => emp.id === id);
                      if (found) prefillFromEmployee(found);
                    }}
                    required
                  >
                    <option value="">Selecciona un colaborador...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} · CC {emp.nationalId}
                        {emp.operationalArea ? ` (${emp.operationalArea})` : ''}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Tipo de contrato *</Label>
                  <Select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value as ContractType)}
                  >
                    {CONTRACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CONTRACT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Código contrato (opcional)</Label>
                  <Input
                    value={contractCode}
                    onChange={(e) => setContractCode(e.target.value)}
                    placeholder="Auto: CTR-2026-XXXX"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Título / Objeto del contrato *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Contrato Término Fijo — Especialista Customer"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Área operativa</Label>
                  <Select
                    value={operationalArea}
                    onChange={(e) => setOperationalArea(e.target.value as OperationalArea | '')}
                  >
                    <option value="">Sin especificar / Del colaborador</option>
                    {OPERATIONAL_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Estado inicial</Label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
                    {CONTRACT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CONTRACT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cargo</Label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Cargo contractual"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Centro de costos</Label>
                  <Input
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    placeholder="Ej: CC-CUST-101"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Modalidad</Label>
                  <Select value={workModality} onChange={(e) => setWorkModality(e.target.value)}>
                    {CONTRACT_MODALITY_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Salario mensual COP (opcional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={salaryCop}
                    onChange={(e) => setSalaryCop(e.target.value)}
                    placeholder="Ej: 3500000"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fecha inicio *</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">
                    {contractType === 'INDEFINITE'
                      ? 'Fecha fin (opcional · Indefinido)'
                      : 'Fecha fin / vencimiento'}
                  </Label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fecha de firma</Label>
                  <Input
                    type="date"
                    value={signedAt}
                    onChange={(e) => setSignedAt(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Preaviso alerta (días)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={alertDaysBefore}
                    onChange={(e) => setAlertDaysBefore(e.target.value)}
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">PDF o soporte firmado del contrato (máx. 4 MB)</Label>
                  <label className="flex h-9 items-center justify-between rounded-md border border-dashed border-zinc-300 px-3 text-xs text-zinc-600 cursor-pointer hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300">
                    <span className="truncate flex items-center gap-2">
                      <FileUp className="h-3.5 w-3.5 shrink-0" />
                      {newPdfFile ? newPdfFile.name : 'Seleccionar PDF o imagen del contrato (opcional)'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && f.size > SUPABASE_FREE_MAX_FILE_SIZE_BYTES) {
                          setErrorMsg(
                            `El archivo "${f.name}" supera el límite de ${SUPABASE_FREE_MAX_FILE_SIZE_LABEL}.`,
                          );
                          return;
                        }
                        setErrorMsg(null);
                        setNewPdfFile(f);
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notas / Observaciones</Label>
                  <Textarea
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Condiciones especiales, otrosí, período de prueba..."
                  />
                </div>

                <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>
                    <FilePlus2 className="h-3.5 w-3.5" />
                    {createMutation.isPending ? 'Guardando contrato...' : 'Guardar contrato'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Panel de Búsqueda Avanzada y Atajos */}
        <Card>
          <CardContent className="p-4 space-y-3.5">
            <div className="grid gap-3 lg:grid-cols-12">
              {/* Buscador texto libre */}
              <div className="relative lg:col-span-5">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre, cédula, código CTR, cargo, área, correo..."
                  className="pl-9 pr-8"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filtros de fecha */}
              <div className="grid grid-cols-3 gap-2 lg:col-span-4">
                <Select
                  value={dateField}
                  onChange={(e) => setDateField(e.target.value as DateFieldFilter)}
                  aria-label="Campo de fecha"
                >
                  <option value="any">Cualquier fecha</option>
                  <option value="startsAt">Inicio / Ingreso</option>
                  <option value="endsAt">Vencimiento / Fin</option>
                  <option value="signedAt">Fecha de firma</option>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="Fecha desde"
                  aria-label="Fecha desde"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Fecha hasta"
                  aria-label="Fecha hasta"
                />
              </div>

              {/* Selectores secundarios */}
              <div className="grid grid-cols-3 gap-2 lg:col-span-3">
                <Select
                  value={contractTypeFilter}
                  onChange={(e) => setContractTypeFilter(e.target.value as ContractType | 'ALL')}
                  aria-label="Tipo de contrato"
                >
                  <option value="ALL">Todos los tipos</option>
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CONTRACT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value as OperationalArea | 'ALL')}
                  aria-label="Área operativa"
                >
                  <option value="ALL">Todas las áreas</option>
                  {OPERATIONAL_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Ordenar por"
                >
                  <option value="startsAt_desc">Inicio reciente</option>
                  <option value="endsAt_asc">Vencimiento próximo</option>
                  <option value="name_asc">Nombre (A–Z)</option>
                  <option value="startsAt_asc">Inicio antiguo</option>
                  <option value="updated_desc">Última actualización</option>
                </Select>
              </div>
            </div>

            {/* Atajos de 1 clic + Estado */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: `Todos (${kpis.totalContracts})` },
                    { id: 'ACTIVE', label: `Vigentes (${kpis.activeCount})` },
                    { id: 'EXPIRING_SOON', label: `Por vencer (${kpis.expiringSoonCount})` },
                    { id: 'EXPIRED', label: `Vencidos (${kpis.expiredCount})` },
                    { id: 'INDEFINITE', label: `Indefinidos (${kpis.indefiniteCount})` },
                    { id: 'FIXED_TERM', label: `Término Fijo (${kpis.fixedTermCount})` },
                    { id: 'RECENT_30D', label: 'Ingresos últimos 30d' },
                    { id: 'WITHOUT_PDF', label: 'Sin PDF' },
                    {
                      id: 'WITHOUT_CONTRACT',
                      label: `Sin contrato asignado (${kpis.employeesWithoutContractCount})`,
                    },
                  ] as Array<{ id: QuickViewMode; label: string }>
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setQuickMode(chip.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      quickMode === chip.id
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-300 dark:hover:bg-zinc-900'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ContractStatus | 'ALL')}
                  className="h-7 text-xs w-40"
                  aria-label="Filtrar por estado"
                >
                  <option value="ALL">Estado: Todos</option>
                  {CONTRACT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONTRACT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>

                {hasActiveFilters && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetAllFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {quickMode === 'WITHOUT_CONTRACT' ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Colaboradores sin contrato formal cargado ({filteredEmployeesWithoutContract.length})
              </CardTitle>
              <CardDescription>
                Haz clic en &quot;Asignar contrato&quot; para registrar su contrato laboral y adjuntar el PDF en Supabase Storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {filteredEmployeesWithoutContract.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No hay colaboradores pendientes sin contrato que coincidan con el filtro.
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {filteredEmployeesWithoutContract.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex flex-col gap-3 p-4 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{emp.fullName}</span>
                          <Badge variant="outline">CC {emp.nationalId}</Badge>
                          {emp.operationalArea && <Badge variant="default">{emp.operationalArea}</Badge>}
                          <Badge variant="outline">{emp.status}</Badge>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {emp.jobTitle ?? 'Cargo sin asignar'}
                          {emp.costCenter ? ` · ${emp.costCenter}` : ''} · Fecha ingreso:{' '}
                          <strong>{formatDateDisplay(emp.hireDate ? String(emp.hireDate).slice(0, 10) : null)}</strong>
                        </p>
                      </div>
                      <Button type="button" size="sm" onClick={() => prefillFromEmployee(emp)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Asignar contrato
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Cargando contratos laborales...
                  </div>
                ) : filteredContracts.length === 0 ? (
                  <div className="p-8 text-center space-y-2 text-xs text-zinc-500">
                    <p>
                      {kpis.totalContracts === 0
                        ? 'Aún no hay contratos formales registrados en esta tabla.'
                        : 'Ningún contrato coincide con los criterios de búsqueda actuales.'}
                    </p>
                    {kpis.employeesWithoutContractCount > 0 && (
                      <div className="flex justify-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setQuickMode('WITHOUT_CONTRACT')}
                        >
                          Ver colaboradores sin contrato ({kpis.employeesWithoutContractCount})
                        </Button>
                        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-3.5 w-3.5" />
                          Registrar contrato
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredContracts.map((item) => (
                      <div key={item.id} className="p-4 space-y-3 text-xs">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                              <span className="text-sm font-semibold">
                                {item.employee?.fullName ?? 'Colaborador'}
                              </span>
                              {item.employee?.nationalId && (
                                <Badge variant="outline">CC {item.employee.nationalId}</Badge>
                              )}
                              {item.contractCode && (
                                <Badge variant="outline">{item.contractCode}</Badge>
                              )}
                              <Badge variant={statusBadgeVariant(item.effectiveStatus)}>
                                {item.effectiveStatusLabel}
                              </Badge>
                              <Badge variant="default">{item.contractTypeLabel}</Badge>
                              {(item.operationalArea ?? item.employee?.operationalArea) && (
                                <Badge variant="outline">
                                  {item.operationalArea ?? item.employee?.operationalArea}
                                </Badge>
                              )}
                            </div>

                            <p className="font-medium text-zinc-700 dark:text-zinc-200">
                              {item.title}
                              {item.jobTitle ? ` · ${item.jobTitle}` : ''}
                              {item.costCenter ? ` · ${item.costCenter}` : ''}
                              {item.workModality ? ` · ${item.workModality}` : ''}
                              {item.salaryCop ? ` · ${formatCop(item.salaryCop)}` : ''}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Inicio: <strong>{formatDateDisplay(item.startsAt)}</strong>
                              </span>
                              <span>
                                Fin / Vencimiento:{' '}
                                <strong>
                                  {item.endsAt ? formatDateDisplay(item.endsAt) : 'Indefinido'}
                                </strong>
                              </span>
                              <span>Vigencia: {item.evaluation.daysLabel}</span>
                              {item.signedAt && (
                                <span>Firma: {formatDateDisplay(item.signedAt)}</span>
                              )}
                              {item.fileName && (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  PDF: {item.fileName}
                                </span>
                              )}
                            </div>

                            {item.notes && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Botones de acción */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {item.hasDocument && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openDocumentPreview(item)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Ver PDF
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void downloadContractPdf(item)}
                                  title="Descargar contrato PDF"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}

                            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900">
                              <FileUp className="h-3.5 w-3.5" />
                              {uploadingContractId === item.id
                                ? 'Subiendo...'
                                : item.hasDocument
                                  ? 'Reemplazar PDF'
                                  : 'Subir PDF'}
                              <input
                                type="file"
                                accept="application/pdf,image/*"
                                className="hidden"
                                onChange={(e) =>
                                  void handleUploadPdf(item.id, e.target.files?.[0] ?? null)
                                }
                              />
                            </label>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (editingId === item.id) {
                                  setEditingId(null);
                                  return;
                                }
                                setEditingId(item.id);
                                setRenewingId(null);
                                setTerminatingId(null);
                                setEditCode(item.contractCode ?? '');
                                setEditTitle(item.title);
                                setEditType(item.contractType);
                                setEditStatus(item.status);
                                setEditJobTitle(item.jobTitle ?? '');
                                setEditCostCenter(item.costCenter ?? '');
                                setEditModality(item.workModality ?? '');
                                setEditSalary(item.salaryCop ? String(item.salaryCop) : '');
                                setEditStartsAt(item.startsAt);
                                setEditEndsAt(item.endsAt ?? '');
                                setEditSignedAt(item.signedAt ?? '');
                                setEditNotes(item.notes ?? '');
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>

                            {item.effectiveStatus !== 'TERMINATED' && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (renewingId === item.id) {
                                      setRenewingId(null);
                                      return;
                                    }
                                    setRenewingId(item.id);
                                    setEditingId(null);
                                    setTerminatingId(null);
                                    setRenewType(item.contractType);
                                    setRenewEndsAt(item.endsAt ?? '');
                                    setRenewCode(item.contractCode ?? '');
                                    setRenewSalary(item.salaryCop ? String(item.salaryCop) : '');
                                    setRenewNotes('');
                                  }}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Prorrogar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setTerminatingId((prev) => (prev === item.id ? null : item.id));
                                    setEditingId(null);
                                    setRenewingId(null);
                                    setTerminateDate(new Date().toISOString().slice(0, 10));
                                    setTerminateNotes('');
                                  }}
                                >
                                  Terminar
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Edición en línea */}
                        {editingId === item.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateMutation.mutate({
                                id: item.id,
                                payload: {
                                  contractCode: editCode.trim() || undefined,
                                  title: editTitle.trim(),
                                  contractType: editType,
                                  status: editStatus,
                                  jobTitle: editJobTitle.trim() || undefined,
                                  costCenter: editCostCenter.trim() || undefined,
                                  workModality: editModality.trim() || undefined,
                                  salaryCop: editSalary.trim() ? Number(editSalary) : null,
                                  startsAt: editStartsAt,
                                  endsAt: editEndsAt.trim() ? editEndsAt.trim() : null,
                                  signedAt: editSignedAt.trim() ? editSignedAt.trim() : null,
                                  notes: editNotes.trim(),
                                },
                              });
                            }}
                            className="grid gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/70 p-3 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900/50"
                          >
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-[11px]">Título</Label>
                              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Código</Label>
                              <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Tipo</Label>
                              <Select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value as ContractType)}
                              >
                                {CONTRACT_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {CONTRACT_TYPE_LABELS[t]}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Cargo</Label>
                              <Input value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Centro de costos</Label>
                              <Input value={editCostCenter} onChange={(e) => setEditCostCenter(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Modalidad</Label>
                              <Input value={editModality} onChange={(e) => setEditModality(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Salario COP</Label>
                              <Input type="number" min={0} value={editSalary} onChange={(e) => setEditSalary(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Inicio</Label>
                              <Input type="date" value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} required />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Fin / Vencimiento</Label>
                              <Input type="date" value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Firma</Label>
                              <Input type="date" value={editSignedAt} onChange={(e) => setEditSignedAt(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Estado</Label>
                              <Select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as ContractStatus)}
                              >
                                {CONTRACT_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {CONTRACT_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="space-y-1 sm:col-span-4">
                              <Label className="text-[11px]">Notas</Label>
                              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-4">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                              <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                              </Button>
                            </div>
                          </form>
                        )}

                        {/* Prórroga / Renovación */}
                        {renewingId === item.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              renewMutation.mutate({
                                id: item.id,
                                payload: {
                                  newContractType: renewType,
                                  newEndsAt: renewEndsAt.trim() || undefined,
                                  contractCode: renewCode.trim() || undefined,
                                  salaryCop: renewSalary.trim() ? Number(renewSalary) : undefined,
                                  notes: renewNotes.trim() || undefined,
                                },
                              });
                            }}
                            className="grid gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/70 p-3 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900/50"
                          >
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nuevo tipo</Label>
                              <Select
                                value={renewType}
                                onChange={(e) => setRenewType(e.target.value as ContractType)}
                              >
                                {CONTRACT_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {CONTRACT_TYPE_LABELS[t]}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nueva fecha fin</Label>
                              <Input type="date" value={renewEndsAt} onChange={(e) => setRenewEndsAt(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nuevo código / Otrosí</Label>
                              <Input value={renewCode} onChange={(e) => setRenewCode(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Nuevo salario COP</Label>
                              <Input type="number" min={0} value={renewSalary} onChange={(e) => setRenewSalary(e.target.value)} />
                            </div>
                            <div className="space-y-1 sm:col-span-4">
                              <Label className="text-[11px]">Observación de prórroga</Label>
                              <Input
                                value={renewNotes}
                                onChange={(e) => setRenewNotes(e.target.value)}
                                placeholder="Ej: Otrosí #1 prorrogado por 12 meses"
                              />
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-4">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setRenewingId(null)}>
                                Cancelar
                              </Button>
                              <Button type="submit" size="sm" disabled={renewMutation.isPending}>
                                {renewMutation.isPending ? 'Aplicando...' : 'Confirmar prórroga'}
                              </Button>
                            </div>
                          </form>
                        )}

                        {/* Terminación */}
                        {terminatingId === item.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              terminateMutation.mutate({
                                id: item.id,
                                payload: {
                                  terminationDate: terminateDate || undefined,
                                  notes: terminateNotes.trim() || undefined,
                                },
                              });
                            }}
                            className="grid gap-2.5 rounded-md border border-rose-200 bg-rose-50/40 p-3 sm:grid-cols-3 dark:border-rose-900/50 dark:bg-rose-950/30"
                          >
                            <div className="space-y-1">
                              <Label className="text-[11px]">Fecha de terminación</Label>
                              <Input
                                type="date"
                                value={terminateDate}
                                onChange={(e) => setTerminateDate(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-[11px]">Motivo / Nota</Label>
                              <Input
                                value={terminateNotes}
                                onChange={(e) => setTerminateNotes(e.target.value)}
                                placeholder="Finalización acordada, renuncia, cumplimiento de plazo..."
                              />
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-3">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setTerminatingId(null)}>
                                Cancelar
                              </Button>
                              <Button type="submit" size="sm" variant="destructive" disabled={terminateMutation.isPending}>
                                Confirmar terminación
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Acceso rápido a colaboradores sin contrato cuando estamos en vista Todos */}
            {quickMode === 'ALL' && filteredEmployeesWithoutContract.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Colaboradores sin contrato formal cargado ({filteredEmployeesWithoutContract.length})
                  </CardTitle>
                  <CardDescription>
                    Personas ya registradas en el expediente digital a quienes puedes cargarles su contrato y PDF con un clic.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredEmployeesWithoutContract.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-zinc-200/80 p-3 text-xs dark:border-zinc-800/80"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{emp.fullName}</p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          CC {emp.nationalId}
                          {emp.operationalArea ? ` · ${emp.operationalArea}` : ''}
                          {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => prefillFromEmployee(emp)}
                      >
                        <Plus className="h-3 w-3" />
                        Crear
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Contratos registrados solo en Alertas de Vencimiento */}
            {quickMode === 'ALL' && (contractsData?.legacyExpirationContracts?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Contratos en Alertas de Vencimiento sin ficha completa (
                    {contractsData?.legacyExpirationContracts.length})
                  </CardTitle>
                  <CardDescription>
                    Registros creados en Alertas de Vencimiento de categoría Contrato. Puedes completar su ficha laboral desde aquí.
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-zinc-200/80 p-0 dark:divide-zinc-800/80">
                  {contractsData?.legacyExpirationContracts.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
                    >
                      <div>
                        <p className="font-medium">{exp.title}</p>
                        <p className="text-[11px] text-zinc-500">
                          {exp.employee?.fullName ?? 'Sin colaborador asociado'} · Vence:{' '}
                          {formatDateDisplay(exp.expiresAt)}
                        </p>
                      </div>
                      {exp.employee && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const found = employees.find((emp) => emp.id === exp.employee?.id);
                            if (found) prefillFromEmployee(found);
                            setTitle(exp.title);
                            setEndsAt(exp.expiresAt.slice(0, 10));
                            setContractCode(exp.referenceCode ?? '');
                          }}
                        >
                          Completar ficha
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
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
