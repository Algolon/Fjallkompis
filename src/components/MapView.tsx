/**
 * MapLibre GL map with the GPX-derived route.
 *
 * Lifecycle rules (performance):
 *  - the maplibregl.Map instance is created ONCE on mount and destroyed on
 *    unmount — never recreated on React re-renders;
 *  - the pmtiles:// protocol is registered once per page (module guard in
 *    pmtilesProtocol.ts);
 *  - selection/GPS/scrub changes mutate GeoJSON sources, filters and paint
 *    properties on the existing map instead of rebuilding anything;
 *  - the elevation-profile scrub marker is driven through an imperative
 *    handle so pointer moves never re-render the React tree.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ROUTE } from '../trail/activeTrailContent';
import {
  isEndpointWaypoint,
  markerAriaLabel,
  markerLabel,
} from '../map/stopMarkers.mjs';
import type { ParsedRoute } from '../route/types';
import {
  buildMapStyle,
  routeLayers,
  SATELLITE_LAYER,
  type ReliefUrls,
} from '../map/mapStyle';
import {
  resolveArchiveBasemap,
  resolveSatellite,
  type BasemapMode,
  type BasemapResolution,
} from '../map/pmtilesProtocol';
import {
  CONTOURS_ARCHIVE,
  TERRAIN_ARCHIVE,
  VECTOR_ARCHIVE,
  type ArchiveSpec,
} from '../map/offlineMap';
import {
  cameraConstraintsFor,
  activeBoundsForZoom,
  overviewCameraFor,
  MIN_ZOOM_BACKSTOP,
  type CameraConstraints,
  type OverviewCamera,
} from '../map/cameraBounds.mjs';
import type { LatLng } from '../types';
import { BASE_MAP_PADDING } from '../map/mapPadding.mjs';
import type { MapPadding } from '../map/mapPadding.mjs';
import { shouldShowZoomControl } from '../map/mapZoomControl.mjs';
import { buildFocusFeatures } from '../map/focusFeatures.mjs';
import type { FocusRoute } from '../map/focusFeatures.mjs';

export interface MapViewHandle {
  /** Move/hide the elevation-scrub marker without re-rendering React. */
  setScrubPoint: (p: { lat: number; lon: number } | null) => void;
  fitRoute: () => void;
  fitStage: (stageId: string) => void;
  resetBearing: () => void;
  /** Ease the camera to a position (e.g. after a one-shot locate). */
  centerOn: (p: { lat: number; lng: number }) => void;
  /**
   * Temporarily highlight a single point and ease to it ("View on map"), or
   * clear it with null. A transient highlight on the 'focus' source — NOT a
   * persistent experience-marker layer. Safe to call before load (applied then).
   */
  focusPoint: (p: { lat: number; lon: number } | null) => void;
  /** Draw verified route track(s) + start/destination markers on the focus source. */
  focusRoute: (route: FocusRoute) => void;
}

/** Which basemap the user is looking at: the offline vector map or satellite. */
export type ImageryMode = 'terrain' | 'satellite';

interface MapViewProps {
  /**
   * Route dataset to render (defaults to the Kungsleden ROUTE). Captured at
   * mount — to show a different route, remount the component (e.g. with a
   * React key); GPS/selection updates never rebuild the map.
   */
  route?: ParsedRoute;
  /** Basemap archive for this route (defaults to the Kungsleden archive). */
  archive?: ArchiveSpec;
  /** Resolve/offer the satellite layer (Kungsleden only; pilot passes false). */
  enableSatellite?: boolean;
  /**
   * Resolve the optional terrain-relief archives (hillshade + contours).
   * Like satellite this degrades silently: without the archives the style
   * simply contains no relief sources or layers.
   */
  enableRelief?: boolean;
  /** null → overview mode (all stages); id → stage mode. */
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
  onSelectWaypoint: (waypointId: string) => void;
  /**
   * The waypoint whose anchored preview popup is open (controlled by the
   * caller; MapView only owns positioning, styling and close gestures).
   */
  selectedWaypointId?: string | null;
  /**
   * Map-level dismissal: empty-map click, Escape, or re-activating the
   * already-selected marker (activating the selected marker CLOSES its
   * popup — a deliberate, consistent toggle).
   */
  onDismissWaypoint?: () => void;
  /** Preview content rendered into the anchored popup for the selection. */
  waypointPopup?: ReactNode;
  onBasemapMode?: (mode: BasemapMode) => void;
  /** Fired once with whether a satellite archive is available to switch to. */
  onSatelliteAvailable?: (available: boolean) => void;
  /** 'terrain' (offline vector) or 'satellite' (offline raster PMTiles). */
  imagery: ImageryMode;
  gps: LatLng | null;
  /** Breadcrumb trail as [lon, lat] positions (live-tracking pilot). */
  trail?: [number, number][];
  /** Keep the camera on the GPS position as fixes arrive (deliberate opt-in). */
  follow?: boolean;
  /** User panned/zoomed by hand — callers use this to switch follow off. */
  onUserInteract?: () => void;
  /**
   * OPERATIONAL camera padding — the typed contract between the screen and
   * the map for fits that must clear the cockpit chrome: `fitStage`, focused
   * routes and focused points. The chrome floats OVER the map, so the screen
   * measures its own overlay bands and passes the rectangle here
   * (src/map/mapPadding.mjs builds it); MapLibre code never inspects app DOM
   * to discover what is covering it.
   */
  padding?: MapPadding;
  /**
   * OVERVIEW camera padding — used by the initial fit and `fitRoute`, and by
   * the camera-bounds constraints (which exist to make exactly that overview
   * resolve inside the coverage contract).
   *
   * Deliberately a second rectangle rather than a flag: the full-route
   * overview is a COMPOSITION, so it is horizontally balanced and reserves a
   * marker-label allowance, while operational fits stay overlay-aware. See
   * the contract in src/map/mapPadding.mjs. Falls back to `padding` when
   * absent, so a caller that supplies only one rectangle keeps the old
   * behaviour.
   */
  overviewPadding?: MapPadding;
}

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Fallback padding when the screen has not measured its overlays yet (the
 * first frames before the ResizeObserver reports). The real value arrives
 * through the `padding` prop; see src/map/mapPadding.mjs.
 */
const DEFAULT_PADDING: MapPadding = BASE_MAP_PADDING;

/**
 * Hut/cabin marker glyph — the same geometry as the Huts tab icon
 * (IconHuts in Icons.tsx), so "this is a hut or station" reads consistently
 * across the app. Built with DOM APIs from static constants only (never
 * innerHTML) and marked decorative: the button's aria-label names the stop.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * Filled hut silhouette (same proportions as the outline IconHuts): one
 * evenodd path — house pentagon with the door as a knocked-out hole, so
 * the door shows the basemap at rest and the chip colour when the
 * selected badge fills in behind it.
 */
const HUT_GLYPH_FILLED =
  'M12 3.1 20.7 10.6 V20.3 H3.3 V10.6 Z' +
  'M10.2 20.3 V15.6 Q10.2 14.7 11.1 14.7 H12.9 Q13.8 14.7 13.8 15.6 V20.3 Z';

function createHutGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', HUT_GLYPH_FILLED);
  path.setAttribute('fill-rule', 'evenodd');
  svg.appendChild(path);
  return svg;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    route = ROUTE,
    archive = VECTOR_ARCHIVE,
    enableSatellite = true,
    enableRelief = true,
    selectedStageId,
    onSelectStage,
    onSelectWaypoint,
    selectedWaypointId = null,
    onDismissWaypoint,
    waypointPopup,
    onBasemapMode,
    onSatelliteAvailable,
    imagery,
    gps,
    trail,
    follow = false,
    onUserInteract,
    padding,
    overviewPadding,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Relief availability resolved at mount (recorded for parity with the
  // other archive resolutions; the style is built once with it).
  const reliefRef = useRef<ReliefUrls | null>(null);

  // Camera-bounds state (coverage contract): the constraint set for the
  // current viewport shape, and whether the overview expansion is active.
  const constraintsRef = useRef<CameraConstraints | null>(null);
  const boundsExpandedRef = useRef(false);
  // MapLibre's own zoom control, added and removed as the container crosses
  // the width threshold (see src/map/mapZoomControl.mjs).
  const zoomControlRef = useRef<maplibregl.NavigationControl | null>(null);

  // Keep latest callbacks reachable from map event handlers without rebinding.
  const callbacksRef = useRef({
    onSelectStage,
    onSelectWaypoint,
    onDismissWaypoint,
    onUserInteract,
  });
  callbacksRef.current = { onSelectStage, onSelectWaypoint, onDismissWaypoint, onUserInteract };

  // Hut markers and their anchored preview popup. Markers are created once
  // at map load and never rebuilt on selection changes; the ONE popup
  // instance is repositioned and its content swapped through a React portal
  // into popupContentRef (so FacilityIcon etc. render in the main tree —
  // no extra React roots to leak).
  const markerElsRef = useRef(new Map<string, HTMLButtonElement>());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupContentRef = useRef<HTMLDivElement | null>(null);
  if (!popupContentRef.current) popupContentRef.current = document.createElement('div');
  // Read by marker click handlers (toggle-close on the selected marker).
  const selectedWaypointRef = useRef(selectedWaypointId);
  selectedWaypointRef.current = selectedWaypointId;
  // Keyboard activation (click with detail === 0) moves focus into the
  // popup once it opens; pointer activation deliberately leaves focus alone.
  const popupFocusPendingRef = useRef(false);
  // The dataset is captured at mount (see the route prop doc); a ref keeps
  // the imperative handle and effects reading the mounted value.
  const routeRef = useRef(route);
  // A focus requested before the map's 'load' is applied once the source exists.
  const pendingFocusRef = useRef<((map: maplibregl.Map) => void) | null>(null);
  const followRef = useRef(follow);
  followRef.current = follow;
  // Read by the map-construction effect, every fit and the constraint
  // recomputation, so they always use the CURRENT layout's padding without
  // re-creating the map. Two rectangles, two jobs (see the prop docs):
  // operational fits clear the chrome, the route overview composes.
  const paddingRef = useRef<MapPadding>(padding ?? DEFAULT_PADDING);
  paddingRef.current = padding ?? DEFAULT_PADDING;
  /** Which renderable envelope constrains the camera (set once the style resolves). */
  const coverageModeRef = useRef<'terrain' | 'satellite' | 'vector'>('vector');
  /** The solved overview camera, recomputed on demand for the current shape. */
  const overviewCameraRef = useRef<(() => OverviewCamera) | null>(null);

  const overviewPaddingRef = useRef<MapPadding>(
    overviewPadding ?? padding ?? DEFAULT_PADDING,
  );
  overviewPaddingRef.current = overviewPadding ?? padding ?? DEFAULT_PADDING;
  // Set once the map exists: re-derives the camera constraints for the
  // CURRENT viewport shape and padding (see the padding effect below).
  const applyLayoutConstraintsRef = useRef<(() => void) | null>(null);
  // The Map constructor already applies the route bounds. The first selection
  // effect only needs to set filters; re-fitting the same overview bounds was
  // causing a visible 700ms camera nudge whenever the Map screen mounted.
  const selectionCameraInitializedRef = useRef(false);

  const animate = () => ({ duration: prefersReducedMotion() ? 0 : 700 });

  // Drive the transient 'focus' highlight (returns false if the source isn't
  // ready yet — the caller then defers to the 'load' handler).
  const applyFocus = (
    map: maplibregl.Map,
    p: { lat: number; lon: number } | null,
  ): boolean => {
    const src = map.getSource('focus') as GeoJSONSource | undefined;
    if (!src) return false;
    src.setData(
      p
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
                properties: {},
              },
            ],
          }
        : EMPTY_FC,
    );
    if (p) {
      map.easeTo({
        center: [p.lon, p.lat],
        zoom: Math.max(map.getZoom(), 12.5),
        // Centre inside the VISIBLE band, not under the status dock.
        padding: paddingRef.current,
        ...animate(),
      });
    }
    return true;
  };

  // Draw one or more verified tracks + start/destination Point markers
  // (buildFocusFeatures deliberately keeps separate legs separate), framed to
  // all supplied geometry. Non-persistent — the same transient focus source.
  const applyFocusRoute = (map: maplibregl.Map, route: FocusRoute): boolean => {
    const src = map.getSource('focus') as GeoJSONSource | undefined;
    const tracks = route.tracks?.length ? route.tracks : route.track ? [route.track] : [];
    if (!src || tracks.every((track) => track.length === 0)) return false;
    src.setData(buildFocusFeatures(route) as FeatureCollection);
    const b = new maplibregl.LngLatBounds();
    for (const track of tracks) {
      for (const t of track) b.extend([t.lng, t.lat]);
    }
    map.fitBounds(b, { padding: paddingRef.current, maxZoom: 15, ...animate() });
    return true;
  };

  /**
   * The ONE place a bounds-fit is issued, so the two padding contracts can
   * never drift apart between call sites.
   *
   *  - 'overview' — the whole route: balanced, label-safe composition;
   *  - 'content'  — a stage or focused geometry: clears the cockpit chrome.
   */
  const fitBounds = (
    bounds: [[number, number], [number, number]],
    mode: 'overview' | 'content',
  ) => {
    const pad = mode === 'overview' ? overviewPaddingRef.current : paddingRef.current;
    mapRef.current?.fitBounds(bounds, { padding: pad, ...animate() });
  };

  useImperativeHandle(ref, () => ({
    setScrubPoint(p) {
      const src = mapRef.current?.getSource('scrub') as GeoJSONSource | undefined;
      src?.setData(
        p
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
                },
              ],
            }
          : EMPTY_FC,
      );
    },
    // Literally the same computation as the constructor's initial fit, so
    // "Fit route" always lands on the camera the map opened with.
    fitRoute: () => {
      const solved = overviewCameraRef.current?.();
      if (!solved || !mapRef.current) return;
      mapRef.current.easeTo({
        center: [solved.camera.lng, solved.camera.lat],
        zoom: solved.camera.zoom,
        ...animate(),
      });
    },
    fitStage: (stageId) => {
      const stage = routeRef.current.stages.find((s) => s.id === stageId);
      if (stage) fitBounds(stage.bounds, 'content');
    },
    resetBearing: () => mapRef.current?.resetNorthPitch(animate()),
    focusPoint: (p) => {
      const map = mapRef.current;
      if (map && applyFocus(map, p)) pendingFocusRef.current = null;
      else pendingFocusRef.current = (m) => applyFocus(m, p);
    },
    focusRoute: (route) => {
      const map = mapRef.current;
      if (map && applyFocusRoute(map, route)) pendingFocusRef.current = null;
      else pendingFocusRef.current = (m) => applyFocusRoute(m, route);
    },
    centerOn: (p) => {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({
        center: [p.lng, p.lat],
        // Zoom in for a useful "where am I" view, but never zoom OUT on the
        // user or fight a level they already chose.
        zoom: Math.max(map.getZoom(), 13),
        ...animate(),
      });
    },
  }));

  // ---- Create the map once ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    const markers: maplibregl.Marker[] = [];
    let resizeObs: ResizeObserver | null = null;

    const mountedRoute = routeRef.current;

    (async () => {
      const none: BasemapResolution = { mode: 'none', sourceUrl: null };
      const [basemap, satellite, terrain, contours] = await Promise.all([
        resolveArchiveBasemap(archive),
        enableSatellite ? resolveSatellite() : Promise.resolve(none),
        enableRelief ? resolveArchiveBasemap(TERRAIN_ARCHIVE) : Promise.resolve(none),
        enableRelief ? resolveArchiveBasemap(CONTOURS_ARCHIVE) : Promise.resolve(none),
      ]);
      if (cancelled || !containerRef.current) return;
      onBasemapMode?.(basemap.mode);
      onSatelliteAvailable?.(satellite.sourceUrl != null);
      reliefRef.current = {
        terrainSourceUrl: terrain.sourceUrl,
        contoursSourceUrl: contours.sourceUrl,
      };

      // Bounded route product (0.15.0): the camera is fenced to the coverage
      // contract's user bounds; wide viewports get the overview expansion so
      // "Fit route" always works (src/map/cameraBounds.mjs has the design).
      // The initial view IS the route overview, so start on the expanded
      // bounds when this viewport needs them; the zoomend handler below
      // tightens to the strict user bounds as soon as the user zooms in.
      // The constraints exist so the ROUTE OVERVIEW resolves inside the
      // coverage contract, so they are derived from the overview padding —
      // the same rectangle the fit they have to permit will use.
      // Which renderable envelope the camera must respect. In Terrain mode
      // the whole visible viewport has to stay inside the hillshade
      // footprint — an unshaded flank is not an acceptable trade for a
      // perfectly centred route — so the mode decides the contract.
      const coverageMode: 'terrain' | 'satellite' | 'vector' =
        terrain.sourceUrl != null
          ? 'terrain'
          : satellite.sourceUrl != null
            ? 'satellite'
            : 'vector';
      coverageModeRef.current = coverageMode;

      const computeOverviewCamera = () =>
        overviewCameraFor({
          routeBounds: mountedRoute.bounds,
          userBounds: mountedRoute.userBounds,
          cutoutBounds: mountedRoute.mapCutoutBounds,
          viewportWidth: containerRef.current?.clientWidth ?? 1,
          viewportHeight: containerRef.current?.clientHeight ?? 1,
          padding: overviewPaddingRef.current,
          mode: coverageModeRef.current,
        });
      overviewCameraRef.current = computeOverviewCamera;

      // maxBounds at overview zoom is the ACTIVE MODE'S renderable envelope,
      // not the vector one: panning must not reach unshaded ground either.
      // Zooming in past the threshold still snaps to the strict interaction
      // bounds, which sit well inside every mode's coverage.
      const computeConstraints = (): CameraConstraints => {
        const base = cameraConstraintsFor({
          userBounds: mountedRoute.userBounds,
          routeBounds: mountedRoute.bounds,
          dataBounds: mountedRoute.mapCutoutBounds,
          viewportWidth: containerRef.current?.clientWidth ?? 1,
          viewportHeight: containerRef.current?.clientHeight ?? 1,
          padding: overviewPaddingRef.current,
        });
        return { ...base, overviewBounds: computeOverviewCamera().overviewBounds };
      };
      constraintsRef.current = computeConstraints();
      boundsExpandedRef.current = constraintsRef.current.overviewBounds != null;
      const initialCamera = computeOverviewCamera();
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(basemap.sourceUrl, satellite.sourceUrl, reliefRef.current),
        // The initial view IS the full-route overview, and it is applied as a
        // SOLVED camera rather than a bounds-fit: the composition is a
        // constrained fit (route-centred, then translated back inside the
        // renderable envelope), which fitBounds cannot express. Giving
        // MapLibre the answer directly is what keeps it to one settled move —
        // no fit, then nudge.
        center: [initialCamera.camera.lng, initialCamera.camera.lat],
        zoom: initialCamera.camera.zoom,
        attributionControl: { compact: true },
        // Cap zoom to what the offline tileset actually contains (+overzoom).
        maxZoom: 17,
        // maxBounds is the operative floor (it stops zoom-out once the
        // viewport spans the bounds); the backstop only guards degenerate
        // viewport sizes during layout.
        minZoom: MIN_ZOOM_BACKSTOP,
        maxBounds: (boundsExpandedRef.current
          ? constraintsRef.current.overviewBounds!
          : constraintsRef.current.interactionBounds) as maplibregl.LngLatBoundsLike,
        // NOTE: overviewBounds is the active mode's renderable envelope, so
        // panning at overview zoom cannot reach unshaded ground either.
        // North-up product policy: rotation gestures are disabled (the map
        // is a route companion; a rotated frame costs orientation and would
        // let viewport corners peek past the bounds contract), and pitch is
        // off entirely — a pitched horizon is the one way to see beyond
        // maxBounds.
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      mapRef.current = map;
      if (import.meta.env.DEV) {
        // Dev-only handle for map-style validation (the benchmark cameras in
        // docs/maps/thunderforest-outdoors-benchmark.md §2): lets reviewers
        // jump the camera to the test locations from the console. Stripped
        // from builds.
        const dev = window as unknown as Record<string, unknown>;
        dev.__fjallkompisMap = map;
        // Settled camera moves since mount. The framing evidence harness
        // asserts ONE settled move for the initial overview — a fit-then-
        // nudge or a correction loop shows up here as a second.
        dev.__fjallkompisCameraMoves = 0;
        map.on('moveend', () => {
          dev.__fjallkompisCameraMoves = (dev.__fjallkompisCameraMoves as number) + 1;
        });
      }

      // Swap between the strict user bounds and the overview expansion as
      // the camera crosses the viewport-specific threshold (hysteresis in
      // activeBoundsForZoom prevents oscillation while animations settle).
      const applyCameraBounds = () => {
        const c = constraintsRef.current;
        if (!map || !c) return;
        const next = activeBoundsForZoom(c, map.getZoom(), boundsExpandedRef.current);
        if (next.expanded !== boundsExpandedRef.current) {
          boundsExpandedRef.current = next.expanded;
          map.setMaxBounds(next.bounds as maplibregl.LngLatBoundsLike);
        }
      };
      map.on('zoomend', applyCameraBounds);
      // Viewport shape changed (rotation, layout, tab switch): recompute the
      // constraint set for the new shape and re-apply immediately. Seeded
      // from the EXPANDED side deliberately: when a viewport suddenly grows
      // wider, MapLibre clamps the zoom against the old strict bounds
      // before this handler runs, parking the camera exactly at the new
      // threshold — evaluating from the expanded side keeps the overview
      // reachable there, while a camera genuinely zoomed in past the
      // threshold still tightens to the strict user bounds.
      const applyLayoutConstraints = () => {
        if (!map) return;
        constraintsRef.current = computeConstraints();
        const next = activeBoundsForZoom(constraintsRef.current, map.getZoom(), true);
        boundsExpandedRef.current = next.expanded;
        map.setMaxBounds(next.bounds as maplibregl.LngLatBoundsLike);
      };
      map.on('resize', applyLayoutConstraints);
      // The same recomputation is needed when the OVERLAYS change size (the
      // status dock grows a line, the tracking warning appears): the
      // constraint set is a function of viewport shape AND padding.
      applyLayoutConstraintsRef.current = applyLayoutConstraints;

      // Zoom buttons are for POINTERS, and only where they fit: the policy
      // (both gates, and the measured width threshold) lives in the pure
      // module. Anchored bottom-right so the top-right control stack owns
      // that edge; no compass — bearing is locked north-up.
      //
      // Kept in sync with the CONTAINER, not just the window: the map's own
      // 'resize' fires whenever the workspace changes shape, so the control
      // appears and disappears as the layout crosses the threshold.
      const syncZoomControl = () => {
        if (!map) return;
        const show = shouldShowZoomControl({
          mapWidth: containerRef.current?.clientWidth ?? 0,
          finePointer:
            window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false,
        });
        if (show && !zoomControlRef.current) {
          zoomControlRef.current = new maplibregl.NavigationControl({ showCompass: false });
          map.addControl(zoomControlRef.current, 'bottom-right');
        } else if (!show && zoomControlRef.current) {
          map.removeControl(zoomControlRef.current);
          zoomControlRef.current = null;
        }
      };
      syncZoomControl();
      map.on('resize', syncZoomControl);
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      // MapLibre's native fullscreen control is deliberately NOT added:
      // the Map destination is already a viewport-filling workspace, and
      // the browser's fullscreen mode would take the persistent bottom
      // navigation off screen with it.

      map.on('load', () => {
        if (!map) return;

        // MapLibre's compact attribution starts EXPANDED on load; collapse
        // it so the credits don't cover the map. The ⓘ button (a native
        // <details>/<summary> toggle) re-opens it on demand, and the full
        // credits remain in Settings → Data sources & credits.
        const attrib = containerRef.current?.querySelector(
          'details.maplibregl-ctrl-attrib',
        );
        attrib?.removeAttribute('open');
        attrib?.classList.remove('maplibregl-compact-show');

        map.addSource('overview', { type: 'geojson', data: mountedRoute.overviewGeoJson });
        map.addSource('stages', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: mountedRoute.stages.map((s) => s.geoJson),
          },
        });
        map.addSource('gps', { type: 'geojson', data: EMPTY_FC });
        map.addSource('scrub', { type: 'geojson', data: EMPTY_FC });
        map.addSource('trail', { type: 'geojson', data: EMPTY_FC });
        map.addSource('focus', { type: 'geojson', data: EMPTY_FC });
        for (const layer of routeLayers()) map.addLayer(layer);

        // Apply a focus requested before load ("View on map" arrives with the map).
        if (pendingFocusRef.current) {
          pendingFocusRef.current(map);
          pendingFocusRef.current = null;
        }

        // Tap a stage line to select it.
        map.on('click', 'route-stages-hit', (e: MapLayerMouseEvent) => {
          const stageId = e.features?.[0]?.properties?.stageId;
          if (typeof stageId === 'string') callbacksRef.current.onSelectStage(stageId);
        });
        // Any canvas click (empty map or a stage line) dismisses the stop
        // popup; marker clicks stopPropagation and never reach the canvas.
        map.on('click', () => callbacksRef.current.onDismissWaypoint?.());
        map.on('mouseenter', 'route-stages-hit', () => {
          map!.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'route-stages-hit', () => {
          map!.getCanvas().style.cursor = '';
        });

        // A hand pan/zoom means the user wants manual control — let the
        // caller switch follow mode off. Only user-originated events carry
        // originalEvent, so programmatic easeTo/fitBounds never trigger it.
        const userMoved = (e: { originalEvent?: unknown }) => {
          if (e.originalEvent) callbacksRef.current.onUserInteract?.();
        };
        map.on('dragstart', userMoved);
        map.on('zoomstart', userMoved);

        // Every mapped waypoint is a hut/station stop: render it as a hut
        // marker (local DOM, no glyphs/sprites, no innerHTML — the name is
        // set via textContent). The 44×44 button is the touch target; the
        // visible glyph sits centred inside it, so anchor:'center' keeps the
        // badge pinned to the true coordinate at every zoom. Subpixel
        // positioning avoids one-pixel rounding jumps during camera updates.
        for (const w of mountedRoute.waypoints) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = `map-hut${isEndpointWaypoint(w.id) ? ' is-end' : ''}`;
          el.setAttribute('aria-label', markerAriaLabel(w.name));
          const badge = document.createElement('span');
          badge.className = 'map-hut__badge';
          badge.appendChild(createHutGlyph());
          const label = document.createElement('span');
          label.className = 'map-hut__label';
          label.textContent = markerLabel(w.name);
          el.append(badge, label);
          el.addEventListener('click', (ev) => {
            ev.stopPropagation(); // never select the stage line underneath
            if (selectedWaypointRef.current === w.id) {
              // Deliberate toggle: activating the selected marker closes
              // its popup (matches the empty-map/Escape close gestures).
              callbacksRef.current.onDismissWaypoint?.();
            } else {
              // detail === 0 → keyboard (Enter/Space) activation.
              popupFocusPendingRef.current = ev.detail === 0;
              callbacksRef.current.onSelectWaypoint(w.id);
            }
          });
          markerElsRef.current.set(w.id, el);
          markers.push(
            new maplibregl.Marker({
              element: el,
              anchor: 'center',
              subpixelPositioning: true,
            })
              .setLngLat([w.lon, w.lat])
              .addTo(map!),
          );
        }

        // ONE anchored preview popup, reused across selections. Dynamic
        // anchoring (no fixed anchor) prefers "above the marker" and
        // repositions automatically to stay inside the map view; the offset
        // clears the marker badge. Visibility is fully state-controlled
        // (closeOnClick off — the canvas click handler above owns that),
        // and the content element is a React portal target.
        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 26,
          maxWidth: '272px',
          focusAfterOpen: false,
          className: 'stop-popup-anchor',
        }).setDOMContent(popupContentRef.current!);

        setLoaded(true);
      });

      resizeObs = new ResizeObserver(() => map?.resize());
      resizeObs.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      markerElsRef.current.clear();
      markers.forEach((m) => m.remove());
      // The map takes its controls with it; just drop our handle.
      zoomControlRef.current = null;
      map?.remove();
      mapRef.current = null;
      applyLayoutConstraintsRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Stop selection: marker styling + anchored popup ---------------------
  // Mutates classes on the stable marker elements and repositions the one
  // popup instance — markers and map are never rebuilt for a selection.
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !loaded || !popup) return;

    markerElsRef.current.forEach((el, id) =>
      el.classList.toggle('is-selected', id === selectedWaypointId),
    );

    const w = selectedWaypointId
      ? routeRef.current.waypoints.find((x) => x.id === selectedWaypointId)
      : null;
    if (!w) {
      popup.remove();
      return;
    }
    popup.setLngLat([w.lon, w.lat]);
    if (!popup.isOpen()) popup.addTo(map);
    if (popupFocusPendingRef.current) {
      popupFocusPendingRef.current = false;
      // The portal content committed with this render; focus its action
      // after the popup has been positioned.
      requestAnimationFrame(() =>
        popupContentRef.current?.querySelector('button')?.focus(),
      );
    }
  }, [selectedWaypointId, loaded]);

  // ---- Escape closes the stop popup -----------------------------------------
  useEffect(() => {
    if (!selectedWaypointId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const marker = markerElsRef.current.get(selectedWaypointId);
      const focusWasInPopup =
        popupContentRef.current?.contains(document.activeElement) ?? false;
      callbacksRef.current.onDismissWaypoint?.();
      // Keyboard users return to the marker they came from.
      if (focusWasInPopup) marker?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedWaypointId]);

  // ---- Selection: update filters/paint + camera, never rebuild ------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const sel = selectedStageId ?? '';
    map.setFilter('route-stage-selected-casing', ['==', ['get', 'stageId'], sel]);
    map.setFilter('route-stage-selected', ['==', ['get', 'stageId'], sel]);
    // Stage mode: fade non-selected stages to context lines.
    map.setPaintProperty(
      'route-stages',
      'line-opacity',
      sel === '' ? 0.9 : ['case', ['==', ['get', 'stageId'], sel], 0, 0.25],
    );

    const stage = routeRef.current.stages.find((s) => s.id === selectedStageId);
    if (!selectionCameraInitializedRef.current) {
      selectionCameraInitializedRef.current = true;
      // The constructor already fitted the overview. Skip only that duplicate
      // initial overview fit; a component mounted directly into stage mode
      // still needs to fit the selected stage once.
      if (!stage) return;
    }
    fitBounds(
      stage ? stage.bounds : routeRef.current.bounds,
      stage ? 'content' : 'overview',
    );
  }, [selectedStageId, loaded]);

  // ---- Layout padding changed: re-derive the camera constraints -----------
  // The camera itself is deliberately left where the user put it — a taller
  // status dock must never yank the view. The next fit uses the new padding.
  useEffect(() => {
    applyLayoutConstraintsRef.current?.();
  }, [
    padding?.top,
    padding?.right,
    padding?.bottom,
    padding?.left,
    // The constraints are derived from the OVERVIEW rectangle, so they have
    // to be re-derived when that one changes too.
    overviewPadding?.top,
    overviewPadding?.right,
    overviewPadding?.bottom,
    overviewPadding?.left,
    loaded,
  ]);

  // ---- Basemap imagery toggle (terrain vs satellite) ----------------------
  useEffect(() => {
    const map = mapRef.current;
    // The satellite layer only exists when an archive was resolved; toggling
    // is a no-op otherwise (the UI disables the option in that case).
    if (!map || !loaded || !map.getLayer(SATELLITE_LAYER)) return;
    map.setLayoutProperty(
      SATELLITE_LAYER,
      'visibility',
      imagery === 'satellite' ? 'visible' : 'none',
    );
  }, [imagery, loaded]);

  // ---- GPS dot -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource('gps') as GeoJSONSource | undefined;
    src?.setData(
      gps
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [gps.lng, gps.lat] },
              },
            ],
          }
        : EMPTY_FC,
    );
    // Deliberate follow mode only — never recenter on every fix by default.
    if (gps && followRef.current) {
      map.easeTo({
        center: [gps.lng, gps.lat],
        duration: prefersReducedMotion() ? 0 : 500,
      });
    }
  }, [gps, loaded]);

  // ---- Follow toggled on: snap to the latest fix immediately ---------------
  // (Subsequent fixes are handled by the GPS effect above.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !follow || !gps) return;
    // A programmatic move already in flight owns the camera: "Resume
    // following" centres on the latest fix (and zooms in for a useful view)
    // and then turns follow on in the same commit — this snap would
    // otherwise cancel that ease and leave the camera at the old zoom.
    if (map.isMoving()) return;
    map.easeTo({
      center: [gps.lng, gps.lat],
      duration: prefersReducedMotion() ? 0 : 500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, loaded]);

  // ---- Breadcrumb trail (live tracking) ------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource('trail') as GeoJSONSource | undefined;
    src?.setData(
      trail && trail.length >= 2
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: trail },
              },
            ],
          }
        : EMPTY_FC,
    );
  }, [trail, loaded]);

  // MapLibre appends its canvas as a child of this element, so React-managed
  // children (the portalled popup content) coexist safely with it. The
  // cockpit chrome is composed by MapScreen OUTSIDE the map container, over
  // the same positioning context.
  return (
    <div ref={containerRef} className="mapview">
      {/* Anchored-popup content: portalled into the MapLibre popup element
          so it tracks the coordinate and still renders in THIS React tree
          (shared context, no extra roots). */}
      {createPortal(waypointPopup ?? null, popupContentRef.current!)}
    </div>
  );
});
