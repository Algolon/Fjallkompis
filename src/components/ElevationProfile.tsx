/**
 * Touch-friendly SVG elevation profile.
 *
 * - X axis: cumulative distance (km) from the full-resolution GPX profile.
 * - Y axis: raw elevation (m).
 * - The polyline is downsampled to ≤ one bucket per horizontal SVG unit for
 *   RENDERING ONLY; scrubbing and all displayed numbers use the full
 *   profile, and distances always come from the generator, never the chart.
 * - Pointer moves update the crosshair via direct DOM refs and notify the
 *   map through an rAF-throttled callback — zero React re-renders per move.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ElevationSample, RouteStatistics } from '../route/types';
import { formatDistanceKm } from '../utils/format';
import {
  CHART_W as W,
  CHART_H as H,
  PAD_L,
  PAD_R,
  PAD_T,
  PAD_B,
  viewBoxHeightFor,
  shouldUpdateViewBoxHeight,
} from './elevationViewBox.mjs';

interface Props {
  profile: ElevationSample[];
  statistics: RouteStatistics;
  /** Called (rAF-throttled) while scrubbing; null when the pointer leaves. */
  onScrub?: (sample: ElevationSample | null) => void;
}

export function ElevationProfile({ profile, statistics, onScrub }: Props) {
  const crosshairRef = useRef<SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // viewBox height follows the RENDERED box (rationale, maths and the
  // no-feedback-loop argument live in elevationViewBox.mjs, fenced by
  // tests/elevation-viewbox.test.mjs). H is the stable pre-measurement
  // fallback; the sync measure below locks the real shape before first
  // paint and the ResizeObserver keeps it current, disconnected on
  // unmount.
  const [vbH, setVbH] = useState(H);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      const next = viewBoxHeightFor(r.width, r.height);
      setVbH((prev) => (shouldUpdateViewBoxHeight(prev, next) ? next! : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const { linePath, areaPath, xMax, yMin, yMax } = useMemo(() => {
    const xMax = profile.length ? profile[profile.length - 1].distanceKm : 1;
    const eles = profile.map((p) => p.elevationM);
    let yMin = Math.min(...eles);
    let yMax = Math.max(...eles);
    const span = Math.max(yMax - yMin, 50);
    yMin = Math.floor((yMin - span * 0.08) / 10) * 10;
    yMax = Math.ceil((yMax + span * 0.08) / 10) * 10;

    // Downsample for rendering only: average per horizontal bucket.
    const buckets = Math.min(profile.length, W - PAD_L - PAD_R);
    const step = profile.length / buckets;
    const pts: [number, number][] = [];
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor(b * step);
      const to = Math.max(from + 1, Math.floor((b + 1) * step));
      let dSum = 0;
      let eSum = 0;
      let n = 0;
      for (let i = from; i < to && i < profile.length; i++) {
        dSum += profile[i].distanceKm;
        eSum += profile[i].elevationM;
        n++;
      }
      if (n > 0) pts.push([dSum / n, eSum / n]);
    }
    const last = profile[profile.length - 1];
    if (last) pts.push([last.distanceKm, last.elevationM]);

    const sx = (d: number) => PAD_L + (d / xMax) * (W - PAD_L - PAD_R);
    const sy = (e: number) => PAD_T + (1 - (e - yMin) / (yMax - yMin)) * (vbH - PAD_T - PAD_B);
    const line = pts.map(([d, e], i) => `${i === 0 ? 'M' : 'L'}${sx(d).toFixed(1)},${sy(e).toFixed(1)}`).join('');
    const area = `${line}L${sx(xMax).toFixed(1)},${vbH - PAD_B}L${PAD_L},${vbH - PAD_B}Z`;
    return { linePath: line, areaPath: area, xMax, yMin, yMax };
  }, [profile, vbH]);

  const sx = (d: number) => PAD_L + (d / xMax) * (W - PAD_L - PAD_R);
  const sy = (e: number) => PAD_T + (1 - (e - yMin) / (yMax - yMin)) * (vbH - PAD_T - PAD_B);

  /** Binary search the FULL profile for the sample nearest to distance d. */
  const nearestSample = (d: number): ElevationSample | null => {
    if (profile.length === 0) return null;
    let lo = 0;
    let hi = profile.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].distanceKm < d) lo = mid;
      else hi = mid;
    }
    return d - profile[lo].distanceKm <= profile[hi].distanceKm - d ? profile[lo] : profile[hi];
  };

  const hideScrub = () => {
    crosshairRef.current?.setAttribute('visibility', 'hidden');
    if (tipRef.current) tipRef.current.style.visibility = 'hidden';
    cancelAnimationFrame(rafRef.current);
    onScrub?.(null);
  };

  const handlePointer = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const d = Math.max(0, Math.min(xMax, ((frac * W - PAD_L) / (W - PAD_L - PAD_R)) * xMax));
    const s = nearestSample(d);
    if (!s) return;

    // Direct DOM updates — no React state involved.
    const g = crosshairRef.current;
    if (g) {
      g.setAttribute('visibility', 'visible');
      g.setAttribute('transform', `translate(${sx(s.distanceKm)},0)`);
      const dot = g.querySelector('circle');
      dot?.setAttribute('cy', String(sy(s.elevationM)));
    }
    const tip = tipRef.current;
    if (tip) {
      tip.style.visibility = 'visible';
      tip.style.left = `${Math.min(Math.max((sx(s.distanceKm) / W) * 100, 12), 88)}%`;
      tip.textContent = `${s.distanceKm.toFixed(1)} km · ${Math.round(s.elevationM)} m`;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => onScrub?.(s));
  };

  if (profile.length < 2) {
    return <p className="card-sub">No elevation data for this selection.</p>;
  }

  const start = profile[0];
  const end = profile[profile.length - 1];
  const gridEles = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="elev-wrap">
      <div className="elev-tip" ref={tipRef} aria-hidden="true" />
      <svg
        ref={svgRef}
        className="elev-svg"
        viewBox={`0 0 ${W} ${vbH}`}
        role="img"
        aria-label={`Elevation profile: ${formatDistanceKm(statistics.distanceKm)}, from ${Math.round(start.elevationM)} m to ${Math.round(end.elevationM)} m, minimum ${statistics.minimumElevationM} m, maximum ${statistics.maximumElevationM} m, total ascent ${statistics.totalAscentM} m, total descent ${statistics.totalDescentM} m`}
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          handlePointer(e.clientX);
        }}
        onPointerLeave={hideScrub}
        onPointerCancel={hideScrub}
      >
        {gridEles.map((e) => (
          <g key={e}>
            <line x1={PAD_L} x2={W - PAD_R} y1={sy(e)} y2={sy(e)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 4} y={sy(e) + 3} fontSize="9" fill="var(--ink-faint)" textAnchor="end">
              {Math.round(e)}
            </text>
          </g>
        ))}
        <text x={W - PAD_R} y={vbH - 6} fontSize="9" fill="var(--ink-faint)" textAnchor="end">
          {xMax.toFixed(0)} km
        </text>
        <text x={PAD_L} y={vbH - 6} fontSize="9" fill="var(--ink-faint)">
          0 km
        </text>

        <path d={areaPath} fill="var(--glacier-soft)" opacity="0.7" />
        <path d={linePath} fill="none" stroke="var(--glacier)" strokeWidth="1.8" />

        <g ref={crosshairRef} visibility="hidden">
          <line y1={PAD_T} y2={vbH - PAD_B} stroke="var(--ink-soft)" strokeWidth="1" strokeDasharray="3 3" />
          <circle r="4" fill="var(--glacier)" stroke="#fff" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
