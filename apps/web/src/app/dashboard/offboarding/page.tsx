'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  ShieldAlert,
  UserMinus,
  XCircle,
} from 'lucide-react';
import {
  CLEARANCE_DEPARTMENT_LABELS,
  ClearanceStatus,
  WorkflowUrgency,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient, ClearanceRecord, EmployeeRecord, WorkflowRecord } from '@/lib/api';
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

export default function OffboardingDashboardPage() {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [urgency, setUrgency] = useState<WorkflowUrgency>('STANDARD');
  const [terminationDate, setTerminationDate] = useState('2026-11-30');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient.getEmployees(),
  });

  const { data: offboardings = [], isLoading } = useQuery({
    queryKey: ['offboardings'],
    queryFn: () => apiClient.getOffboardings(),
  });

  const initiateMutation = useMutation({
    mutationFn: () =>
      apiClient.initiateOffboarding({
        employeeId,
        urgency,
        terminationDate,
        reason: reason || 'Retiro gestionado desde consola TH.',
        requestedByEmail: 'analista.th@alliance.com.co',
      }),
    onSuccess: () => {
      setFeedback(
        urgency === 'CRITICAL_IMMEDIATE'
          ? 'Offboarding CRÍTICO INMEDIATO disparado: ticket urgente enviado a IT y 4 Paz y Salvo creados.'
          : 'Offboarding STANDARD programado (corte 23:59) y 4 Paz y Salvo multi-área generados.',
      );
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['offboardings'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const clearanceMutation = useMutation({
    mutationFn: (vars: { clearanceId: string; status: ClearanceStatus; notes: string }) =>
      apiClient.updateClearance(vars.clearanceId, {
        status: vars.status,
        approverEmail: 'aprobador.area@alliance.com.co',
        notes: vars.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offboardings'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const eligibleEmployees = employees.filter(
    (e: EmployeeRecord) => e.status === 'ACTIVE' || e.status === 'PRE_ONBOARDING',
  );

  const renderStatusBadge = (status: ClearanceStatus) => {
    if (status === 'APPROVED') {
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Aprobado
        </Badge>
      );
    }
    if (status === 'REJECTED_WITH_DEBT') {
      return (
        <Badge variant="danger">
          <XCircle className="h-3.5 w-3.5" /> Rechazado con Pendiente
        </Badge>
      );
    }
    return (
      <Badge variant="warning">
        <Clock className="h-3.5 w-3.5" /> Pendiente
      </Badge>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Gestión de Offboarding y Paz y Salvo Digital
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control de bajas programadas (corte 23:59), retiros críticos inmediatos y semáforo multi-área.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Formulario disparo Offboarding */}
          <Card className="lg:col-span-4 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5 text-rose-600" />
                Iniciar Proceso de Retiro
              </CardTitle>
              <CardDescription>
                Genera automáticamente los 4 registros de Paz y Salvo (IT, Finanzas, Activo Fijo y Jefe Directo).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Colaborador</Label>
                <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Selecciona un colaborador...</option>
                  {eligibleEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.operationalArea ?? 'Sin Área'})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de Urgencia</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUrgency('STANDARD')}
                    className={`rounded-lg border p-2.5 text-left text-xs cursor-pointer ${
                      urgency === 'STANDARD'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span className="font-bold block">STANDARD</span>
                    <span className="text-slate-500">Corte Cron 23:59</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrgency('CRITICAL_IMMEDIATE')}
                    className={`rounded-lg border p-2.5 text-left text-xs cursor-pointer ${
                      urgency === 'CRITICAL_IMMEDIATE'
                        ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span className="font-bold block text-rose-700 dark:text-rose-400">
                      CRITICAL_IMMEDIATE
                    </span>
                    <span className="text-slate-500">Revocación instantánea</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Fecha de Retiro</Label>
                <Input
                  type="date"
                  value={terminationDate}
                  onChange={(e) => setTerminationDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Motivo / Observaciones</Label>
                <Textarea
                  placeholder="Ej: Renuncia voluntaria / Terminación unilateral..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {feedback && (
                <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {feedback}
                </div>
              )}

              <Button
                className="w-full"
                variant={urgency === 'CRITICAL_IMMEDIATE' ? 'destructive' : 'default'}
                disabled={!employeeId || initiateMutation.isPending}
                onClick={() => initiateMutation.mutate()}
              >
                {urgency === 'CRITICAL_IMMEDIATE' ? (
                  <>
                    <AlertOctagon className="h-4 w-4" />
                    Disparar Baja Crítica Inmediata
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4" />
                    Programar Baja y Crear Paz y Salvo
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Semáforo Multi-Área */}
          <div className="lg:col-span-8 space-y-5">
            {isLoading && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-slate-500">
                  Cargando procesos de Offboarding...
                </CardContent>
              </Card>
            )}

            {offboardings.map((wf: WorkflowRecord) => {
              const clearances = wf.clearances ?? [];
              const approvedCount = clearances.filter((c) => c.status === 'APPROVED').length;

              return (
                <Card key={wf.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">{wf.employee.fullName}</CardTitle>
                        <CardDescription>
                          {wf.employee.jobTitle ?? 'Colaborador'} · Área:{' '}
                          <strong>{wf.employee.operationalArea ?? 'N/A'}</strong> · Ticket:{' '}
                          <code>{wf.helpdeskTicketId ?? 'Programado 23:59'}</code>
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={wf.urgency === 'CRITICAL_IMMEDIATE' ? 'danger' : 'secondary'}>
                          {wf.urgency}
                        </Badge>
                        <Badge variant={approvedCount === 4 ? 'success' : 'warning'}>
                          Paz y Salvo: {approvedCount}/4
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {clearances.map((cl: ClearanceRecord) => (
                      <div
                        key={cl.id}
                        className="rounded-xl border border-slate-200 p-3.5 space-y-3 dark:border-slate-800"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold leading-snug">
                            {CLEARANCE_DEPARTMENT_LABELS[cl.department]}
                          </span>
                          {renderStatusBadge(cl.status)}
                        </div>
                        {cl.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{cl.notes}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            disabled={cl.status === 'APPROVED' || clearanceMutation.isPending}
                            onClick={() =>
                              clearanceMutation.mutate({
                                clearanceId: cl.id,
                                status: 'APPROVED',
                                notes: 'Paz y Salvo aprobado sin novedades.',
                              })
                            }
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={clearanceMutation.isPending}
                            onClick={() =>
                              clearanceMutation.mutate({
                                clearanceId: cl.id,
                                status: 'REJECTED_WITH_DEBT',
                                notes: 'Pendiente devolución de activo o saldo por legalizar.',
                              })
                            }
                          >
                            Reportar Pendiente
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
