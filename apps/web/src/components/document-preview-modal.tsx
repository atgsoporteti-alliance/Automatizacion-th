'use client';

import React, { useEffect } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { Button } from './ui/primitives';

interface DocumentPreviewModalProps {
  open: boolean;
  fileName: string;
  mimeType: string;
  objectUrl: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function DocumentPreviewModal({
  open,
  fileName,
  mimeType,
  objectUrl,
  loading = false,
  error = null,
  onClose,
}: DocumentPreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#111622]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="truncate text-sm font-semibold">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            {objectUrl && (
              <a
                href={objectUrl}
                download={fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            )}
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 p-4 dark:bg-slate-950">
          {loading ? (
            <div className="flex h-[65vh] items-center justify-center text-sm text-slate-500">
              Cargando archivo desde Supabase Storage (bucket alliance)...
            </div>
          ) : error ? (
            <div className="flex h-[65vh] items-center justify-center text-sm text-rose-600">
              {error}
            </div>
          ) : !objectUrl ? (
            <div className="flex h-[65vh] items-center justify-center text-sm text-slate-500">
              No se encontró contenido para previsualizar.
            </div>
          ) : isImage ? (
            <div className="flex h-[65vh] items-center justify-center overflow-auto rounded-md bg-white p-4 dark:bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl}
                alt={fileName}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={objectUrl}
              title={fileName}
              className="h-[70vh] w-full rounded-md border border-slate-200 bg-white dark:border-slate-800"
            />
          ) : (
            <div className="flex h-[65vh] flex-col items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <p>Previsualización directa no disponible para el tipo {mimeType}.</p>
              <a
                href={objectUrl}
                download={fileName}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
              >
                <Download className="h-4 w-4" />
                Descargar para abrir
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
