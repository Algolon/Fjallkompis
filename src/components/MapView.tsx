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
import { ROUTE } from '../route/routeData';
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
  MIN_ZOOM_BACKSTOP,
  type CameraConstraints,
} from '../map/cameraBounds.mjs';
import type { LatLng } from '../types';

export interface MapViewHandle {
  /** Move/hide the elevation-scrub marker without re-rendering React. */
  setScrubPoint: (p: { lat: number; lon: number } | null) => void;
  fitRoute: () => void;
  fitStage: (stageId: string) => void;
  resetBearing: () => void;
  /** Ease the camera to a position (e.g. after a one-shot locate). */
  centerOn: (p: { lat: number; lng: number }) => void;
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
   * Compact status UI rendered INSIDE the map container, so it remains
   * visible in fullscreen mode (the FullscreenControl fullscreens this
   * element). Positioned by .map-status-stack to avoid MapLibre controls.
   */
  overlay?: ReactNode;
}

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const FIT_PADDING = { top: 40, bottom: 40, left: 32, right: 32 };

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
    overlay,
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
  const followRef = useRef(follow);
  followRef.current = follow;
  // The Map constructor already applies the route bounds. The first selection
  // effect only needs to set filters; re-fitting the same overview bounds was
  // causing a visible 700ms camera nudge whenever the Map screen mounted.
  const selectionCameraInitializedRef = useRef(false);

  const animate = () => ({ duration: prefersReducedMotion() ? 0 : 700 });

  const fitBounds = (bounds: [[number, number], [number, number]]) => {
    mapRef.current?.fitBounds(bounds, { padding: FIT_PADDING, ...animate() });
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
    fitRoute: () => fitBounds(routeRef.current.bounds),
    fitStage: (stageId) => {
      const stage = routeRef.current.stages.find((s) => s.id === stageId);
      if (stage) fitBounds(stage.bounds);
    },
    resetBearing: () => mapRef.current?.resetNorthPitch(animate()),
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
      const computeConstraints = (): CameraConstraints =>
        cameraConstraintsFor({
          userBounds: mountedRoute.userBounds,
          routeBounds: mountedRoute.bounds,
          dataBounds: mountedRoute.mapCutoutBounds,
          viewportWidth: containerRef.current?.clientWidth ?? 1,
          viewportHeight: containerRef.current?.clientHeight ?? 1,
          padding: FIT_PADDING,
        });
      constraintsRef.current = computeConstraints();
      boundsExpandedRef.current = constraintsRef.current.overviewBounds != null;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(basemap.sourceUrl, satellite.sourceUrl, reliefRef.current),
        bounds: mountedRoute.bounds,
        fitBoundsOptions: { padding: FIT_PADDING },
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
        (window as unknown as Record<string, unknown>).__fjallkompisMap = map;
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
      // Viewport shape changed (fullscreen, rotation, layout): recompute the
      // constraint set for the new shape and re-apply immediately. Seeded
      // from the EXPANDED side deliberately: when a viewport suddenly grows
      // wider, MapLibre clamps the zoom against the old strict bounds
      // before this handler runs, parking the camera exactly at the new
      // threshold — evaluating from the expanded side keeps the overview
      // reachable there, while a camera genuinely zoomed in past the
      // threshold still tightens to the strict user bounds.
      map.on('resize', () => {
        if (!map) return;
        constraintsRef.current = computeConstraints();
        const next = activeBoundsForZoom(constraintsRef.current, map.getZoom(), true);
        boundsExpandedRef.current = next.expanded;
        map.setMaxBounds(next.bounds as maplibregl.LngLatBoundsLike);
      });

      // No compass: bearing is locked north-up (rotation disabled above).
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'top-right',
      );
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      if (document.fullscreenEnabled) {
        map.addControl(
          new maplibregl.FullscreenControl({ container: containerRef.current }),
          'top-right',
        );
      }

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
        for (const layer of routeLayers()) map.addLayer(layer);

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
      map?.remove();
      mapRef.current = null;
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
  // In fullscreen the browser consumes Escape to exit fullscreen (never
  // prevented here); the popup stays open through the transition and the
  // NEXT Escape — now outside fullscreen — closes it. Documented behaviour.
  useEffect(() => {
    if (!selectedWaypointId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.fullscreenElement) return;
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
    fitBounds(stage ? stage.bounds : routeRef.current.bounds);
  }, [selectedStageId, loaded]);

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

  // The overlay lives inside the map container: MapLibre appends its canvas
  // as a sibling child, so React-managed children coexist safely, and the
  // FullscreenControl fullscreens exactly this element — the overlay stays
  // visible in fullscreen.
  return (
    <div ref={containerRef} className="mapview">
      {overlay}
      {/* Anchored-popup content: portalled into the MapLibre popup element
          so it tracks the coordinate, works in fullscreen, and still renders
          in THIS React tree (shared context, no extra roots). */}
      {createPortal(waypointPopup ?? null, popupContentRef.current!)}
    </div>
  );
});
