export const DEFAULT_VERCEL_WEB_URL = 'https://automatizacion-th-web.vercel.app';
export const DEFAULT_LOCAL_WEB_URL = 'http://localhost:3000';

function normalizeOrigin(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isNetlifyOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.toLowerCase().endsWith('.netlify.app');
  } catch {
    return origin.toLowerCase().includes('.netlify.app');
  }
}

export function parseAllowedOrigins(rawWebUrl?: string): string[] {
  return (rawWebUrl ?? '')
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter((origin): origin is string => Boolean(origin))
    .filter((origin) => !isNetlifyOrigin(origin));
}

export function isAllowedFrontendOrigin(origin: string, rawWebUrl?: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized || isNetlifyOrigin(normalized)) {
    return false;
  }
  const configured = parseAllowedOrigins(rawWebUrl);
  if (configured.includes(normalized) || normalized === DEFAULT_VERCEL_WEB_URL) {
    return true;
  }
  if (
    normalized.startsWith('https://automatizacion-th-') &&
    normalized.endsWith('-thiarth-3ds-projects.vercel.app')
  ) {
    return true;
  }
  return (
    normalized.startsWith('http://localhost:') ||
    normalized.startsWith('http://127.0.0.1:')
  );
}

/**
 * Resuelve la URL pública del portal web priorizando el origen actual válido
 * y descartando cualquier dominio de Netlify.
 */
export function resolveFrontendOrigin(params: {
  configuredWebUrl?: string;
  requestOrigin?: string;
  nodeEnv?: string;
}): string {
  const reqOrigin = normalizeOrigin(params.requestOrigin);
  if (reqOrigin && isAllowedFrontendOrigin(reqOrigin, params.configuredWebUrl)) {
    return reqOrigin;
  }
  const configuredOrigin = parseAllowedOrigins(params.configuredWebUrl)[0];
  if (configuredOrigin) {
    return configuredOrigin;
  }
  return params.nodeEnv === 'production' ? DEFAULT_VERCEL_WEB_URL : DEFAULT_LOCAL_WEB_URL;
}
