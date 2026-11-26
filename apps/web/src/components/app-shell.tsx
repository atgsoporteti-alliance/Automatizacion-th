'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Clock4,
  Cpu,
  ExternalLink,
  FileSearch,
  Link2,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCheck,
  UserCog,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { InternalRole, ROLE_LABELS } from '@alliance-hcm/shared';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from './providers';
import { Badge, Button } from './ui/primitives';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: InternalRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Talento Humano',
    items: [
      {
        href: '/dashboard/candidatos',
        label: 'Selección y Candidatos',
        icon: UserCheck,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/entrevistas',
        label: 'Entrevistas y Competencias',
        icon: Award,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/th',
        label: 'Validación TH',
        icon: ClipboardCheck,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/th?invite=1',
        label: 'Link Pre-Ingreso',
        icon: Link2,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/vencimientos',
        label: 'Alertas Vencimiento',
        icon: CalendarClock,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/novedades',
        label: 'Novedades y Horas Extra',
        icon: Clock4,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/offboarding',
        label: 'Offboarding',
        icon: UserMinus,
        allowedRoles: [
          'TH_ANALYST',
          'TH_ADMIN',
          'AREA_LEADER',
          'IT_SUPPORT',
          'CLEARANCE_APPROVER',
          'SUPER_ADMIN',
        ],
      },
    ],
  },
  {
    label: 'Operación',
    items: [
      {
        href: '/dashboard/team',
        label: 'Mi Equipo y DSI',
        icon: Users,
        allowedRoles: ['AREA_LEADER', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/it',
        label: 'IT / Helpdesk',
        icon: Cpu,
        allowedRoles: ['IT_SUPPORT', 'SUPER_ADMIN'],
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        href: '/dashboard/admin/users',
        label: 'Usuarios y Roles',
        icon: UserCog,
        allowedRoles: ['SUPER_ADMIN'],
      },
      {
        href: '/dashboard/admin/audit-logs',
        label: 'Auditoría',
        icon: FileSearch,
        allowedRoles: ['SUPER_ADMIN', 'TH_ADMIN'],
      },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard/candidatos': 'Talento Humano · Selección y Candidatos',
  '/dashboard/entrevistas': 'Selección · Entrevistas y Competencias',
  '/dashboard/th': 'Talento Humano · Validación',
  '/dashboard/vencimientos': 'Alertas Automáticas · Vencimientos',
  '/dashboard/novedades': 'Incapacidades, Licencias, Permisos y Horas Extra',
  '/dashboard/it': 'IT & Helpdesk · Aprovisionamiento',
  '/dashboard/team': 'Líder de Área · Equipo y Puerta DSI',
  '/dashboard/offboarding': 'Offboarding · Paz y Salvo',
  '/dashboard/admin/users': 'Administración · Usuarios y Roles',
  '/dashboard/admin/audit-logs': 'Administración · Auditoría',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  const swaggerUrl = `${apiUrl.replace(/\/api$/, '')}/api/docs`;

  const pageTitle = ROUTE_TITLES[pathname] ?? 'Alliance HCM';
  const activeRole: InternalRole | null = user?.role ?? null;

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !activeRole || item.allowedRoles.includes(activeRole)),
  })).filter((group) => group.items.length > 0);

  const SidebarContent = (
    <div className="flex h-full flex-col justify-between border-r border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-[#0c0c0f]">
      <div>
        <div className="flex h-12 items-center justify-between border-b border-zinc-200/80 px-4 dark:border-zinc-800/80">
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              Alliance HCM
            </span>
          </Link>
          <button
            type="button"
            className="lg:hidden rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-3 py-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                {group.label}
              </p>
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                        active
                          ? 'bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800/80 dark:text-zinc-50'
                          : 'text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-75" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}

          {(activeRole === 'SUPER_ADMIN' || activeRole === 'IT_SUPPORT') && (
            <div className="space-y-1">
              <p className="px-2.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                API
              </p>
              <a
                href={swaggerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-100/60 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 opacity-75" />
                  Swagger Docs
                </span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Footer compacto */}
      <div className="border-t border-zinc-200/80 p-3 space-y-2.5 dark:border-zinc-800/80">
        {user && (
          <div className="px-1 space-y-1">
            <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {user.fullName}
            </p>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{user.email}</p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              <Badge variant="default">{ROLE_LABELS[user.role]}</Badge>
              {user.operationalArea && user.operationalArea !== 'ALL' && (
                <Badge variant="outline">{user.operationalArea}</Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 justify-between"
            onClick={toggleTheme}
          >
            <span className="text-xs">{theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}</span>
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void signOut()}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#fafafa] text-zinc-950 dark:bg-[#09090b] dark:text-zinc-100">
      <aside className="hidden lg:block lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {SidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-60 max-w-[80vw] h-full">{SidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-zinc-200/80 bg-[#fafafa]/85 px-4 backdrop-blur-md sm:px-6 dark:border-zinc-800/80 dark:bg-[#09090b]/85">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden rounded-md border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú lateral"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              {pageTitle}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void queryClient.invalidateQueries()}
              title="Actualizar registros"
              aria-label="Actualizar registros"
              className="h-7 px-2 text-xs text-zinc-500"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching > 0 && 'animate-spin')} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
            <span className="hidden sm:inline-block text-xs text-zinc-500 dark:text-zinc-400">
              {user ? ROLE_LABELS[user.role] : 'Autenticando...'}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
