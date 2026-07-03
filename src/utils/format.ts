import type { StopType } from '../types';

/** "12.4 km" / "850 m" depending on magnitude. */
export function formatDistanceKm(km: number): string {
  if (!isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Decimal hours -> "5 h 30 min". */
export function formatHours(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '—';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function todayIso(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function stopTypeLabel(type: StopType): string {
  switch (type) {
    case 'mountain-station':
      return 'Mountain station';
    case 'mountain-cabin':
      return 'Mountain cabin';
    case 'village':
      return 'Village';
  }
}

/** "2 July 2026" from an ISO date — for the facts-verified line on stops. */
export function formatVerifiedDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
