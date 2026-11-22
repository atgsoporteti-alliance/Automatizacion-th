'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
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
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con la API del backend.',
      );
    } finally {
      setLoadingRoleEmail(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f6f7f9] px-4 py-10 dark:bg-[#0b0f17]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Alliance HCM – Core TH &amp; IT
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acceso corporativo protegido con Supabase Auth y RBAC
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-slate-500" />
              Iniciar Sesión
            </CardTitle>
            <CardDescription>
              Ingresa con tu correo corporativo y contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleEmailLogin} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label>Correo Corporativo</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Verificando sesión...' : 'Ingresar con Correo'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isUatBypassEnabled && uatProfiles.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-900/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Acceso Rápido de Pruebas por Rol
                </CardTitle>
                <Badge variant="warning">UAT</Badge>
              </div>
              <CardDescription>
                Selecciona un rol para validar permisos RBAC en 1 clic (desactivable con{' '}
                <code>NEXT_PUBLIC_DEV_AUTH_BYPASS=false</code>).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {uatProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  disabled={loadingRoleEmail !== null}
                  onClick={() => void handleQuickRoleLogin(profile.email)}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:opacity-50 cursor-pointer dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-600"
                >
                  <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {loadingRoleEmail === profile.email
                      ? 'Ingresando...'
                      : ROLE_LABELS[profile.role]}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {profile.email}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
