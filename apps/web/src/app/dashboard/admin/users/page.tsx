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
          <h1 className="text-2xl font-semibold tracking-tight">
            Gestión de Usuarios y Roles (RBAC)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Exclusivo para <strong>SUPER_ADMIN</strong>. Asigna roles, área operativa y estado activo.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error instanceof Error ? error.message : 'Acceso restringido a SUPER_ADMIN.'}</span>
          </div>
        )}

        {message && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
            {message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Cuentas Corporativas ({users.length})
            </CardTitle>
            <CardDescription>
              Cada cambio queda registrado automáticamente en <code>audit_logs</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-sm text-slate-500">Cargando usuarios...</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 pr-4">Usuario</th>
                    <th className="py-2.5 pr-4">Rol RBAC</th>
                    <th className="py-2.5 pr-4">Área Operativa</th>
                    <th className="py-2.5 pr-4">Depto Paz y Salvo</th>
                    <th className="py-2.5 pr-4">Estado</th>
                    <th className="py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {users.map((u: AuthenticatedUserProfile) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {u.fullName}
                        </p>
                        <p className="text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          className="h-8 text-xs min-w-[180px]"
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
                          className="h-8 text-xs min-w-[120px]"
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
                          className="h-8 text-xs min-w-[130px]"
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
                          variant={u.isActive ? 'outline' : 'success'}
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
