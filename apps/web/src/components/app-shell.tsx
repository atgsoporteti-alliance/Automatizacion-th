'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  ClipboardCheck,
  Cpu,
  ExternalLink,
  FileSearch,
  Link2,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
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
        href: '/dashboard/th',
        label: 'Consola de Validación TH',
        icon: ClipboardCheck,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/th?invite=1',
        label: 'Generar Link de Pre-Ingreso',
        icon: Link2,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/offboarding',
        label: 'Offboarding & Paz y Salvo',
        icon: UserMinus,
        allowedRoles: ['TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'CLEARANCE_APPROVER', 'SUPER_ADMIN'],
      },
    ],
  },
  {
    label: 'Liderazgo & Operación',
    items: [
      {
        href: '/dashboard/team',
        label: 'Mi Equipo y Aprobación DSI',
        icon: Users,
        allowedRoles: ['AREA_LEADER', 'SUPER_ADMIN'],
      },
      {
        href: '/dashboard/it',
        label: 'Consola IT / Helpdesk',
        icon: Cpu,
        allowedRoles: ['IT_SUPPORT', 'SUPER_ADMIN'],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        href: '/dashboard/admin/users',
        label: 'Usuarios y Roles RBAC',
        icon: UserCog,
        allowedRoles: ['SUPER_ADMIN'],
      },
      {
        href: '/dashboard/admin/audit-logs',
        label: 'Bitácora de Auditoría',
        icon: FileSearch,
        allowedRoles: ['SUPER_ADMIN', 'TH_ADMIN'],
      },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard/th': 'Talento Humano · Consola de Validación',
  '/dashboard/it': 'IT & Helpdesk · Cola de Aprovisionamiento',
  '/dashboard/team': 'Líder de Área · Equipo y Puerta DSI',
  '/dashboard/offboarding': 'Offboarding · Retiros y Paz y Salvo Digital',
  '/dashboard/admin/users': 'Administración · Gestión de Usuarios y Roles',
  '/dashboard/admin/audit-logs': 'Administración · Bitácora Inmutable (Audit Logs)',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0e131e] border-r border-slate-200 dark:border-slate-800/80">
      <div>
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800/80">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Alliance HCM
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Core TH &amp; IT
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-3 py-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}

          {(activeRole === 'SUPER_ADMIN' || activeRole === 'IT_SUPPORT') && (
            <div className="space-y-1">
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Sistema &amp; API
              </p>
              <a
                href={swaggerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  OpenAPI / Swagger
                </span>
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Footer: Perfil RBAC + Tema + Logout */}
      <div className="border-t border-slate-200 p-3 space-y-2.5 dark:border-slate-800/80">
        {user && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {user.fullName}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge variant="purple">{ROLE_LABELS[user.role]}</Badge>
              {user.operationalArea && user.operationalArea !== 'ALL' && (
                <Badge variant="outline">{user.operationalArea}</Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 justify-between"
            onClick={toggleTheme}
          >
            <span className="text-xs">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void signOut()}
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f6f7f9] text-slate-900 dark:bg-[#0b0f17] dark:text-slate-100">
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {SidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full">{SidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800/80 dark:bg-[#0e131e]/90">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú lateral"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
              {pageTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline-block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium dark:border-slate-800 dark:bg-slate-900">
              {user ? ROLE_LABELS[user.role] : 'Autenticando...'}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
