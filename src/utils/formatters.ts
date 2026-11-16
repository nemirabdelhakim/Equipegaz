const TZ = 'Africa/Algiers';

export function formatDateFr(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeFr(iso?: string): string {
  if (!iso) return 'Jamais connecté';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = formatDateFr(iso);
  const timePart = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart} · ${timePart}`;
}

export function getOrCreateDeviceId(): string {
  const key = 'sonelgaz_sa_device_id';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? `web-${crypto.randomUUID()}`
        : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, generated);
    return generated;
  } catch {
    return 'web-session';
  }
}

export function getInitials(prenom: string, nom: string): string {
  const p = (prenom || '').trim()[0] || '';
  const n = (nom || '').trim()[0] || '';
  return `${p}${n}`.toUpperCase() || 'SG';
}
