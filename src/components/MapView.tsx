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
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ROUTE } from '../route/routeData';
import type { ParsedRoute } from '../route/types';
import { buildMapStyle, routeLayers, SATELLITE_LAYER } from '../map/mapStyle';
import {
  resolveArchiveBasemap,
  resolveSatellite,
  type BasemapMode,
  type BasemapResolution,
} from '../map/pmtilesProtocol';
import { VECTOR_ARCHIVE, type ArchiveSpec } from '../map/offlineMap';
import type { LatLng } from '../types';

export interface MapViewHandle {
  /** Move/hide the elevation-scrub marker without re-rendering React. */
  setScrubPoint: (p: { lat: number; lon: number } | null) => void;
  fitRoute: () => void;
  fitStage: (stageId: string) => void;
  resetBearing: () => void;
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
  /** null → overview mode (all stages); id → stage mode. */
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
  onSelectWaypoint: (waypointId: string) => void;
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

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    route = ROUTE,
    archive = VECTOR_ARCHIVE,
    enableSatellite = true,
    selectedStageId,
    onSelectStage,
    onSelectWaypoint,
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

  // Keep latest callbacks reachable from map event handlers without rebinding.
  const callbacksRef = useRef({ onSelectStage, onSelectWaypoint, onUserInteract });
  callbacksRef.current = { onSelectStage, onSelectWaypoint, onUserInteract };
  // The dataset is captured at mount (see the route prop doc); a ref keeps
  // the imperative handle and effects reading the mounted value.
  const routeRef = useRef(route);
  const followRef = useRef(follow);
  followRef.current = follow;

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
  }));

  // ---- Create the map once ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    const markers: maplibregl.Marker[] = [];
    let resizeObs: ResizeObserver | null = null;

    const mountedRoute = routeRef.current;

    (async () => {
      const noSatellite: BasemapResolution = { mode: 'none', sourceUrl: null };
      const [basemap, satellite] = await Promise.all([
        resolveArchiveBasemap(archive),
        enableSatellite ? resolveSatellite() : Promise.resolve(noSatellite),
      ]);
      if (cancelled || !containerRef.current) return;
      onBasemapMode?.(basemap.mode);
      onSatelliteAvailable?.(satellite.sourceUrl != null);

      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(basemap.sourceUrl, satellite.sourceUrl),
        bounds: mountedRoute.bounds,
        fitBoundsOptions: { padding: FIT_PADDING },
        attributionControl: { compact: true },
        // Cap zoom to what the offline tileset actually contains (+overzoom).
        maxZoom: 17,
        minZoom: 4,
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      if (document.fullscreenEnabled) {
        map.addControl(
          new maplibregl.FullscreenControl({ container: containerRef.current }),
          'top-right',
        );
      }

      map.on('load', () => {
        if (!map) return;
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

        // Waypoints as local HTML markers (no glyphs/sprites needed).
        for (const w of mountedRoute.waypoints) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'map-wpt';
          el.setAttribute('aria-label', `${w.name} — waypoint details`);
          const isEnd = w.id.startsWith('START_') || w.id.startsWith('END_');
          el.innerHTML = `<span class="map-wpt-dot${isEnd ? ' is-end' : ''}"></span><span class="map-wpt-label">${w.name.replace('STF ', '')}</span>`;
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            callbacksRef.current.onSelectWaypoint(w.id);
          });
          markers.push(
            // Anchor at the element's center = the dot's center, so the dot
            // stays pinned to the true coordinate at every zoom; the label
            // hangs below it out of layout flow.
            new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([w.lon, w.lat])
              .addTo(map!),
          );
        }

        setLoaded(true);
      });

      resizeObs = new ResizeObserver(() => map?.resize());
      resizeObs.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      markers.forEach((m) => m.remove());
      map?.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    </div>
  );
});
