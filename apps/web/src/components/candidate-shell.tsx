'use client';

import React from 'react';
import { Building2, Lock, Moon, Sun } from 'lucide-react';
import { useTheme } from './providers';
import { Badge, Button } from './ui/primitives';

/**
 * Shell aislado para candidatos externos (Rol: CANDIDATE).
 * No expone el Sidebar ni rutas internas de Talento Humano / IT.
 */
export function CandidateShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa] text-zinc-950 dark:bg-[#09090b] dark:text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-[#fafafa]/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-[#09090b]/85">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Alliance HCM</span>
            <span className="hidden sm:inline text-xs text-zinc-400">· Portal del Candidato</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              <Lock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              Ley 1581
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Cambiar tema claro/oscuro"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-zinc-200/80 py-4 text-center text-[11px] text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
        Portal exclusivo de pre-ingreso · Protección de datos Ley 1581 de 2012
      </footer>
    </div>
  );
}
