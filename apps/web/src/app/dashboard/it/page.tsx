'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Cpu,
  RefreshCw,
  Ticket,
  Webhook,
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
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', 'IT', areaFilter],
    queryFn: () =>
      apiClient.getWorkflows({
        operationalArea: areaFilter === 'ALL' ? undefined : areaFilter,
      }),
  });

  const webhookMutation = useMutation({
    mutationFn: (payload: {
      ticketId: string;
      status: 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
      notes: string;
    }) =>
      apiClient.simulateHelpdeskWebhook({
        ...payload,
        technicianEmail: 'ingeniero.soporte@alliance.com.co',
      }),
    onSuccess: (_data, vars) => {
      setWebhookMessage(
        `Webhook ServiceDesk Plus simulado para ticket ${vars.ticketId} → Estado: ${vars.status}`,
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
    },
  });

  const getStepIndex = (step: WorkflowStep) => TIMELINE_STEPS.indexOf(step);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Consola Operativa IT / Helpdesk</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cola sincronizada con ManageEngine ServiceDesk Plus vía BullMQ y Webhooks bidireccionales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', ...OPERATIONAL_AREAS] as const).map((area) => (
              <Button
                key={area}
                size="sm"
                variant={areaFilter === area ? 'default' : 'outline'}
                onClick={() => setAreaFilter(area)}
              >
                {area === 'ALL' ? 'Todas las Áreas' : area}
              </Button>
            ))}
          </div>
        </div>

        {webhookMessage && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
            {webhookMessage}
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Cargando cola de aprovisionamiento IT...
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5">
            {workflows.map((wf: WorkflowRecord) => {
              const stepIdx = getStepIndex(wf.currentStep);
              const items = wf.provisioningPayload?.items ?? [];

              return (
                <Card key={wf.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-lg">{wf.employee.fullName}</CardTitle>
                          <Badge variant="purple">{wf.employee.operationalArea ?? 'Sin Área'}</Badge>
                          <Badge variant={wf.flowType === 'OFFBOARDING' ? 'danger' : 'default'}>
                            {wf.flowType}
                          </Badge>
                          {wf.isOutOfSla && <Badge variant="danger">Fuera de SLA</Badge>}
                        </div>
                        <CardDescription>
                          {wf.employee.jobTitle ?? 'Cargo por asignar'} ·{' '}
                          {wf.employee.corporateEmail ?? wf.employee.personalEmail}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {wf.helpdeskTicketId ? (
                          <Badge variant="success">
                            <Ticket className="h-3.5 w-3.5" />
                            {wf.helpdeskTicketId} ({wf.helpdeskTicketStatus ?? 'OPEN'})
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <Clock className="h-3.5 w-3.5" />
                            Sin Ticket Helpdesk
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Línea de tiempo visual */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {TIMELINE_STEPS.map((st, idx) => {
                        const completed = stepIdx >= idx && stepIdx !== -1;
                        return (
                          <div
                            key={st}
                            className={`rounded-lg border p-2.5 text-xs ${
                              completed
                                ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-semibold">
                              {completed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <Cpu className="h-3.5 w-3.5 opacity-50 shrink-0" />
                              )}
                              <span className="truncate">{WORKFLOW_STEP_LABELS[st]}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Checklist de ítems del Motor de Reglas */}
                    {items.length > 0 && (
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                          Ítems de Aprovisionamiento (Regla {wf.employee.operationalArea})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {items.map((item) => (
                            <Badge key={item} variant="secondary">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Simulador local de Webhook ServiceDesk Plus */}
                    {wf.helpdeskTicketId && wf.currentStep !== 'COMPLETED' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Webhook className="h-3.5 w-3.5 text-blue-600" />
                          Simular Webhook entrante desde ManageEngine ServiceDesk Plus:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={webhookMutation.isPending}
                            onClick={() =>
                              webhookMutation.mutate({
                                ticketId: wf.helpdeskTicketId!,
                                status: 'IN_PROGRESS',
                                notes: 'Técnico IT asignado. Configurando accesos y hardware.',
                              })
                            }
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Marcar IN_PROGRESS
                          </Button>
                          <Button
                            size="sm"
                            variant="success"
                            disabled={webhookMutation.isPending}
                            onClick={() =>
                              webhookMutation.mutate({
                                ticketId: wf.helpdeskTicketId!,
                                status: 'RESOLVED',
                                notes: 'Aprovisionamiento completado al 100% desde ServiceDesk Plus.',
                              })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Simular Ticket RESOLVED (Completar)
                          </Button>
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
