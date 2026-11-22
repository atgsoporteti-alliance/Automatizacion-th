'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserCog } from 'lucide-react';
import {
  AuthenticatedUserProfile,
  INTERNAL_ROLES,
  InternalRole,
  ROLE_LABELS,
  USER_CLEARANCE_DEPARTMENTS,
  USER_OPERATIONAL_AREAS,
  UserClearanceDepartment,
  UserOperationalArea,
} from '@alliance-hcm/shared';
import { AppShell } from '@/components/app-shell';
import { apiClient } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui/primitives';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.getAdminUsers(),
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
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuarios y Roles (RBAC)</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Exclusivo para <strong>SUPER_ADMIN</strong>. Cada ajuste queda auditado en{' '}
            <code>audit_logs</code>.
          </p>
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
      </div>
    </AppShell>
  );
}
