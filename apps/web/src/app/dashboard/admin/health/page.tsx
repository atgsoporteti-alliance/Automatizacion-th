'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  Info,
  Layers,
  Mail,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiClient, API_BASE } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function componentBadgeVariant(
  status: 'UP' | 'DEGRADED' | 'DOWN' | 'HEALTHY' | 'CRITICAL',
): 'success' | 'warning' | 'danger' {
  if (status === 'UP' || status === 'HEALTHY') return 'success';
  if (status === 'DEGRADED') return 'warning';
  return 'danger';
}

function componentStatusLabel(status: 'UP' | 'DEGRADED' | 'DOWN' | 'HEALTHY' | 'CRITICAL'): string {
  switch (status) {
    case 'UP':
      return 'Operativo';
    case 'HEALTHY':
      return 'Saludable';
    case 'DEGRADED':
      return 'Degradado';
    case 'DOWN':
      return 'Caído';
    case 'CRITICAL':
      return 'Crítico';
  }
}

export default function PlatformHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [clientRttMs, setClientRttMs] = useState<number | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['platform-health'],
    queryFn: async () => {
      const start = performance.now();
      const res = await apiClient.getPlatformHealth();
      setClientRttMs(Math.round(performance.now() - start));
      return res;
    },
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const overallVariant = data ? componentBadgeVariant(data.overallStatus) : 'warning';

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Salud de la Plataforma</h1>
              {data && (
                <Badge variant={overallVariant}>{componentStatusLabel(data.overallStatus)}</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Monitoreo en tiempo real de PostgreSQL, Supabase Storage, Correo/Relay, BullMQ/Redis, Helpdesk y Seguridad.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={autoRefresh ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh((prev) => !prev)}
            >
              <Activity className="h-3.5 w-3.5" />
              {autoRefresh ? 'Auto-refresco 30s: ON' : 'Auto-refresco: OFF'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Verificando...' : 'Comprobar ahora'}
            </Button>
          </div>
        </div>

        {/* Estado conexión API */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-md border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No se pudo consultar el diagnóstico del backend</p>
              <p className="mt-0.5">{error instanceof Error ? error.message : 'Error consultando /admin/health.'}</p>
            </div>
          </div>
        )}

        {isLoading && !data ? (
          <Card>
            <CardContent className="p-8 text-center text-xs text-zinc-500">
              Ejecutando sondas de conectividad contra Base de Datos, Storage, Correo, Redis y Helpdesk...
            </CardContent>
          </Card>
        ) : data ? (
          <>
            {/* Resumen superior */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Estado global
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {data.overallStatus === 'HEALTHY' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : data.overallStatus === 'DEGRADED' ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    )}
                    <span className="text-lg font-semibold">
                      {componentStatusLabel(data.overallStatus)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Último check: {new Date(data.checkedAt).toLocaleTimeString('es-CO')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Latencia API / PostgreSQL
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {data.database.latencyMs} <span className="text-xs font-normal text-zinc-400">ms DB</span>
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    RTT navegador → API: {clientRttMs ?? '—'} ms
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Uptime proceso API
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatUptime(data.runtime.uptimeSeconds)}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400 truncate">
                    {data.runtime.isRender ? 'Render Cloud' : 'Local / Host'} · {data.runtime.nodeEnv} ({data.runtime.nodeVersion})
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Memoria API (RSS / Heap)
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {data.runtime.memoryRssMb} <span className="text-xs font-normal text-zinc-400">MB</span>
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400 truncate">
                    Heap en uso: {data.runtime.memoryHeapUsedMb} MB · Endpoint: {API_BASE.replace(/^https?:\/\//, '')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Alertas activas y recomendaciones */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-zinc-500" />
                  Diagnóstico y Alertas ({data.alerts.length})
                </CardTitle>
                <CardDescription>
                  Hallazgos automáticos sobre configuración, conectividad y preparación operativa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.alerts.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Todos los subsistemas críticos y de infraestructura reportan estado operativo.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.alerts.map((alert, idx) => (
                      <div
                        key={`${alert.component}-${idx}`}
                        className="flex flex-col gap-1 rounded-md border border-zinc-200/80 p-3 text-xs dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex items-start gap-2.5">
                          {alert.severity === 'critical' ? (
                            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                          ) : alert.severity === 'warning' ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                          ) : (
                            <Info className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">
                              {alert.title}
                            </p>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">{alert.detail}</p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            alert.severity === 'critical'
                              ? 'danger'
                              : alert.severity === 'warning'
                                ? 'warning'
                                : 'outline'
                          }
                          className="self-start"
                        >
                          {alert.component.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tarjetas de subsistemas */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* 1. Database */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-zinc-500" />
                      PostgreSQL · Supabase
                    </CardTitle>
                    <Badge variant={componentBadgeVariant(data.database.status)}>
                      {componentStatusLabel(data.database.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Host</span>
                    <span className="font-mono text-[11px] truncate max-w-[200px]">
                      {data.database.host}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Latencia consulta</span>
                    <span className="font-medium tabular-nums">{data.database.latencyMs} ms</span>
                  </div>
                  {data.database.error && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 pt-1">
                      {data.database.error}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 2. Storage */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-zinc-500" />
                      Storage S3 · Supabase
                    </CardTitle>
                    <Badge variant={componentBadgeVariant(data.storage.status)}>
                      {componentStatusLabel(data.storage.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Endpoint</span>
                    <span className="font-mono text-[11px] truncate max-w-[200px]">
                      {data.storage.endpointHost}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Bucket principal</span>
                    <span className="font-mono text-[11px]">{data.storage.bucket}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Fallback buckets</span>
                    <span className="font-mono text-[11px]">
                      {data.storage.legacyBuckets.join(', ') || 'ninguno'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Latencia HeadBucket</span>
                    <span className="font-medium tabular-nums">{data.storage.latencyMs} ms</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                    {data.storage.message}
                  </p>
                </CardContent>
              </Card>

              {/* 3. Correo / Relay */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-zinc-500" />
                      Correo & HTTPS Relay
                    </CardTitle>
                    <Badge variant={componentBadgeVariant(data.mail.status)}>
                      {componentStatusLabel(data.mail.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">SMTP</span>
                    <span className="font-mono text-[11px]">
                      {data.mail.smtpConfigured
                        ? `${data.mail.smtpHost}:${data.mail.smtpPort}`
                        : 'No configurado'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">HTTPS Relay</span>
                    <span className="font-mono text-[11px] truncate max-w-[190px]">
                      {data.mail.relayConfigured ? data.mail.relayHost ?? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Estrategia</span>
                    <span className="text-right font-medium">{data.mail.preferRelayFirst ? 'Relay primero' : 'SMTP primero'}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                    {data.mail.modeLabel}
                  </p>
                </CardContent>
              </Card>

              {/* 4. BullMQ / Redis */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-zinc-500" />
                      Cola BullMQ · Redis
                    </CardTitle>
                    <Badge variant={componentBadgeVariant(data.queue.status)}>
                      {data.queue.connected ? 'Conectado' : 'Fallback Directo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Cola</span>
                    <span className="font-mono text-[11px]">{data.queue.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Redis host</span>
                    <span className="font-mono text-[11px]">
                      {data.queue.redisHost}:{data.queue.redisPort}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Jobs (W / A / F)</span>
                    <span className="font-mono text-[11px]">
                      {data.queue.counts
                        ? `${data.queue.counts.waiting ?? 0} / ${data.queue.counts.active ?? 0} / ${data.queue.counts.failed ?? 0}`
                        : 'Modo síncrono'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                    {data.queue.message}
                  </p>
                </CardContent>
              </Card>

              {/* 5. Helpdesk */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-zinc-500" />
                      Helpdesk & Mesa IT
                    </CardTitle>
                    <Badge variant={componentBadgeVariant(data.helpdesk.status)}>
                      {componentStatusLabel(data.helpdesk.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Canal activo</span>
                    <span className="font-mono text-[11px]">{data.helpdesk.mode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">API ServiceDesk Plus</span>
                    <span className="font-medium">
                      {data.helpdesk.externalApiEnabled
                        ? data.helpdesk.serviceDeskUrlConfigured
                          ? 'Habilitada'
                          : 'Falta URL/Key'
                        : 'Desactivada (BD + Correo)'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Destinatarios IT</span>
                    <span className="font-medium">{data.helpdesk.itRecipientsCount}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 truncate" title={data.helpdesk.itRecipients.join(', ')}>
                    {data.helpdesk.itRecipients.length > 0
                      ? data.helpdesk.itRecipients.join(', ')
                      : data.helpdesk.message}
                  </p>
                </CardContent>
              </Card>

              {/* 6. Auth & Seguridad */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-zinc-500" />
                      Auth & Seguridad
                    </CardTitle>
                    <Badge
                      variant={
                        data.runtime.nodeEnv === 'production' && data.security.devAuthBypassEnabled
                          ? 'warning'
                          : data.security.supabaseAuthConfigured
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {data.security.supabaseAuthConfigured ? 'Supabase Auth OK' : 'Parcial'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Proyecto Supabase</span>
                    <span className="font-mono text-[11px] truncate max-w-[180px]">
                      {data.security.supabaseHost ?? 'No configurado'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Admin Auth Key</span>
                    <span className="font-medium">
                      {data.security.supabaseAdminConfigured ? 'Configurada' : 'Pendiente'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Modo rápido UAT</span>
                    <span className="font-medium">
                      {data.security.devAuthBypassEnabled ? 'Activo' : 'Desactivado (Prod)'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Dominio corporativo</span>
                    <span className="font-mono text-[11px]">@{data.security.corporateEmailDomain}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Volumetría de tablas en Supabase */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-zinc-500" />
                  Volumetría de Datos en Supabase PostgreSQL
                </CardTitle>
                <CardDescription>
                  Conteo real de registros por módulo operativo de Alliance HCM.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9">
                {[
                  { label: 'Colaboradores', value: data.metrics.employees },
                  { label: 'Candidatos', value: data.metrics.candidateProcesses },
                  { label: 'Workflows', value: data.metrics.workflows },
                  { label: 'Contratos', value: data.metrics.activeContracts },
                  { label: 'Vencimientos', value: data.metrics.expirations },
                  { label: 'Novedades / HE', value: data.metrics.timeRequests },
                  { label: 'Documentos S3', value: data.metrics.documents },
                  { label: 'Usuarios RBAC', value: data.metrics.users },
                  { label: 'Logs Auditoría', value: data.metrics.auditLogs },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-800/80"
                  >
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{stat.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-zinc-400" />
                      {stat.value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
