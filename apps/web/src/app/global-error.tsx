'use client';

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const message =
    error instanceof Error ? error.message : 'Ocurrió un error inesperado en la aplicación.';

  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 p-6">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <h2 className="text-lg font-semibold">Error en Alliance HCM</h2>
          <p className="text-sm text-slate-600">{message}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
