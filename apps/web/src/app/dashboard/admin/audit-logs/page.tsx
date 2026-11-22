'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSearch, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiClient, AuditLogRecord } from '@/lib/api';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui/primitives';

export default function AuditLogsPage() {
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['audit-logs', actorId, action],
    queryFn: () =>
      apiClient.getAuditLogs({
        actorId: actorId || undefined,
        action: action || undefined,
      }),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bitácora de Auditoría</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Registro inmutable de mutaciones (<code>POST</code>, <code>PATCH</code>,{' '}
            <code>DELETE</code>). Acceso para <strong>SUPER_ADMIN</strong> y{' '}
            <strong>TH_ADMIN</strong>.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Actor ID / Correo</Label>
              <Input
                placeholder="Ej: 11111111-... o email"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Acción</Label>
              <Input
                placeholder="Ej: TH_APPROVED, ADMIN_UPDATE..."
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-200 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error instanceof Error ? error.message : 'Acceso restringido.'}</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-zinc-500" />
              Eventos recientes ({logs.length})
            </CardTitle>
            <CardDescription>Últimos 100 registros ordenados cronológicamente.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-xs text-zinc-500">Cargando bitácora...</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 text-[11px] font-medium text-zinc-500 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 pr-4">Fecha</th>
                    <th className="py-2.5 pr-4">Actor</th>
                    <th className="py-2.5 pr-4">Acción</th>
                    <th className="py-2.5 pr-4">Entidad</th>
                    <th className="py-2.5">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {logs.map((log: AuditLogRecord) => (
                    <tr key={log.id}>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-500">
                        {new Date(log.createdAt).toLocaleString('es-CO')}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]">{log.actorId}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="secondary">{log.action}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium">{log.entity}</span>
                        <span className="block font-mono text-[10px] text-zinc-400">
                          {log.entityId}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400 max-w-xs truncate">
                        {JSON.stringify(log.newValues ?? log.oldValues ?? {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
