import type { StopType } from '../types';
import { localIsoDate } from './dateTimeField.mjs';

/** "12.4 km" / "850 m" depending on magnitude. */
export function formatDistanceKm(km: number): string {
  if (!isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Whole grams -> "980 g" / "9.40 kg" / "12.3 kg" (shared by Lists Packing
 *  and the Today Prepare card so pack weight always reads the same). */
export function formatGrams(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(g >= 10000 ? 1 : 2)} kg` : `${g} g`;
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

/** Decimal hours -> compact estimate: "±5h", "±5h30m", "±45m". */
export function formatHoursEstimate(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '—';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `±${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}`;
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

/** "2 Aug 2026" — unambiguous across season boundaries, still compact.
 *  Shared by the Trip cards and the linked-stays chooser. */
export function formatTripDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The device's local calendar date, 'YYYY-MM-DD'. The single clock read for
 * "what day is it here"; the calendar arithmetic itself lives in the pure
 * dateTimeField helper, which builds the string from local calendar parts
 * rather than from a UTC instant.
 */
export function todayIso(): string {
  return localIsoDate(new Date()) as string;
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
