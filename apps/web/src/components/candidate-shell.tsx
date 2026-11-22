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
    <div className="min-h-screen flex flex-col bg-[#f6f7f9] text-slate-900 dark:bg-[#0b0f17] dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0e131e]/95">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">Alliance HCM</span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Portal de Pre-Ingreso
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success" className="hidden sm:inline-flex">
              <Lock className="h-3 w-3" />
              Enlace Seguro · Ley 1581
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

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">{children}</main>

      <footer className="border-t border-slate-200 py-4 text-center text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
        Acceso exclusivo para diligenciamiento de ingreso · Protección de Datos Ley 1581 de 2012
      </footer>
    </div>
  );
}
