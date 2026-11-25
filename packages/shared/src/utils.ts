/**
 * Calcula la edad exacta en años cumplidos a partir de la fecha de nacimiento.
 */
export function calculateAge(birthDateInput: string | Date, referenceDate: Date = new Date()): number {
  const birthDate = typeof birthDateInput === 'string' ? new Date(birthDateInput) : birthDateInput;
  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = referenceDate.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return Math.max(0, age);
}

/**
 * Genera una sugerencia de correo corporativo limpia a partir del nombre preferido.
 */
export function buildCorporateEmailSuggestion(
  preferredName: string,
  domain: string = 'alliance.com.co',
): string {
  const normalized = preferredName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, '')
    .trim()
    .replace(/\s+/g, '.');

  return `${normalized || 'colaborador'}@${domain}`;
}

export const CANDIDATE_PORTAL_VISIBILITY_DAYS = 15;

export interface CandidateVisibilityStatus {
  isTemporarilyScoped: boolean;
  hiringApprovedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  daysRemaining: number | null;
}

/**
 * Calcula la ventana temporal de visibilidad (15 días) para el candidato
 * una vez que Talento Humano aprueba su contratación.
 */
export function computeCandidatePortalVisibility(
  hiringApprovedAtInput: Date | string | null | undefined,
  now: Date = new Date(),
  visibilityDays: number = CANDIDATE_PORTAL_VISIBILITY_DAYS,
): CandidateVisibilityStatus {
  if (!hiringApprovedAtInput) {
    return {
      isTemporarilyScoped: false,
      hiringApprovedAt: null,
      expiresAt: null,
      isExpired: false,
      daysRemaining: null,
    };
  }

  const approvedAt =
    typeof hiringApprovedAtInput === 'string'
      ? new Date(hiringApprovedAtInput)
      : hiringApprovedAtInput;

  if (Number.isNaN(approvedAt.getTime())) {
    return {
      isTemporarilyScoped: false,
      hiringApprovedAt: null,
      expiresAt: null,
      isExpired: false,
      daysRemaining: null,
    };
  }

  const expiresAtDate = new Date(approvedAt.getTime() + visibilityDays * 24 * 60 * 60 * 1000);
  const diffMs = expiresAtDate.getTime() - now.getTime();
  const isExpired = diffMs <= 0;
  const daysRemaining = isExpired ? 0 : Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  return {
    isTemporarilyScoped: true,
    hiringApprovedAt: approvedAt.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    isExpired,
    daysRemaining,
  };
}

export type MeetingPlatform = 'TEAMS' | 'MEET' | 'OTHER';

export const MEETING_PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  TEAMS: 'Microsoft Teams',
  MEET: 'Google Meet',
  OTHER: 'Enlace virtual',
};

export const MEETING_PLATFORM_LOCATIONS: Record<MeetingPlatform, string> = {
  TEAMS: 'Virtual · Microsoft Teams',
  MEET: 'Virtual · Google Meet',
  OTHER: 'Presencial / Otro',
};

/**
 * Detecta la plataforma de videollamada (Microsoft Teams o Google Meet) a partir de la URL o modalidad.
 */
export function detectMeetingPlatform(
  url?: string | null,
  location?: string | null,
): MeetingPlatform {
  const normalizedUrl = (url ?? '').trim().toLowerCase();
  if (
    normalizedUrl.includes('teams.microsoft.com') ||
    normalizedUrl.includes('teams.live.com') ||
    normalizedUrl.includes('aka.ms/')
  ) {
    return 'TEAMS';
  }
  if (normalizedUrl.includes('meet.google.com')) {
    return 'MEET';
  }

  const normalizedLoc = (location ?? '').trim().toLowerCase();
  if (normalizedLoc.includes('teams')) return 'TEAMS';
  if (normalizedLoc.includes('meet')) return 'MEET';
  return 'OTHER';
}

export interface ParsedMeetingUrl {
  url: string | null;
  platform: MeetingPlatform | null;
  error?: string;
}

/**
 * Normaliza y valida una URL de reunión (Microsoft Teams, Google Meet u otro enlace http/https).
 */
export function parseMeetingUrl(rawUrl?: string | null): ParsedMeetingUrl {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) {
    return { url: null, platform: null };
  }

  const invalidError =
    'Ingresa un enlace válido de Microsoft Teams o Google Meet (ej. https://teams.microsoft.com/... o https://meet.google.com/...).';

  if (/\s/.test(trimmed)) {
    return { url: null, platform: null, error: invalidError };
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if ((scheme !== 'http' && scheme !== 'https') || !/^https?:\/\//i.test(trimmed)) {
      return { url: null, platform: null, error: invalidError };
    }
  }

  const normalizedUrl = schemeMatch ? trimmed : `https://${trimmed}`;
  const validPattern =
    /^https?:\/\/([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;

  if (!validPattern.test(normalizedUrl)) {
    return { url: null, platform: null, error: invalidError };
  }

  return {
    url: normalizedUrl,
    platform: detectMeetingPlatform(normalizedUrl),
  };
}
