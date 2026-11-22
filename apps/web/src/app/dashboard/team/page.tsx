'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import { WORKFLOW_STEP_LABELS } from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient, EmployeeRecord, WorkflowRecord } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';

export default function TeamLeaderPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'team'],
    queryFn: () => apiClient.getEmployees(),
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', 'team'],
    queryFn: () => apiClient.getWorkflows({ flowType: 'ONBOARDING' }),
  });

  const approveDsiMutation = useMutation({
    mutationFn: (workflowId: string) =>
      apiClient.approveDsiWorkflow(workflowId, {
        approverEmail: user?.email ?? 'lider.dsi@alliance.com',
        notes: 'Puerta DSI_LEADER_APPROVAL aprobada desde Consola de Líder de Área.',
      }),
    onSuccess: () => {
      setFeedback('Aprobación Líder DSI completada. Ticket encolado a ServiceDesk Plus.');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const dsiPendingWorkflows = workflows.filter(
    (wf: WorkflowRecord) => wf.currentStep === 'DSI_LEADER_APPROVAL',
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Mi Equipo y Aprobación DSI</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Vista filtrada por área ({user?.operationalArea ?? 'ALL'}). Datos sensibles ocultos
              por RBAC.
            </p>
          </div>
          <Badge variant="outline">Área: {user?.operationalArea ?? 'ALL'}</Badge>
        </div>

        {feedback && (
          <div className="rounded-md bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-500" />
              Puerta DSI pendiente ({dsiPendingWorkflows.length})
            </CardTitle>
            <CardDescription>
              Desbloquea ingresos de DSI hacia Helpdesk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dsiPendingWorkflows.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No hay ingresos pendientes en estado <code>DSI_LEADER_APPROVAL</code>.
              </p>
            ) : (
              dsiPendingWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200/80 px-4 py-3 dark:border-zinc-800/80"
                >
                  <div>
                    <p className="text-sm font-medium">{wf.employee.fullName}</p>
                    <p className="text-xs text-zinc-500">
                      {wf.employee.jobTitle} · {wf.employee.preferredNameCredentials}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Badge variant="warning">{WORKFLOW_STEP_LABELS[wf.currentStep]}</Badge>
                      <Badge variant="outline">{wf.employee.operationalArea}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={approveDsiMutation.isPending}
                    onClick={() => approveDsiMutation.mutate(wf.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprobar Puerta DSI
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-500" />
              Colaboradores ({employees.length})
            </CardTitle>
            <CardDescription>Información técnica y organizacional (Data Masking activo).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((emp: EmployeeRecord) => (
                <div
                  key={emp.id}
                  className="rounded-md border border-zinc-200/80 p-3.5 text-xs space-y-1.5 dark:border-zinc-800/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{emp.fullName}</span>
                    <Badge variant="secondary">{emp.status}</Badge>
                  </div>
                  <p className="text-zinc-500">{emp.jobTitle ?? 'Por asignar'}</p>
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {emp.corporateEmail ?? emp.preferredNameCredentials}
                  </p>
                  <div className="pt-1">
                    <Badge variant="outline">{emp.operationalArea ?? 'Sin área'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
