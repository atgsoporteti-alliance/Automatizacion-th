import Link from 'next/link';
import {
  ArrowUpRight,
  ClipboardCheck,
  Cpu,
  Link2,
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
      'Revisión de candidatos, asignación de área (Customer, Ventas, DSI), puerta DSI y cancelación No-Show.',
    badge: 'Talento Humano',
    icon: ClipboardCheck,
  },
  {
    href: '/dashboard/it',
    title: 'Consola Operativa IT',
    subtitle: 'ManageEngine ServiceDesk Plus',
    description:
      'Cola de aprovisionamiento por área operativa, trazabilidad de tickets y webhooks.',
    badge: 'IT & Helpdesk',
    icon: Cpu,
  },
  {
    href: '/dashboard/offboarding',
    title: 'Offboarding & Paz y Salvo',
    subtitle: 'Standard (23:59) y Crítico',
    description:
      'Gestión de retiros, revocación de accesos y semáforo digital multi-área.',
    badge: 'Offboarding',
    icon: UserMinus,
  },
  {
    href: '/dashboard/th?invite=1',
    title: 'Link de Pre-Ingreso',
    subtitle: 'Magic Link JWT · Candidato',
    description:
      'Enlace temporal (72h) para diligenciar los 24 campos y firma Ley 1581 sin acceso interno.',
    badge: 'Invitación',
    icon: Link2,
  },
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <section className="flex flex-col gap-2 border-b border-zinc-200/80 pb-6 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Fase 1 MVP</Badge>
            <Badge variant="success">Ley 1581</Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
            Alliance HCM – Core TH &amp; IT
          </h1>
          <p className="max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            Gestión de Onboarding, Offboarding, firma electrónica e integración con ServiceDesk Plus.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group">
                <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                      <Badge variant="secondary">{mod.badge}</Badge>
                    </div>
                    <CardTitle className="mt-3 flex items-center justify-between text-base">
                      <span>{mod.title}</span>
                      <ArrowUpRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-900 dark:group-hover:text-zinc-100" />
                    </CardTitle>
                    <CardDescription>{mod.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
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
