import { useMemo } from 'react';
import type { LatLng } from '../types';
import { HUTS } from '../data/huts';
import { STAGES_BY_ID } from '../data/stages';
import { createFitProjector } from '../utils/geo';

const VW = 320;
const VH = 440;
const PAD = 34;

// Default label placement alternates left/right of the marker, which fails for
// the final Kebnekaise → Nikkaluokta leg (nearly horizontal, labels collide).
const LABEL_OVERRIDES: Record<
  string,
  { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }
> = {
  kebnekaise: { dx: 2, dy: 18, anchor: 'start' },
  nikkaluokta: { dx: 4, dy: -10, anchor: 'end' },
};

export function RouteMap({
  highlightStageId,
  gps,
  nextHutId,
}: {
  highlightStageId?: string | null;
  gps?: LatLng | null;
  nextHutId?: string | null;
}) {
  const projector = useMemo(() => {
    const pts: LatLng[] = HUTS.map((h) => h.coord);
    if (gps) pts.push(gps);
    return createFitProjector(pts, { width: VW, height: VH, padding: PAD });
  }, [gps]);

  const screenHuts = useMemo(
    () => HUTS.map((h) => ({ ...h, pt: projector.project(h.coord) })),
    [projector],
  );

  const routePath = useMemo(
    () => screenHuts.map((h) => `${h.pt.x.toFixed(1)},${h.pt.y.toFixed(1)}`).join(' '),
    [screenHuts],
  );

  // The highlighted segment is the polyline between the stage's from/to huts.
  const highlightSeg = useMemo(() => {
    if (!highlightStageId) return null;
    const stage = STAGES_BY_ID[highlightStageId];
    if (!stage) return null;
    const a = screenHuts.find((h) => h.id === stage.fromHutId);
    const b = screenHuts.find((h) => h.id === stage.toHutId);
    if (!a || !b) return null;
    return { a: a.pt, b: b.pt };
  }, [highlightStageId, screenHuts]);

  const gpsPt = gps ? projector.project(gps) : null;
  const nextHut = screenHuts.find((h) => h.id === nextHutId) ?? null;

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Simplified offline route map of the Kungsleden stages"
    >
      {/* Subtle graticule for depth, purely decorative */}
      <g stroke="#cfdbd6" strokeWidth="0.5" opacity="0.6">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={`h${f}`} x1={0} y1={VH * f} x2={VW} y2={VH * f} />
        ))}
        {[0.33, 0.66].map((f) => (
          <line key={`v${f}`} x1={VW * f} y1={0} x2={VW * f} y2={VH} />
        ))}
      </g>

      {/* Full route */}
      <polyline
        points={routePath}
        fill="none"
        stroke="#9fb4ab"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* GPS -> next hut helper line */}
      {gpsPt && nextHut ? (
        <line
          x1={gpsPt.x}
          y1={gpsPt.y}
          x2={nextHut.pt.x}
          y2={nextHut.pt.y}
          stroke="#2c7a8c"
          strokeWidth="1.6"
          strokeDasharray="3 4"
          opacity="0.8"
        />
      ) : null}

      {/* Highlighted stage segment */}
      {highlightSeg ? (
        <line
          x1={highlightSeg.a.x}
          y1={highlightSeg.a.y}
          x2={highlightSeg.b.x}
          y2={highlightSeg.b.y}
          stroke="#c98438"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      ) : null}

      {/* Hut markers + labels */}
      {screenHuts.map((h, i) => {
        const isNext = h.id === nextHutId;
        return (
          <g key={h.id}>
            <circle
              cx={h.pt.x}
              cy={h.pt.y}
              r={isNext ? 6.5 : 4.5}
              fill={isNext ? '#c98438' : '#2f4a3e'}
              stroke="#fafcfb"
              strokeWidth="2"
            />
            <text
              x={h.pt.x + (LABEL_OVERRIDES[h.id]?.dx ?? (i % 2 === 0 ? 10 : -10))}
              y={h.pt.y + (LABEL_OVERRIDES[h.id]?.dy ?? 3.5)}
              fontSize="10"
              fontWeight="600"
              fill="#1b2a27"
              textAnchor={
                LABEL_OVERRIDES[h.id]?.anchor ?? (i % 2 === 0 ? 'start' : 'end')
              }
            >
              {h.name}
            </text>
          </g>
        );
      })}

      {/* GPS dot last so it sits on top */}
      {gpsPt ? (
        <g>
          <circle cx={gpsPt.x} cy={gpsPt.y} r="10" fill="#2c7a8c" opacity="0.18" />
          <circle
            cx={gpsPt.x}
            cy={gpsPt.y}
            r="5"
            fill="#2c7a8c"
            stroke="#fff"
            strokeWidth="2"
          />
        </g>
      ) : null}
    </svg>
  );
}
