'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  Ticket,
} from 'lucide-react';
import {
  OPERATIONAL_AREAS,
  OperationalArea,
  WORKFLOW_STEP_LABELS,
  WorkflowStep,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient, WorkflowRecord } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';

const TIMELINE_STEPS: WorkflowStep[] = [
  'TH_REVIEW',
  'DSI_LEADER_APPROVAL',
  'HELPDESK_TICKET_CREATED',
  'IT_PROVISIONING',
  'COMPLETED',
];

export default function ItDashboardPage() {
  const queryClient = useQueryClient();
  const [areaFilter, setAreaFilter] = useState<OperationalArea | 'ALL'>('ALL');
  const [itMessage, setItMessage] = useState<string | null>(null);
  const [itError, setItError] = useState<string | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', 'IT', areaFilter],
    queryFn: () =>
      apiClient.getWorkflows({
        operationalArea: areaFilter === 'ALL' ? undefined : areaFilter,
      }),
  });

  const triggerTicketMutation = useMutation({
    mutationFn: (workflowId: string) => apiClient.triggerHelpdeskTicket(workflowId),
    onSuccess: (res) => {
      setItError(null);
      setItMessage(
        `Ticket ${res.ticketId} ${res.isResend ? 'reenviado' : 'registrado'} en base de datos (${res.emailsSentCount}/${res.recipients.length} correo(s) enviado(s) a Mesa de Ayuda IT).`,
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => {
      setItError(err instanceof Error ? err.message : 'No se pudo generar el ticket Helpdesk.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (payload: {
      workflowId: string;
      ticketId: string;
      status: 'IN_PROGRESS' | 'RESOLVED';
      notes: string;
    }) =>
      apiClient.updateItWorkflowStatus(payload.workflowId, {
        status: payload.status,
        notes: payload.notes,
      }),
    onSuccess: (_data, vars) => {
      setItError(null);
      setItMessage(
        `Ticket ${vars.ticketId} actualizado a ${vars.status === 'RESOLVED' ? 'RESUELTO (Colaborador Activado)' : 'EN PROGRESO'}.`,
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
    onError: (err) => {
      setItError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del ticket.');
    },
  });

  const getStepIndex = (step: WorkflowStep) => TIMELINE_STEPS.indexOf(step);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Consola Operativa IT</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Mesa de Ayuda IT: registro de tickets en base de datos y alertas directas por correo electrónico.
            </p>
          </div>

          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-zinc-200/80 bg-white p-1 dark:border-zinc-800/80 dark:bg-[#0f0f12]">
            {(['ALL', ...OPERATIONAL_AREAS] as const).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setAreaFilter(area)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  areaFilter === area
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {area === 'ALL' ? 'Todas' : area}
              </button>
            ))}
          </div>
        </div>

        {itMessage && (
          <div className="rounded-md bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {itMessage}
          </div>
        )}
        {itError && (
          <div className="rounded-md bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            {itError}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-xs text-zinc-500">
              Cargando cola de aprovisionamiento IT...
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workflows.map((wf: WorkflowRecord) => {
              const stepIdx = getStepIndex(wf.currentStep);
              const items = wf.provisioningPayload?.items ?? [];

              return (
                <Card key={wf.id}>
                  <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{wf.employee.fullName}</CardTitle>
                          <Badge variant="outline">{wf.employee.operationalArea ?? 'Sin Área'}</Badge>
                          <Badge variant={wf.flowType === 'OFFBOARDING' ? 'danger' : 'secondary'}>
                            {wf.flowType}
                          </Badge>
                          {wf.isOutOfSla && <Badge variant="danger">Fuera SLA</Badge>}
                        </div>
                        <CardDescription>
                          {wf.employee.jobTitle ?? 'Cargo por asignar'} ·{' '}
                          {wf.employee.corporateEmail ?? wf.employee.personalEmail}
                        </CardDescription>
                      </div>

                      {wf.helpdeskTicketId ? (
                        <Badge variant="success">
                          <Ticket className="h-3 w-3" />
                          {wf.helpdeskTicketId} ({wf.helpdeskTicketStatus ?? 'OPEN'})
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <Clock className="h-3 w-3" />
                          Sin Ticket
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Línea de tiempo minimalista */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                      {TIMELINE_STEPS.map((st, idx) => {
                        const completed = stepIdx >= idx && stepIdx !== -1;
                        return (
                          <div key={st} className="space-y-1.5">
                            <div
                              className={`h-1 w-full rounded-full ${
                                completed
                                  ? 'bg-emerald-600 dark:bg-emerald-400'
                                  : 'bg-zinc-200 dark:bg-zinc-800'
                              }`}
                            />
                            <span
                              className={`block truncate text-[11px] ${
                                completed
                                  ? 'font-medium text-zinc-900 dark:text-zinc-100'
                                  : 'text-zinc-400 dark:text-zinc-500'
                              }`}
                            >
                              {WORKFLOW_STEP_LABELS[st]}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {items.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-zinc-400 mr-1">Ítems:</span>
                        {items.map((item) => (
                          <Badge key={item} variant="secondary">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {wf.currentStep !== 'CANDIDATE_PENDING' &&
                      wf.currentStep !== 'CANCELLED_NO_SHOW' &&
                      wf.currentStep !== 'DSI_LEADER_APPROVAL' &&
                      !(wf.flowType === 'ONBOARDING' && wf.currentStep === 'TH_REVIEW') && (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80">
                          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <Mail className="h-3.5 w-3.5" />
                            Disparador Mesa de Ayuda IT (BD + Correo)
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {wf.currentStep !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={triggerTicketMutation.isPending}
                                onClick={() => triggerTicketMutation.mutate(wf.id)}
                              >
                                <Ticket className="h-3.5 w-3.5" />
                                {wf.helpdeskTicketId
                                  ? 'Reenviar correo IT'
                                  : 'Generar Ticket + Correo IT'}
                              </Button>
                            )}
                            {wf.helpdeskTicketId && wf.currentStep !== 'COMPLETED' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={statusMutation.isPending}
                                  onClick={() =>
                                    statusMutation.mutate({
                                      workflowId: wf.id,
                                      ticketId: wf.helpdeskTicketId!,
                                      status: 'IN_PROGRESS',
                                      notes:
                                        'Técnico IT asignado. Configurando accesos y hardware.',
                                    })
                                  }
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  En Progreso
                                </Button>
                                <Button
                                  size="sm"
                                  variant="success"
                                  disabled={statusMutation.isPending}
                                  onClick={() =>
                                    statusMutation.mutate({
                                      workflowId: wf.id,
                                      ticketId: wf.helpdeskTicketId!,
                                      status: 'RESOLVED',
                                      notes:
                                        'Aprovisionamiento completado al 100% por Mesa de Ayuda IT.',
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Resolver / Activar
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
