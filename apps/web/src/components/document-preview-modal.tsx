'use client';

import React, { useEffect } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { Button } from './ui/primitives';

interface DocumentPreviewModalProps {
  open: boolean;
  fileName: string;
  mimeType: string;
  objectUrl: string | null;
  loading?: boolean;
  error?: string | null;
  allowDownload?: boolean;
  onClose: () => void;
}

export function DocumentPreviewModal({
  open,
  fileName,
  mimeType,
  objectUrl,
  loading = false,
  error = null,
  allowDownload = true,
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
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#0f0f12]">
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="truncate text-sm font-medium">{fileName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {allowDownload && objectUrl && (isPdf || isImage) && (
              <a
                href={objectUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
            )}
            {allowDownload && objectUrl ? (
              <a
                href={objectUrl}
                download={fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            ) : !allowDownload ? (
              <span className="rounded border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Solo visualización
              </span>
            ) : null}
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 bg-zinc-100 p-4 dark:bg-zinc-950">
          {loading ? (
            <div className="flex h-[65vh] items-center justify-center text-xs text-zinc-500">
              Cargando archivo desde Supabase Storage (alliance)...
            </div>
          ) : error ? (
            <div className="flex h-[65vh] flex-col items-center justify-center gap-2 px-6 text-center text-xs text-rose-600 dark:text-rose-400">
              <p className="max-w-lg leading-relaxed">{error}</p>
            </div>
          ) : !objectUrl ? (
            <div className="flex h-[65vh] items-center justify-center text-xs text-zinc-500">
              No se encontró contenido para previsualizar.
            </div>
          ) : isImage ? (
            <div
              className="flex h-[65vh] items-center justify-center overflow-auto rounded-md bg-white p-4 dark:bg-zinc-900"
              onContextMenu={!allowDownload ? (e) => e.preventDefault() : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl}
                alt={fileName}
                draggable={allowDownload}
                className={`max-h-full max-w-full object-contain ${!allowDownload ? 'select-none pointer-events-none' : ''}`}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={objectUrl}
              title={fileName}
              className="h-[70vh] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
            />
          ) : (
            <div className="flex h-[65vh] flex-col items-center justify-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
              <p>Previsualización directa no disponible para el tipo {mimeType}.</p>
              {allowDownload && (
                <a
                  href={objectUrl}
                  download={fileName}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-4 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar para abrir
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
