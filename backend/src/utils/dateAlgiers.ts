const ALGIERS_TIMEZONE = 'Africa/Algiers';

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateAlgiers(dateInput: string | Date): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);

  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: ALGIERS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeAlgiers(dateInput: string | Date): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);

  const datePart = formatDateAlgiers(date);
  const timePart = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ALGIERS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  return `${datePart} ${timePart}`;
}

export function todayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ALGIERS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatIsoDateToFr(isoOrYmd: string): string {
  if (!isoOrYmd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrYmd);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return formatDateAlgiers(isoOrYmd);
}
