import Link from 'next/link';
import {
  ArrowUpRight,
  ClipboardCheck,
  Cpu,
  Link2,
  ShieldCheck,
  UserMinus,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';

const MODULES = [
  {
    href: '/dashboard/th',
    title: 'Consola de Validación TH',
    subtitle: 'Expediente Digital · 24 campos',
    description:
      'Revisión de candidatos, asignación de campaña (Customer, Ventas, DSI), puerta obligatoria de Líder DSI y cancelación No-Show.',
    badge: 'Talento Humano',
    icon: ClipboardCheck,
  },
  {
    href: '/dashboard/it',
    title: 'Consola Operativa IT / Helpdesk',
    subtitle: 'ManageEngine ServiceDesk Plus',
    description:
      'Cola de aprovisionamiento filtrable por área operativa, trazabilidad de tickets BullMQ y simulador de webhooks.',
    badge: 'IT & Helpdesk',
    icon: Cpu,
  },
  {
    href: '/dashboard/offboarding',
    title: 'Offboarding y Paz y Salvo Digital',
    subtitle: 'Retiros Standard (23:59) y Críticos',
    description:
      'Disparo de bajas con revocación de accesos y semáforo multi-área para IT, Finanzas, Activo Fijo y Jefe Directo.',
    badge: 'Offboarding',
    icon: UserMinus,
  },
  {
    href: '/dashboard/th?invite=1',
    title: 'Generar Link de Pre-Ingreso',
    subtitle: 'Magic Link JWT Seguro · Rol Candidato',
    description:
      'Emite un enlace único temporal (72h) para que el candidato diligencie sus 24 campos y firme Ley 1581 sin acceder al HCM interno.',
    badge: 'Invitación Segura',
    icon: Link2,
  },
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Encabezado Ejecutivo Sobrio */}
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="default">Fase 1 MVP</Badge>
              <Badge variant="success">
                <ShieldCheck className="h-3 w-3" /> Ley 1581 (Habeas Data)
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Alliance HCM – Core TH &amp; IT
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Gestión transaccional de Onboarding, Offboarding, firma electrónica certificada e
              integración bidireccional con ManageEngine ServiceDesk Plus.
            </p>
          </div>
        </section>

        {/* Módulos del Sistema */}
        <section className="grid gap-4 md:grid-cols-2">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group">
                <Card className="h-full transition-colors hover:border-slate-400 dark:hover:border-slate-600">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <Badge variant="secondary">{mod.badge}</Badge>
                    </div>
                    <CardTitle className="mt-3 flex items-center justify-between text-base">
                      <span>{mod.title}</span>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                    </CardTitle>
                    <CardDescription>{mod.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {mod.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
