'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
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
        `Webhook ServiceDesk Plus simulado para ticket ${vars.ticketId} → ${vars.status}`,
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
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
              Cola sincronizada con ManageEngine ServiceDesk Plus vía BullMQ y webhooks.
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

        {webhookMessage && (
          <div className="rounded-md bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {webhookMessage}
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

                    {wf.helpdeskTicketId && wf.currentStep !== 'COMPLETED' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80">
                        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Webhook className="h-3.5 w-3.5" />
                          Simular webhook ServiceDesk Plus
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
                            IN_PROGRESS
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
                            RESOLVED
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
