import { useMemo } from 'react';
import {
  Droplets,
  Mountain,
  MountainSnow,
  Sailboat,
  Signpost,
  Snowflake,
  TreePine,
  Trees,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
  Wind,
} from 'lucide-react';
import type { StageHighlightIcon } from '../trail/activeTrailContent';
import type { ElevationSample } from '../route/types';

/**
 * Highlight icon key → lucide component (the same offline, tree-shaken icon
 * system as FacilityIcon). Every StageHighlightIcon key must appear here —
 * fenced by tests/stage-highlights.test.mjs.
 */
export const HERO_HIGHLIGHT_ICONS: Record<StageHighlightIcon, typeof Wind> = {
  wind: Wind,
  snowflake: Snowflake,
  'mountain-snow': MountainSnow,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  mountain: Mountain,
  trees: Trees,
  signpost: Signpost,
  waves: Waves,
  droplets: Droplets,
  sailboat: Sailboat,
  users: Users,
  'tree-pine': TreePine,
};

/**
 * Subtle elevation silhouette drawn behind the hero card content. The profile
 * is the ACTIVE stage's (or planned day's) oriented elevation profile, so the
 * silhouette follows the direction being walked.
 */
export function HeroSilhouette({ profile }: { profile: ElevationSample[] }) {
  const path = useMemo(() => {
    if (!profile || profile.length < 2) return null;
    const W = 400;
    const H = 120;
    const xMax = profile[profile.length - 1].distanceKm;
    const x0 = profile[0].distanceKm;
    const eles = profile.map((p) => p.elevationM);
    const yMin = Math.min(...eles);
    const yMax = Math.max(...eles);
    const sx = (d: number) => ((d - x0) / (xMax - x0)) * W;
    const sy = (e: number) => H - 6 - ((e - yMin) / (yMax - yMin || 1)) * (H - 30);
    const buckets = 90;
    const step = profile.length / buckets;
    const pts: string[] = [];
    for (let b = 0; b <= buckets; b++) {
      const i = Math.min(profile.length - 1, Math.floor(b * step));
      const p = profile[i];
      pts.push(`${b === 0 ? 'M' : 'L'}${sx(p.distanceKm).toFixed(1)},${sy(p.elevationM).toFixed(1)}`);
    }
    return { line: pts.join(''), area: `${pts.join('')}L${W},${H}L0,${H}Z`, W, H };
  }, [profile]);

  if (!path) return null;
  return (
    <svg
      className="hero-silhouette"
      viewBox={`0 0 ${path.W} ${path.H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path.area} fill="rgba(255,255,255,0.10)" />
      <path d={path.line} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
    </svg>
  );
}
