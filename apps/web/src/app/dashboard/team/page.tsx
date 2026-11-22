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
            <h1 className="text-2xl font-semibold tracking-tight">Mi Equipo y Aprobación DSI</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vista filtrada por área operativa ({user?.operationalArea ?? 'ALL'}). Los datos
              sensibles de TH (EPS, pensión, cuentas bancarias) están ocultos por política RBAC.
            </p>
          </div>
          <Badge variant="purple">Área: {user?.operationalArea ?? 'ALL'}</Badge>
        </div>

        {feedback && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {/* Puerta obligatoria DSI_LEADER_APPROVAL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Aprobaciones Pendientes de Puerta DSI ({dsiPendingWorkflows.length})
            </CardTitle>
            <CardDescription>
              Solo el Líder de DSI o Super Administrador puede desbloquear estos ingresos hacia Helpdesk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dsiPendingWorkflows.length === 0 ? (
              <p className="text-xs text-slate-500">
                No hay ingresos pendientes en estado <code>DSI_LEADER_APPROVAL</code> para tu área.
              </p>
            ) : (
              dsiPendingWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3.5 dark:border-slate-800"
                >
                  <div>
                    <p className="text-sm font-semibold">{wf.employee.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {wf.employee.jobTitle} · Credencial: {wf.employee.preferredNameCredentials}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Badge variant="warning">{WORKFLOW_STEP_LABELS[wf.currentStep]}</Badge>
                      <Badge variant="purple">{wf.employee.operationalArea}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={approveDsiMutation.isPending}
                    onClick={() => approveDsiMutation.mutate(wf.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprobar Puerta DSI
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Colaboradores del área (sin datos sensibles de TH) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Colaboradores de tu Área ({employees.length})
            </CardTitle>
            <CardDescription>
              Información técnica y organizacional (Data Masking activo).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((emp: EmployeeRecord) => (
                <div
                  key={emp.id}
                  className="rounded-md border border-slate-200 p-3.5 text-xs space-y-1.5 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{emp.fullName}</span>
                    <Badge variant="secondary">{emp.status}</Badge>
                  </div>
                  <p className="text-slate-500">{emp.jobTitle ?? 'Por asignar'}</p>
                  <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {emp.corporateEmail ?? emp.preferredNameCredentials}
                  </p>
                  <div className="pt-1 flex gap-1.5">
                    <Badge variant="purple">{emp.operationalArea ?? 'Sin área'}</Badge>
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
