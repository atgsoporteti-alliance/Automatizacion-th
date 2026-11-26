'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, KeyRound, Mail } from 'lucide-react';
import { AuthenticatedUserProfile, ROLE_HOME_ROUTES, ROLE_LABELS } from '@alliance-hcm/shared';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui/primitives';

const FALLBACK_UAT_PROFILES: AuthenticatedUserProfile[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    email: 'th.analista@alliance.com',
    fullName: 'Valeria Quintero (Analista TH)',
    role: 'TH_ANALYST',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    email: 'th.lider@alliance.com',
    fullName: 'Carolina Mejía (Admin TH)',
    role: 'TH_ADMIN',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    email: 'lider.dsi@alliance.com',
    fullName: 'Mateo Saldarriaga (Líder DSI)',
    role: 'AREA_LEADER',
    operationalArea: 'DSI',
    clearanceDepartment: null,
    isActive: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    email: 'soporte.it@alliance.com',
    fullName: 'Juan Pablo Rojas (Soporte IT)',
    role: 'IT_SUPPORT',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    email: 'finanzas@alliance.com',
    fullName: 'Diana Marcela Ortiz (Finanzas)',
    role: 'CLEARANCE_APPROVER',
    operationalArea: null,
    clearanceDepartment: 'FINANCE',
    isActive: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111106',
    email: 'admin@alliance.com',
    fullName: 'Luis Gotopo (Super Admin)',
    role: 'SUPER_ADMIN',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser, loginWithDevProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uatProfiles, setUatProfiles] = useState<AuthenticatedUserProfile[]>(FALLBACK_UAT_PROFILES);
  const [loadingRoleEmail, setLoadingRoleEmail] = useState<string | null>(null);

  const isUatBypassEnabled = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';

  useEffect(() => {
    if (!isUatBypassEnabled) return;
    apiClient
      .getDevProfiles()
      .then((rows) => {
        if (rows.length > 0) {
          setUatProfiles(rows);
        }
      })
      .catch(() => {
        // Conserva FALLBACK_UAT_PROFILES si el backend está en cold-start
      });
  }, [isUatBypassEnabled]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase Auth no está configurado en .env.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const profile = await refreshUser();
      if (profile) {
        document.cookie = `alliance_user_role=${encodeURIComponent(profile.role)}; path=/; max-age=86400; SameSite=Lax`;
        router.push(ROLE_HOME_ROUTES[profile.role] ?? '/dashboard/th');
      } else {
        setError('Autenticado en Supabase, pero sin perfil RBAC activo en Alliance HCM.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRoleLogin = async (roleEmail: string) => {
    setError(null);
    setLoadingRoleEmail(roleEmail);
    try {
      await loginWithDevProfile(roleEmail);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo conectar con la API del backend.',
      );
    } finally {
      setLoadingRoleEmail(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafafa] px-4 py-12 dark:bg-[#09090b]">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <Building2 className="h-4 w-4" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
            Alliance HCM
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Core Talento Humano &amp; IT
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Ingresa con tu correo corporativo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailLogin} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label>Correo corporativo</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <Input
                    type="email"
                    required
                    placeholder="usuario@alliance.com"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Contraseña</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <Input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Verificando...' : 'Continuar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isUatBypassEnabled && uatProfiles.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Acceso rápido por rol
              </span>
              <Badge variant="outline">UAT</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {uatProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  disabled={loadingRoleEmail !== null}
                  onClick={() => void handleQuickRoleLogin(profile.email)}
                  className="rounded-md border border-zinc-200/80 bg-white px-3 py-2 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-800/80 dark:bg-[#0f0f12] dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                >
                  <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {loadingRoleEmail === profile.email
                      ? 'Ingresando...'
                      : ROLE_LABELS[profile.role]}
                  </span>
                  <span className="block text-[11px] text-zinc-400 truncate">
                    {profile.email}
                  </span>
                </button>
              ))}
              <button
                type="button"
                disabled={loadingRoleEmail !== null}
                onClick={() => router.push('/candidato/demo')}
                className="sm:col-span-2 flex items-center justify-between gap-2 rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer dark:border-zinc-700 dark:bg-[#0f0f12] dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    Vista de Candidato (Portal y Selección)
                  </span>
                  <span className="block text-[11px] text-zinc-400 truncate">
                    candidato.demo@correo.com · CV, reuniones, pre-registro y regla 15 días
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0">
                  Demo Portal
                </Badge>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
