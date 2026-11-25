'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  ShieldAlert,
  UserCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import {
  AuthenticatedUserProfile,
  CANDIDATE_STAGE_LABELS,
  INTERNAL_ROLES,
  InternalRole,
  ROLE_LABELS,
  SYSTEM_ROLES,
  SystemRole,
  USER_CLEARANCE_DEPARTMENTS,
  USER_OPERATIONAL_AREAS,
  UserClearanceDepartment,
  UserOperationalArea,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient, CandidateProcessRecord } from '@/lib/api';
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
  Select,
} from '@/components/ui/primitives';

function toSameOriginPortalUrl(token: string): string {
  if (typeof window === 'undefined') return `/candidato/${token}`;
  return `${window.location.origin}/candidato/${token}`;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Formulario de creación de usuario (corporativo RBAC o candidato)
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState<SystemRole>('TH_ANALYST');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [operationalArea, setOperationalArea] = useState<UserOperationalArea>('ALL');
  const [clearanceDepartment, setClearanceDepartment] =
    useState<UserClearanceDepartment>('FINANCE');
  const [password, setPassword] = useState('');
  const [appliedRole, setAppliedRole] = useState('');
  const [nationalId, setNationalId] = useState('');

  // Resultado recién creado cuando es Candidato
  const [createdCandidateInfo, setCreatedCandidateInfo] = useState<{
    name: string;
    email: string;
    portalUrl: string;
    emailSent: boolean;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.getAdminUsers(),
  });

  const { data: candidateProcesses = [] } = useQuery({
    queryKey: ['candidate-processes'],
    queryFn: () => apiClient.getCandidateProcesses(),
  });

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 2500);
    } catch {
      setMessage('No se pudo copiar automáticamente; copia el enlace manualmente.');
    }
  };

  const createUserMutation = useMutation({
    mutationFn: () => {
      setFormError(null);
      return apiClient.createAdminUser({
        fullName: fullName.trim(),
        email: email.trim(),
        role: newRole,
        operationalArea:
          newRole === 'CANDIDATE' || newRole === 'CLEARANCE_APPROVER'
            ? null
            : operationalArea,
        clearanceDepartment:
          newRole === 'CLEARANCE_APPROVER' ? clearanceDepartment : null,
        appliedRole: newRole === 'CANDIDATE' ? appliedRole.trim() || undefined : undefined,
        nationalId: newRole === 'CANDIDATE' ? nationalId.trim() || undefined : undefined,
        password: newRole !== 'CANDIDATE' && password.trim() ? password.trim() : undefined,
      });
    },
    onSuccess: (res) => {
      setFormError(null);
      setFullName('');
      setEmail('');
      setPassword('');
      setAppliedRole('');
      setNationalId('');
      setCreateOpen(false);

      if (res.kind === 'CANDIDATE') {
        const url = toSameOriginPortalUrl(res.candidateProcess.accessToken);
        setCreatedCandidateInfo({
          name: res.candidateProcess.candidateName,
          email: res.candidateProcess.candidateEmail,
          portalUrl: url,
          emailSent: Boolean(res.candidateProcess.emailSent),
        });
        setMessage(
          `Usuario Candidato creado para ${res.candidateProcess.candidateName} (vigencia temporal de 15 días tras aprobación TH).`,
        );
        void queryClient.invalidateQueries({ queryKey: ['candidate-processes'] });
      } else {
        setCreatedCandidateInfo(null);
        setMessage(
          `Usuario ${res.user.fullName} (${ROLE_LABELS[res.user.role]}) creado correctamente.${
            res.authCreated
              ? ' Cuenta Supabase Auth habilitada.'
              : res.authWarning
                ? ` ${res.authWarning}`
                : ''
          }`,
        );
        void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      }
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      role: InternalRole;
      operationalArea?: UserOperationalArea | null;
      clearanceDepartment?: UserClearanceDepartment | null;
      isActive?: boolean;
    }) =>
      apiClient.updateUserRole(vars.id, {
        role: vars.role,
        operationalArea: vars.operationalArea,
        clearanceDepartment: vars.clearanceDepartment,
        isActive: vars.isActive,
      }),
    onSuccess: (updated) => {
      setMessage(`Perfil actualizado para ${updated.email} (${updated.role}).`);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Usuarios y Roles (RBAC)</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Exclusivo para <strong>SUPER_ADMIN</strong>. Crea usuarios corporativos o usuarios{' '}
              <strong>Candidato</strong> (portal aislado con vigencia de 15 días). Todo queda
              auditado en <code>audit_logs</code>.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen((v) => !v);
            }}
          >
            <UserPlus className="h-4 w-4" />
            {createOpen ? 'Cerrar formulario' : 'Crear usuario'}
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-200 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error instanceof Error ? error.message : 'Acceso restringido a SUPER_ADMIN.'}</span>
          </div>
        )}

        {message && (
          <div className="rounded-md bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
            {message}
          </div>
        )}

        {/* Enlace del usuario candidato recién creado */}
        {createdCandidateInfo && (
          <Card className="border-emerald-200/80 dark:border-emerald-900/70">
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">
                    Portal del Candidato creado para {createdCandidateInfo.name}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {createdCandidateInfo.email} ·{' '}
                    {createdCandidateInfo.emailSent
                      ? 'Invitación enviada automáticamente por Gmail'
                      : 'Comparte el enlace con el candidato'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCopy(createdCandidateInfo.portalUrl, 'new-cand')}
                  >
                    {copiedId === 'new-cand' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copiar enlace
                      </>
                    )}
                  </Button>
                  <a
                    href={createdCandidateInfo.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Abrir
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
              <p className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                {createdCandidateInfo.portalUrl}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Formulario colapsable de creación de usuario */}
        {createOpen && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Crear nuevo usuario</CardTitle>
              <CardDescription>
                Selecciona si deseas crear un usuario corporativo interno o un usuario Candidato
                (acceso externo temporal sin panel interno).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createUserMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-role">Tipo de usuario / Rol *</Label>
                    <Select
                      id="new-user-role"
                      value={newRole}
                      onChange={(e) => {
                        const role = e.target.value as SystemRole;
                        setNewRole(role);
                        if (role === 'AREA_LEADER') {
                          setOperationalArea('CUSTOMER');
                        } else if (role !== 'CANDIDATE' && role !== 'CLEARANCE_APPROVER') {
                          setOperationalArea('ALL');
                        }
                      }}
                    >
                      {SYSTEM_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-name">Nombre completo *</Label>
                    <Input
                      id="new-user-name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ej: Laura Marcela Gómez"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-email">Correo electrónico *</Label>
                    <Input
                      id="new-user-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        newRole === 'CANDIDATE'
                          ? 'candidato@correo.com'
                          : 'usuario@alliance.com'
                      }
                    />
                  </div>
                </div>

                {newRole === 'CANDIDATE' ? (
                  <div className="space-y-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cand-role">Cargo / Vacante (opcional)</Label>
                        <Input
                          id="cand-role"
                          value={appliedRole}
                          onChange={(e) => setAppliedRole(e.target.value)}
                          placeholder="Ej: Analista de Operaciones"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cand-nid">Cédula (opcional)</Label>
                        <Input
                          id="cand-nid"
                          value={nationalId}
                          onChange={(e) => setNationalId(e.target.value)}
                          placeholder="1020304050"
                        />
                      </div>
                    </div>
                    <div className="rounded-md border border-zinc-200/80 bg-zinc-50/70 px-3.5 py-2.5 text-xs text-zinc-600 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <strong>Usuario Candidato:</strong> no accede a módulos internos ni a
                      dashboards administrativos. Se genera su enlace{' '}
                      <code>/candidato/&lt;token&gt;</code> (con carga de Hoja de Vida, entrevistas,
                      Pre-Registro y notificaciones), enviado automáticamente por correo y visible{' '}
                      <strong>15 días</strong> después de que TH apruebe la contratación.
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {newRole !== 'CLEARANCE_APPROVER' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-area">Área operativa</Label>
                        <Select
                          id="new-user-area"
                          value={operationalArea}
                          onChange={(e) => setOperationalArea(e.target.value as UserOperationalArea)}
                        >
                          {USER_OPERATIONAL_AREAS.map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {newRole === 'CLEARANCE_APPROVER' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-dept">Departamento Paz y Salvo</Label>
                        <Select
                          id="new-user-dept"
                          value={clearanceDepartment}
                          onChange={(e) =>
                            setClearanceDepartment(e.target.value as UserClearanceDepartment)
                          }
                        >
                          {USER_CLEARANCE_DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="new-user-pass">
                        Contraseña inicial Supabase (opcional, mín. 6 car.)
                      </Label>
                      <Input
                        id="new-user-pass"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Opcional en entorno UAT / Google SSO"
                      />
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending
                      ? 'Creando...'
                      : newRole === 'CANDIDATE'
                        ? 'Crear usuario candidato'
                        : 'Crear usuario corporativo'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabla 1: Cuentas corporativas RBAC */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-zinc-500" />
              Cuentas corporativas ({users.length})
            </CardTitle>
            <CardDescription>Asigna rol, área operativa y estado.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-xs text-zinc-500">Cargando usuarios...</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 text-[11px] font-medium text-zinc-500 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 pr-4">Usuario</th>
                    <th className="py-2.5 pr-4">Rol RBAC</th>
                    <th className="py-2.5 pr-4">Área</th>
                    <th className="py-2.5 pr-4">Depto Paz y Salvo</th>
                    <th className="py-2.5 pr-4">Estado</th>
                    <th className="py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {users.map((u: AuthenticatedUserProfile) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-zinc-950 dark:text-zinc-100">{u.fullName}</p>
                        <p className="text-zinc-500">{u.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          className="h-8 text-xs min-w-[170px]"
                          value={u.role}
                          onChange={(e) =>
                            updateMutation.mutate({
                              id: u.id,
                              role: e.target.value as InternalRole,
                            })
                          }
                        >
                          {INTERNAL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          className="h-8 text-xs min-w-[110px]"
                          value={u.operationalArea ?? ''}
                          onChange={(e) =>
                            updateMutation.mutate({
                              id: u.id,
                              role: u.role,
                              operationalArea: (e.target.value || null) as UserOperationalArea | null,
                            })
                          }
                        >
                          <option value="">N/A</option>
                          {USER_OPERATIONAL_AREAS.map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          className="h-8 text-xs min-w-[120px]"
                          value={u.clearanceDepartment ?? ''}
                          onChange={(e) =>
                            updateMutation.mutate({
                              id: u.id,
                              role: u.role,
                              clearanceDepartment: (e.target.value ||
                                null) as UserClearanceDepartment | null,
                            })
                          }
                        >
                          <option value="">N/A</option>
                          {USER_CLEARANCE_DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={u.isActive ? 'success' : 'danger'}>
                          {u.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateMutation.mutate({
                              id: u.id,
                              role: u.role,
                              isActive: !u.isActive,
                            })
                          }
                        >
                          {u.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Tabla 2: Usuarios Candidatos y Portales Temporales (15 días) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-zinc-500" />
                  Usuarios Candidatos · Portales Temporales ({candidateProcesses.length})
                </CardTitle>
                <CardDescription>
                  Accesos externos por enlace único (visibles para el candidato máximo 15 días tras
                  aprobación TH; permanentes para TH).
                </CardDescription>
              </div>
              <Link
                href="/dashboard/candidatos"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Ir a Selección y Candidatos
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {candidateProcesses.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No hay usuarios candidato creados aún. Usa el botón &quot;Crear usuario&quot; con
                rol Candidato.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 text-[11px] font-medium text-zinc-500 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 pr-4">Candidato</th>
                    <th className="py-2.5 pr-4">Cargo</th>
                    <th className="py-2.5 pr-4">Etapa</th>
                    <th className="py-2.5 pr-4">Vigencia Portal (15d)</th>
                    <th className="py-2.5">Enlace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {candidateProcesses.map((proc: CandidateProcessRecord) => {
                    const url = toSameOriginPortalUrl(proc.accessToken);
                    return (
                      <tr key={proc.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-zinc-950 dark:text-zinc-100">
                            {proc.candidateName}
                          </p>
                          <p className="text-zinc-500">{proc.candidateEmail}</p>
                        </td>
                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                          {proc.appliedRole ?? '—'}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={proc.stage === 'HIRED_APPROVED' ? 'success' : 'outline'}>
                            {CANDIDATE_STAGE_LABELS[proc.stage]}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {!proc.hiringApprovedAt ? (
                            <span className="text-zinc-500">En selección (sin límite aún)</span>
                          ) : proc.visibility.isExpired ? (
                            <Badge variant="outline">
                              <Lock className="mr-1 h-3 w-3" /> Expirado p/ candidato
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              <Clock className="mr-1 h-3 w-3" /> {proc.visibility.daysRemaining}d
                              restantes
                            </Badge>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleCopy(url, proc.id)}
                            >
                              {copiedId === proc.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" /> Copiar
                                </>
                              )}
                            </Button>
                            <Link
                              href={`/candidato/${proc.accessToken}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              Abrir
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
