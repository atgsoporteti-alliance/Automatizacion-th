'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Ticket,
  UserMinus,
  XCircle,
} from 'lucide-react';
import {
  CLEARANCE_DEPARTMENT_LABELS,
  ClearanceDepartment,
  ClearanceStatus,
  WorkflowUrgency,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient, ClearanceRecord, EmployeeRecord, WorkflowRecord } from '@/lib/api';
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

export default function OffboardingDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [urgency, setUrgency] = useState<WorkflowUrgency>('STANDARD');
  const [terminationDate, setTerminationDate] = useState('2026-11-30');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const canInitiateStandard =
    !user || ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const canInitiateCritical = !user || ['TH_ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const canTriggerHelpdesk =
    !user || ['TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN'].includes(user.role);

  const canSignClearance = (department: ClearanceDepartment): boolean => {
    if (!user || user.role === 'SUPER_ADMIN' || user.role === 'TH_ADMIN') return true;
    if (user.role === 'IT_SUPPORT') return department === 'IT_HARDWARE_ACCESS';
    if (user.role === 'AREA_LEADER') return department === 'DIRECT_MANAGER';
    if (user.role === 'CLEARANCE_APPROVER') {
      if (user.clearanceDepartment) return department === user.clearanceDepartment;
      return department === 'FINANCE' || department === 'FIXED_ASSETS';
    }
    return false;
  };

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
        urgency: canInitiateCritical ? urgency : 'STANDARD',
        terminationDate,
        reason: reason || 'Retiro gestionado desde consola TH.',
        requestedByEmail: user?.email ?? 'analista.th@alliance.com.co',
      }),
    onSuccess: () => {
      setFeedback(
        urgency === 'CRITICAL_IMMEDIATE' && canInitiateCritical
          ? 'Offboarding CRÍTICO INMEDIATO disparado: ticket urgente enviado a IT por BD/correo y 4 Paz y Salvo creados.'
          : 'Offboarding STANDARD programado (corte 23:59) y 4 Paz y Salvo multi-área generados.',
      );
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['offboardings'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo iniciar el offboarding.');
    },
  });

  const clearanceMutation = useMutation({
    mutationFn: (vars: { clearanceId: string; status: ClearanceStatus; notes: string }) =>
      apiClient.updateClearance(vars.clearanceId, {
        status: vars.status,
        approverEmail: user?.email ?? 'aprobador.area@alliance.com.co',
        notes: vars.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offboardings'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No cuentas con permiso para este departamento.');
    },
  });

  const triggerTicketMutation = useMutation({
    mutationFn: (workflowId: string) => apiClient.triggerHelpdeskTicket(workflowId),
    onSuccess: (res) => {
      setFeedback(
        `Ticket IT ${res.ticketId} ${res.isResend ? 'reenviado' : 'disparado'} (${res.emailsSentCount}/${res.recipients.length} correo(s) enviado(s) a Mesa de Ayuda IT).`,
      );
      queryClient.invalidateQueries({ queryKey: ['offboardings'] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : 'No se pudo disparar el ticket IT.');
    },
  });

  const eligibleEmployees = employees.filter(
    (e: EmployeeRecord) => e.status === 'ACTIVE' || e.status === 'PRE_ONBOARDING',
  );

  const renderStatusBadge = (status: ClearanceStatus) => {
    if (status === 'APPROVED') {
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" /> Aprobado
        </Badge>
      );
    }
    if (status === 'REJECTED_WITH_DEBT') {
      return (
        <Badge variant="danger">
          <XCircle className="h-3 w-3" /> Con pendiente
        </Badge>
      );
    }
    return (
      <Badge variant="warning">
        <Clock className="h-3 w-3" /> Pendiente
      </Badge>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Offboarding &amp; Paz y Salvo</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Bajas programadas (corte 23:59), retiros críticos inmediatos y semáforo multi-área.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Formulario disparo Offboarding (solo TH / Admin) */}
          {canInitiateStandard && (
            <Card className="lg:col-span-4 h-fit">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <UserMinus className="h-4 w-4 text-zinc-500" />
                  Iniciar retiro
                </CardTitle>
                <CardDescription>
                  Genera los 4 Paz y Salvo (IT, Finanzas, Activo Fijo y Jefe).
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
                  <Label>Urgencia</Label>
                  <div className={`grid gap-2 ${canInitiateCritical ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button
                      type="button"
                      onClick={() => setUrgency('STANDARD')}
                      className={`rounded-md border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                        urgency === 'STANDARD' || !canInitiateCritical
                          ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900'
                          : 'border-zinc-200/80 hover:border-zinc-400 dark:border-zinc-800/80'
                      }`}
                    >
                      <span className="font-semibold block">STANDARD</span>
                      <span className="text-[11px] text-zinc-500">Corte 23:59</span>
                    </button>
                    {canInitiateCritical && (
                      <button
                        type="button"
                        onClick={() => setUrgency('CRITICAL_IMMEDIATE')}
                        className={`rounded-md border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                          urgency === 'CRITICAL_IMMEDIATE'
                            ? 'border-rose-500 bg-rose-50/70 dark:border-rose-500 dark:bg-rose-950/40'
                            : 'border-zinc-200/80 hover:border-zinc-400 dark:border-zinc-800/80'
                        }`}
                      >
                        <span className="font-semibold block text-rose-700 dark:text-rose-400">
                          CRÍTICO
                        </span>
                        <span className="text-[11px] text-zinc-500">Inmediato (TH Admin)</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Fecha de retiro</Label>
                  <Input
                    type="date"
                    value={terminationDate}
                    onChange={(e) => setTerminationDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Motivo / Observaciones</Label>
                  <Textarea
                    placeholder="Ej: Renuncia voluntaria..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                {feedback && (
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {feedback}
                  </div>
                )}

                <Button
                  className="w-full"
                  variant={urgency === 'CRITICAL_IMMEDIATE' && canInitiateCritical ? 'destructive' : 'default'}
                  disabled={!employeeId || initiateMutation.isPending}
                  onClick={() => initiateMutation.mutate()}
                >
                  {urgency === 'CRITICAL_IMMEDIATE' && canInitiateCritical ? (
                    <>
                      <AlertOctagon className="h-4 w-4" />
                      Disparar baja crítica
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4" />
                      Programar baja
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Semáforo Multi-Área */}
          <div className={`${canInitiateStandard ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
            {!canInitiateStandard && feedback && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {feedback}
              </div>
            )}
            {isLoading && (
              <Card>
                <CardContent className="p-8 text-center text-xs text-zinc-500">
                  Cargando procesos de Offboarding...
                </CardContent>
              </Card>
            )}

            {offboardings.map((wf: WorkflowRecord) => {
              const clearances = wf.clearances ?? [];
              const approvedCount = clearances.filter((c) => c.status === 'APPROVED').length;

              return (
                <Card key={wf.id}>
                  <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{wf.employee.fullName}</CardTitle>
                        <CardDescription>
                          {wf.employee.jobTitle ?? 'Colaborador'} ·{' '}
                          {wf.employee.operationalArea ?? 'N/A'} · Ticket:{' '}
                          <code>{wf.helpdeskTicketId ?? 'Programado 23:59'}</code>
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canTriggerHelpdesk && wf.currentStep !== 'COMPLETED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={triggerTicketMutation.isPending}
                            onClick={() => triggerTicketMutation.mutate(wf.id)}
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            {wf.helpdeskTicketId ? 'Reenviar Ticket IT' : 'Disparar Ticket IT ahora'}
                          </Button>
                        )}
                        <Badge variant={wf.urgency === 'CRITICAL_IMMEDIATE' ? 'danger' : 'secondary'}>
                          {wf.urgency}
                        </Badge>
                        <Badge variant={approvedCount === 4 ? 'success' : 'warning'}>
                          {approvedCount}/4
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {clearances.map((cl: ClearanceRecord) => {
                      const canApproveDept = canSignClearance(cl.department);
                      return (
                      <div
                        key={cl.id}
                        className="rounded-md border border-zinc-200/80 p-3 space-y-2.5 dark:border-zinc-800/80"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium leading-snug">
                            {CLEARANCE_DEPARTMENT_LABELS[cl.department]}
                          </span>
                          {renderStatusBadge(cl.status)}
                        </div>
                        {cl.notes && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{cl.notes}</p>
                        )}
                        {canApproveDept ? (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
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
                              variant="ghost"
                              disabled={clearanceMutation.isPending}
                              onClick={() =>
                                clearanceMutation.mutate({
                                  clearanceId: cl.id,
                                  status: 'REJECTED_WITH_DEBT',
                                  notes: 'Pendiente devolución de activo o saldo por legalizar.',
                                })
                              }
                            >
                              Reportar pendiente
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-400">
                            Solo lectura (firma asignada a otro departamento/rol).
                          </p>
                        )}
                      </div>
                    );
                    })}
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
