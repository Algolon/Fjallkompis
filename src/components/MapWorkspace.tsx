/**
 * The persistent Map workspace — the ONE host of MapScreen (and therefore of
 * the one MapLibre instance) for the whole session.
 *
 * WHY IT EXISTS. Screens() renders only the active destination, so the Map
 * used to be constructed when the user entered the tab and destroyed when
 * they left: every deliberate Map open paid MapView mount → archive
 * resolution → the MapLibre constructor → style/tile load → first useful
 * render, on the user-visible critical path. This layer inverts that: the
 * shell mounts it once — deferred, after the initial destination has
 * rendered (App.tsx) — and navigation only toggles `active`. The first Map
 * tap reveals a map that already exists; every later tap reveals the SAME
 * map. There is deliberately no general screen-cache here: content
 * destinations keep mounting normally inside the keyed <main>, because only
 * the Map carries a construction cost worth this architecture.
 *
 * GEOMETRY. The host div is position:absolute inset:0 inside .app-workspaces
 * (global.css), i.e. exactly the slot <main> occupies — so the background
 * map initializes at its real viewport size while Today is visible, and
 * activation needs no layout change at all.
 *
 * INACTIVE = INVISIBLE AND INERT, NEVER DESTROYED. visibility:hidden (kept
 * out of hit-testing, focus order and the accessibility tree, while the
 * canvas keeps its size — display:none would zero it), plus explicit
 * aria-hidden and the inert attribute as testable semantics. MapLibre only
 * repaints on demand, so a hidden idle map schedules no frames; the WebGL
 * context, tile cache and DOM markers stay warm.
 *
 * EXPLICIT REMOUNT SCOPE. `key={direction}` is the one sanctioned rebuild:
 * a walking-direction change re-derives the oriented route, and MapView
 * captures its route at mount, so the product's existing reset semantics
 * (fresh screen state, fresh camera, second constructor) happen HERE,
 * narrowly, instead of persistence accidentally keeping stale geometry.
 */
import { useEffect, useRef, type ComponentProps } from 'react';
import { MapScreen } from '../screens/MapScreen';
import {
  recordActivation,
  recordDeactivation,
  recordWorkspaceMount,
} from '../map/workspaceEvidence';

type MapScreenProps = Omit<ComponentProps<typeof MapScreen>, 'active'>;

interface MapWorkspaceProps extends MapScreenProps {
  /** The Map is the visible destination right now. */
  active: boolean;
  /** Active itinerary direction — the explicit, narrow remount key. */
  direction: string;
}

export function MapWorkspace({ active, direction, ...screenProps }: MapWorkspaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  // `inert` belt-and-braces over visibility:hidden — set imperatively so the
  // attribute is real on every React version this app passes through.
  useEffect(() => {
    if (hostRef.current) hostRef.current.inert = !active;
  }, [active]);

  // Dev evidence: one mount per content instance (a direction remount is
  // visible as mount #2), activation/deactivation transitions counted with
  // whether the map was already ready (src/map/workspaceEvidence.ts). The
  // ref makes the recorder idempotent under StrictMode's dev effect replay,
  // so the counter reports REAL mounts, not React's double-invocation.
  const recordedDirectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (recordedDirectionRef.current === direction) return;
    recordedDirectionRef.current = direction;
    recordWorkspaceMount();
  }, [direction]);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current === active) return;
    wasActiveRef.current = active;
    if (active) recordActivation();
    else recordDeactivation();
  }, [active]);

  return (
    <div
      ref={hostRef}
      className={`map-workspace${active ? ' is-active' : ''}`}
      aria-hidden={!active}
      data-map-workspace={active ? 'active' : 'inactive'}
    >
      <MapScreen key={direction} active={active} {...screenProps} />
    </div>
  );
}
