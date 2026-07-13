/**
 * Visual header for an expanded stop card.
 *
 * If the stop has a local, licensed image (public/images/stops/…) it is shown
 * lazily at a fixed aspect ratio (no layout shift). Otherwise a generated
 * fallback is drawn from the app's own data: the full route's elevation
 * silhouette in the app palette, with a marker at the stop's position along
 * the route — offline by construction, nothing is fetched.
 */
import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import type { TrailStop } from '../types';
import type { ElevationSample } from '../route/types';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { useStore } from '../store/AppStore';

const W = 400;
const H = 160;

/** Downsampled silhouette of the ACTIVE overview profile (rebuilt per direction). */
function useSilhouette(profile: ElevationSample[]) {
  return useMemo(() => {
    if (profile.length < 2) return null;
    const xMax = profile[0] ? profile[profile.length - 1].distanceKm : 1;
    const eles = profile.map((p) => p.elevationM);
    const yMin = Math.min(...eles);
    const yMax = Math.max(...eles);
    const sx = (d: number) => (d / xMax) * W;
    // Keep the terrain band in the lower ~60% so the pin has headroom.
    const sy = (e: number) => H - 14 - ((e - yMin) / (yMax - yMin)) * (H * 0.55);

    const buckets = 120;
    const step = profile.length / buckets;
    const pts: [number, number][] = [];
    for (let b = 0; b < buckets; b++) {
      const i = Math.min(profile.length - 1, Math.floor(b * step));
      pts.push([sx(profile[i].distanceKm), sy(profile[i].elevationM)]);
    }
    const last = profile[profile.length - 1];
    pts.push([sx(last.distanceKm), sy(last.elevationM)]);

    const line = pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join('');
    return {
      linePath: line,
      areaPath: `${line}L${W},${H}L0,${H}Z`,
      xMax,
      elevationAtKm: (km: number) => {
        // nearest sample — cheap linear scan is fine at 120 buckets scale
        let best = profile[0];
        let bestD = Infinity;
        for (let i = 0; i < profile.length; i += Math.max(1, Math.floor(step))) {
          const d = Math.abs(profile[i].distanceKm - km);
          if (d < bestD) {
            bestD = d;
            best = profile[i];
          }
        }
        return sy(best.elevationM);
      },
      sx,
    };
  }, [profile]);
}

export function StopVisual({ stop }: { stop: TrailStop }) {
  const { itinerary } = useStore();
  const sil = useSilhouette(itinerary.overviewElevationProfile);
  const routeKm = itinerary.stopDistanceKm[stop.id] ?? 0;
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const startName = startStop ? stopShortName(startStop) : 'the start';

  if (stop.image) {
    return (
      <figure className="stop-visual">
        <img
          src={stop.image.src}
          alt={stop.image.alt}
          loading="lazy"
          decoding="async"
        />
        {stop.image.credit ? (
          <figcaption className="stop-visual-credit">
            {stop.image.credit}
            {stop.image.license ? ` · ${stop.image.license}` : ''}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (!sil) return null;

  const px = sil.sx(routeKm);
  const py = sil.elevationAtKm(routeKm);

  return (
    <div
      className="stop-visual stop-visual-fallback"
      role="img"
      aria-label={`${stopShortName(stop)} — position on the route's elevation silhouette, ${routeKm.toFixed(0)} km from ${startName}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`stop-sky-${stop.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--glacier-soft)" />
            <stop offset="100%" stopColor="var(--paper-2)" />
          </linearGradient>
          <linearGradient id={`stop-terrain-${stop.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--spruce)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--spruce)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#stop-sky-${stop.id})`} />
        {/* topographic hint: faint contour bands above the silhouette */}
        {[0.18, 0.32, 0.46].map((f) => (
          <path
            key={f}
            d={sil.linePath}
            fill="none"
            stroke="var(--glacier)"
            strokeOpacity="0.14"
            strokeWidth="1"
            transform={`translate(0 ${-H * f * 0.35})`}
          />
        ))}
        <path d={sil.areaPath} fill={`url(#stop-terrain-${stop.id})`} />
        <path d={sil.linePath} fill="none" stroke="var(--spruce)" strokeWidth="1.6" />
        <line
          x1={px}
          x2={px}
          y1={py}
          y2={H}
          stroke="var(--cloudberry)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
        <circle cx={px} cy={py} r="5" fill="var(--cloudberry)" stroke="#fff" strokeWidth="2" />
      </svg>
      <span className="stop-visual-tag">
        <MapPin size={13} strokeWidth={2} aria-hidden />
        {routeKm.toFixed(0)} km from {startName}
      </span>
    </div>
  );
}
