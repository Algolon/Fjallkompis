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
} from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ROUTE } from '../route/routeData';
import { buildMapStyle, routeLayers } from '../map/mapStyle';
import { resolveBasemap, type BasemapMode } from '../map/pmtilesProtocol';
import type { LatLng } from '../types';

export interface MapViewHandle {
  /** Move/hide the elevation-scrub marker without re-rendering React. */
  setScrubPoint: (p: { lat: number; lon: number } | null) => void;
  fitRoute: () => void;
  fitStage: (stageId: string) => void;
  resetBearing: () => void;
}

interface MapViewProps {
  /** null → overview mode (all stages); id → stage mode. */
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
  onSelectWaypoint: (waypointId: string) => void;
  onBasemapMode?: (mode: BasemapMode) => void;
  gps: LatLng | null;
}

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const FIT_PADDING = { top: 40, bottom: 40, left: 32, right: 32 };

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { selectedStageId, onSelectStage, onSelectWaypoint, onBasemapMode, gps },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Keep latest callbacks reachable from map event handlers without rebinding.
  const callbacksRef = useRef({ onSelectStage, onSelectWaypoint });
  callbacksRef.current = { onSelectStage, onSelectWaypoint };

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
    fitRoute: () => fitBounds(ROUTE.bounds),
    fitStage: (stageId) => {
      const stage = ROUTE.stages.find((s) => s.id === stageId);
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

    (async () => {
      const basemap = await resolveBasemap();
      if (cancelled || !containerRef.current) return;
      onBasemapMode?.(basemap.mode);

      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(basemap.sourceUrl),
        bounds: ROUTE.bounds,
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
        map.addSource('overview', { type: 'geojson', data: ROUTE.overviewGeoJson });
        map.addSource('stages', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: ROUTE.stages.map((s) => s.geoJson) },
        });
        map.addSource('gps', { type: 'geojson', data: EMPTY_FC });
        map.addSource('scrub', { type: 'geojson', data: EMPTY_FC });
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

        // Waypoints as local HTML markers (no glyphs/sprites needed).
        for (const w of ROUTE.waypoints) {
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
            new maplibregl.Marker({ element: el, anchor: 'bottom' })
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

    const stage = ROUTE.stages.find((s) => s.id === selectedStageId);
    fitBounds(stage ? stage.bounds : ROUTE.bounds);
  }, [selectedStageId, loaded]);

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
  }, [gps, loaded]);

  return <div ref={containerRef} className="mapview" />;
});
