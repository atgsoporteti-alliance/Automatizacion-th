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

export interface ExpirationEvaluation {
  daysRemaining: number;
  severity: 'OK' | 'UPCOMING_30' | 'WARNING_15' | 'URGENT_7' | 'EXPIRED';
  effectiveStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RENEWED' | 'ARCHIVED';
  thresholdLevel: number | null;
}

function parseUtcDateOnly(dateInput: string | Date): number | null {
  if (typeof dateInput === 'string') {
    const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  if (Number.isNaN(dateInput.getTime())) return null;
  return Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate());
}

/**
 * Evalúa los días restantes y la severidad de vencimiento de un contrato, licencia o certificación
 * usando comparación de fecha calendario UTC (YYYY-MM-DD).
 */
export function evaluateExpirationStatus(params: {
  expiresAt: string | Date;
  status?: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RENEWED' | 'ARCHIVED';
  alertDaysBefore?: number;
  referenceDate?: Date;
}): ExpirationEvaluation {
  const ref = params.referenceDate ?? new Date();
  const refUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const expUtc = parseUtcDateOnly(params.expiresAt);
  const daysRemaining = expUtc === null ? 0 : Math.ceil((expUtc - refUtc) / 86_400_000);
  const leadDays = Math.max(1, params.alertDaysBefore ?? 30);

  if (params.status === 'RENEWED' || params.status === 'ARCHIVED') {
    return {
      daysRemaining,
      severity: 'OK',
      effectiveStatus: params.status,
      thresholdLevel: null,
    };
  }

  if (daysRemaining <= 0) {
    return {
      daysRemaining,
      severity: 'EXPIRED',
      effectiveStatus: 'EXPIRED',
      thresholdLevel: 0,
    };
  }

  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      severity: 'URGENT_7',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: 7,
    };
  }

  if (daysRemaining <= 15 && leadDays >= 15) {
    return {
      daysRemaining,
      severity: 'WARNING_15',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: 15,
    };
  }

  if (daysRemaining <= leadDays) {
    return {
      daysRemaining,
      severity: 'UPCOMING_30',
      effectiveStatus: 'EXPIRING_SOON',
      thresholdLevel: leadDays > 15 ? leadDays : daysRemaining <= 15 ? 15 : leadDays,
    };
  }

  return {
    daysRemaining,
    severity: 'OK',
    effectiveStatus: 'ACTIVE',
    thresholdLevel: null,
  };
}

/**
 * Determina si debe enviarse una nueva alerta sin repetir notificaciones para el mismo umbral.
 * Los umbrales son decrecientes (ej. 30 -> 15 -> 7 -> 0).
 */
export function shouldSendExpirationAlert(params: {
  thresholdLevel: number | null;
  lastAlertLevelSent?: number | null;
}): boolean {
  if (params.thresholdLevel === null) return false;
  if (params.lastAlertLevelSent === null || params.lastAlertLevelSent === undefined) {
    return true;
  }
  return params.thresholdLevel < params.lastAlertLevelSent;
}

/**
 * Calcula los días calendario inclusive entre startDate y endDate (formato YYYY-MM-DD).
 * Devuelve 0 si la fecha final es anterior a la inicial o inválida.
 */
export function computeInclusiveDays(startDate: string, endDate: string): number {
  const startUtc = parseUtcDateOnly(startDate);
  const endUtc = parseUtcDateOnly(endDate);
  if (startUtc === null || endUtc === null || endUtc < startUtc) {
    return 0;
  }
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

/**
 * Calcula la duración en minutos entre dos horas HH:mm.
 * Si endTime <= startTime asume cruce de medianoche (turno nocturno).
 */
export function computeDurationMinutes(
  startTime?: string | null,
  endTime?: string | null,
): number {
  if (!startTime || !endTime) return 0;
  const startMatch = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  const endMatch = endTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!startMatch || !endMatch) return 0;

  const sh = Number(startMatch[1]);
  const sm = Number(startMatch[2]);
  const eh = Number(endMatch[1]);
  const em = Number(endMatch[2]);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return 0;

  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin > startMin) {
    return endMin - startMin;
  }
  return 24 * 60 - startMin + endMin;
}

export function formatDurationFromMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 h';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${Number(hours.toFixed(2))} h`;
}
