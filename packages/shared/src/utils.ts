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
