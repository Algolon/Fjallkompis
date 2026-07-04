import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { MapView, type MapViewHandle } from '../components/MapView';
import { ElevationProfile } from '../components/ElevationProfile';
import { IconLocate } from '../components/Icons';
import { useGeolocation } from '../hooks/useGeolocation';
import { STOPS, STOPS_BY_ID, stopShortName } from '../data/stops';
import { STAGES_BY_ID } from '../data/stages';
import {
  ROUTE,
  OVERVIEW_ELEVATION_PROFILE,
  STAGE_BY_ID,
  WAYPOINT_BY_ID,
  WAYPOINT_TO_HUT,
  WAYPOINT_ROUTE_KM,
  stagesForWaypoint,
} from '../route/routeData';
import { STAGE_COLORS } from '../map/mapStyle';
import type { BasemapMode } from '../map/pmtilesProtocol';
import { projectOntoRoute } from '../utils/routeProgress.mjs';
import type { RouteProjection } from '../utils/routeProgress.mjs';
import { formatDistanceKm } from '../utils/format';
import type { LatLng } from '../types';

/** Whole metres, phrased as an approximation ("~38 m", "~640 m"). */
const approxMeters = (m: number) => `~${Math.round(m)} m`;

type Panel = 'map' | 'elevation';

/** Along-route progress state for the GPS/manual result card. */
type Progress =
  | null // no position yet
  | { kind: 'no-stage' }
  | { kind: 'manual-start'; totalKm: number }
  | { kind: 'manual-end'; totalKm: number }
  | { kind: 'manual-unrelated'; stopName: string }
  | { kind: 'gps'; proj: RouteProjection };

/** The primary "Today's route" readout: km done, km left, %, and a barchart. */
function ProgressReadout({
  stageTitle,
  completedKm,
  remainingKm,
  percent,
  note,
}: {
  stageTitle: string | null;
  completedKm: number;
  remainingKm: number;
  percent: number;
  note: string;
}) {
  const pct = Math.round(percent);
  return (
    <div className="route-progress" style={{ marginTop: 4 }}>
      <div className="row-between">
        <span className="card-sub">Today’s route{stageTitle ? ` · ${stageTitle}` : ''}</span>
        <span className="tnum" style={{ fontWeight: 800, fontSize: 20 }}>
          {pct}%
        </span>
      </div>
      <progress
        className="map-progress"
        style={{ width: '100%', marginTop: 10 }}
        value={pct}
        max={100}
        aria-label={`Route completed: ${pct}%`}
      />
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="k">Completed</div>
          <div className="v tnum">{formatDistanceKm(completedKm)}</div>
        </div>
        <div className="stat">
          <div className="k">Remaining</div>
          <div className="v tnum">{formatDistanceKm(remainingKm)}</div>
        </div>
      </div>
      <p className="card-sub" style={{ marginTop: 10 }}>
        {note}
      </p>
    </div>
  );
}

/** Renders the along-route progress result for the current-stage position. */
function renderProgress(
  progress: Progress,
  stageTitle: string | null,
  accuracyM: number | null,
) {
  if (!progress) return null;

  if (progress.kind === 'no-stage') {
    return (
      <p className="card-sub" style={{ marginTop: 4 }}>
        Select a current stage before route progress can be calculated — set one
        with “Set as current” above, or from the Stages tab.
      </p>
    );
  }

  if (progress.kind === 'manual-unrelated') {
    return (
      <p className="banner-warn" style={{ marginTop: 4 }}>
        <span>🧭</span>
        <span>
          {progress.stopName} isn’t on your current stage
          {stageTitle ? ` (${stageTitle})` : ''}. Set that stage as current, or
          use GPS, to see progress along it.
        </span>
      </p>
    );
  }

  if (progress.kind === 'manual-start' || progress.kind === 'manual-end') {
    const atStart = progress.kind === 'manual-start';
    return (
      <ProgressReadout
        stageTitle={stageTitle}
        completedKm={atStart ? 0 : progress.totalKm}
        remainingKm={atStart ? progress.totalKm : 0}
        percent={atStart ? 0 : 100}
        note={`Pinned to the ${atStart ? 'start' : 'end'} of today’s stage — an exact stop, not a GPS estimate`}
      />
    );
  }

  // GPS projection onto the current stage.
  const { proj } = progress;
  if (!proj.ok || !proj.reliable) {
    return (
      <p className="banner-warn" style={{ marginTop: 4 }}>
        <span>📍</span>
        <span>
          Your position could not be reliably matched to the current stage
          {stageTitle ? ` (${stageTitle})` : ''}.
          {proj.ok
            ? ` Nearest mapped route point: approximately ${Math.round(proj.crossTrackM)} m away.`
            : ''}
        </span>
      </p>
    );
  }
  const accuracyNote =
    accuracyM != null ? ` · GPS accuracy ±${Math.round(accuracyM)} m` : '';
  return (
    <ProgressReadout
      stageTitle={stageTitle}
      completedKm={proj.distanceAlongKm}
      remainingKm={proj.distanceRemainingKm}
      percent={proj.percent}
      note={`Matched ${approxMeters(proj.crossTrackM)} from the mapped route${accuracyNote} — approximate, not exact.`}
    />
  );
}

export function MapScreen() {
  const { currentStage, setCurrentStage, getStopNote } = useStore();
  const geo = useGeolocation();
  const mapRef = useRef<MapViewHandle>(null);

  // Which stage the MAP is looking at (null = full-route overview). Starts at
  // the hiker's current stage but is independent of it: browsing days on the
  // map must not silently change persisted app state.
  const [viewStageId, setViewStageId] = useState<string | null>(currentStage?.id ?? null);
  const [panel, setPanel] = useState<Panel>('map');
  const [basemapMode, setBasemapMode] = useState<BasemapMode | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHutId, setManualHutId] = useState<string>(STOPS[0].id);

  const viewStage = viewStageId ? STAGE_BY_ID[viewStageId] : null;
  const appStage = viewStageId ? STAGES_BY_ID[viewStageId] : null;

  const profile = viewStage ? viewStage.elevationProfile : OVERVIEW_ELEVATION_PROFILE;
  const stats = viewStage ? viewStage.statistics : ROUTE.statistics;

  const stepStage = (dir: 1 | -1) => {
    // Order: overview → d1 … d7 → overview.
    const ids = [null, ...ROUTE.stages.map((s) => s.id)];
    const idx = ids.indexOf(viewStageId);
    setViewStageId(ids[(idx + dir + ids.length) % ids.length]);
  };

  const applyManual = () => {
    const stop = STOPS_BY_ID[manualHutId];
    if (stop) {
      const coord: LatLng = stop.coord;
      geo.setManual(coord, stop.id);
      setManualOpen(false);
    }
  };

  const waypoint = selectedWaypointId ? WAYPOINT_BY_ID[selectedWaypointId] : null;
  const waypointHutId = waypoint ? WAYPOINT_TO_HUT[waypoint.id] : null;
  const waypointNotes = waypointHutId ? getStopNote(waypointHutId) : '';
  const wpStages = waypoint ? stagesForWaypoint(waypoint.id) : null;

  const summaryTitle = useMemo(() => {
    if (!appStage) return 'Full route';
    return `Day ${appStage.day}: ${stopShortName(STOPS_BY_ID[appStage.fromHutId])} → ${stopShortName(STOPS_BY_ID[appStage.toHutId])}`;
  }, [appStage]);

  const currentStageTitle = currentStage
    ? `Day ${currentStage.day}: ${stopShortName(STOPS_BY_ID[currentStage.fromHutId])} → ${stopShortName(STOPS_BY_ID[currentStage.toHutId])}`
    : null;

  // Along-route progress is always computed against the CURRENT persisted
  // stage — never the stage merely being browsed on the map above.
  const progress = useMemo<Progress>(() => {
    if (geo.status !== 'success' || !geo.coord) return null;
    if (!currentStage) return { kind: 'no-stage' };

    const routeStage = STAGE_BY_ID[currentStage.id];
    const totalKm =
      routeStage.points[routeStage.points.length - 1]?.cumulativeDistanceKm ??
      currentStage.distanceKm;

    if (geo.source === 'manual') {
      if (geo.manualStopId === currentStage.fromHutId)
        return { kind: 'manual-start', totalKm };
      if (geo.manualStopId === currentStage.toHutId)
        return { kind: 'manual-end', totalKm };
      const stop = geo.manualStopId ? STOPS_BY_ID[geo.manualStopId] : null;
      return { kind: 'manual-unrelated', stopName: stop ? stopShortName(stop) : 'that stop' };
    }

    return {
      kind: 'gps',
      proj: projectOntoRoute(
        routeStage.points,
        { lat: geo.coord.lat, lon: geo.coord.lng },
        { accuracyM: geo.accuracyM },
      ),
    };
  }, [geo.status, geo.coord, geo.source, geo.manualStopId, geo.accuracyM, currentStage]);

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Route" title="Map" />

      {/* Map / elevation segmented control (both shown on wide screens) */}
      <div className="seg seg-map" role="tablist" aria-label="Map or elevation view">
        <button role="tab" aria-selected={panel === 'map'} className="seg-btn" onClick={() => setPanel('map')}>
          Map
        </button>
        <button
          role="tab"
          aria-selected={panel === 'elevation'}
          className="seg-btn"
          onClick={() => setPanel('elevation')}
        >
          Elevation
        </button>
      </div>

      <div className="map-elev-grid">
        <div className={`card map-card ${panel === 'map' ? '' : 'panel-hidden'}`}>
          <MapView
            ref={mapRef}
            selectedStageId={viewStageId}
            onSelectStage={(id) => setViewStageId(id)}
            onSelectWaypoint={(id) => setSelectedWaypointId(id)}
            onBasemapMode={setBasemapMode}
            gps={geo.coord}
          />
          {basemapMode === 'none' ? (
            <div className="banner-warn" style={{ margin: 10 }}>
              <span>🗺️</span>
              <span>
                Basemap unavailable — showing route on a placeholder background. Download the
                offline map in Settings while online.
              </span>
            </div>
          ) : null}
          <div className="map-toolbar">
            <button className="btn btn-ghost" onClick={() => stepStage(-1)} aria-label="Previous stage">
              ‹ Prev
            </button>
            <button
              className="btn btn-ghost"
              onClick={() =>
                viewStageId ? mapRef.current?.fitStage(viewStageId) : mapRef.current?.fitRoute()
              }
            >
              Fit {viewStageId ? 'stage' : 'route'}
            </button>
            <button className="btn btn-ghost" onClick={() => stepStage(1)} aria-label="Next stage">
              Next ›
            </button>
          </div>
        </div>

        <div className={`card ${panel === 'elevation' ? '' : 'panel-hidden'} panel-elev`}>
          <div className="row-between">
            <span className="card-title">{summaryTitle}</span>
            <span className="pill tnum">{formatDistanceKm(stats.distanceKm)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <ElevationProfile
              profile={profile}
              statistics={stats}
              onScrub={(s) => mapRef.current?.setScrubPoint(s ? { lat: s.lat, lon: s.lon } : null)}
            />
          </div>
          <p className="card-sub" style={{ marginTop: 8 }}>
            Drag across the profile to see distance & elevation — the marker follows on the map.
          </p>
        </div>
      </div>

      {/* Stage selector below the map: a wrapping block instead of a
          side-scroller, so every option is visible at once.
          (Identity = number, not colour.) */}
      <div className="stage-select" role="group" aria-label="Select stage to view">
        <button
          className="chip stage-select__full"
          aria-pressed={viewStageId === null}
          onClick={() => setViewStageId(null)}
        >
          Full route
        </button>
        {ROUTE.stages.map((s) => (
          <button
            key={s.id}
            className="chip stage-select__day"
            aria-pressed={viewStageId === s.id}
            onClick={() => setViewStageId(s.id)}
            aria-label={`Day ${s.day}`}
          >
            <span className="chip-swatch" style={{ background: STAGE_COLORS[s.day] }} />
            {s.day}
          </button>
        ))}
      </div>

      {/* Stage / route summary */}
      <div className="card">
        <div className="row-between">
          <span className="card-title">{summaryTitle}</span>
          {appStage && currentStage?.id !== appStage.id ? (
            <button className="link-btn" onClick={() => setCurrentStage(appStage.id)}>
              Set as current
            </button>
          ) : appStage ? (
            <span className="pill pill-current">Current stage</span>
          ) : null}
        </div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="k">Distance</div>
            <div className="v tnum">{formatDistanceKm(stats.distanceKm)}</div>
          </div>
          <div className="stat">
            <div className="k">Ascent / descent</div>
            <div className="v tnum" style={{ fontSize: 17 }}>
              ↗ {stats.totalAscentM ?? '—'} · ↘ {stats.totalDescentM ?? '—'} m
            </div>
          </div>
          <div className="stat">
            <div className="k">Elevation range</div>
            <div className="v tnum" style={{ fontSize: 17 }}>
              {stats.minimumElevationM != null
                ? `${Math.round(stats.minimumElevationM)}–${Math.round(stats.maximumElevationM ?? 0)} m`
                : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="k">{appStage ? 'Est. time' : 'Stages · stops'}</div>
            <div className="v tnum" style={{ fontSize: 17 }}>
              {appStage ? `~${appStage.estimatedHours} h` : `${ROUTE.stages.length} · ${ROUTE.waypoints.length}`}
            </div>
          </div>
        </div>
      </div>

      <p className="map-hint">
        GPX route on a bounded offline basemap. Tap a stage line or a stop.
      </p>

      {/* Waypoint detail panel */}
      {waypoint ? (
        <div className="card" role="region" aria-label={`Waypoint ${waypoint.name}`}>
          <div className="row-between">
            <span className="card-title">{waypoint.name}</span>
            <button className="link-btn" onClick={() => setSelectedWaypointId(null)}>
              Close
            </button>
          </div>
          <p className="card-sub" style={{ marginTop: 2 }}>
            <span className="tnum">{waypoint.id}</span>
            {waypoint.symbol ? ` · ${waypoint.symbol}` : ''}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="pill tnum">
              ⛰ {waypoint.elevation != null ? `${Math.round(waypoint.elevation)} m` : 'elevation —'}
            </span>
            <span className="pill tnum">
              {formatDistanceKm(WAYPOINT_ROUTE_KM[waypoint.id] ?? 0)} into route
            </span>
          </div>
          {wpStages ? (
            <p className="card-sub" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {wpStages.arriving ? `Arrive: day ${wpStages.arriving.day}. ` : 'Route start. '}
              {wpStages.departing ? `Depart: day ${wpStages.departing.day}.` : 'Route end.'}
            </p>
          ) : null}
          {waypointHutId && waypointNotes.trim() ? (
            <>
              <div className="hr" />
              <span className="card-sub">Your notes</span>
              <p style={{ marginTop: 6, lineHeight: 1.5 }}>{waypointNotes}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* GPS */}
      <div className="card">
        <button
          className="btn btn-glacier btn-block"
          onClick={geo.locate}
          disabled={geo.status === 'locating'}
        >
          <IconLocate />
          {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
        </button>

        {geo.status === 'success' && geo.coord ? (
          <div style={{ marginTop: 14 }}>
            <div className="row-between">
              <span className="muted">Your position</span>
              <span className="tnum">
                {geo.coord.lat.toFixed(4)}, {geo.coord.lng.toFixed(4)}
              </span>
            </div>
            <div className="hr" />
            {renderProgress(progress, currentStageTitle, geo.accuracyM)}
          </div>
        ) : null}

        {geo.status === 'error' && geo.error ? (
          <p className="banner-warn" style={{ marginTop: 12 }}>
            <span>📍</span>
            <span>{geo.error}</span>
          </p>
        ) : null}

        {geo.status === 'error' || geo.status === 'idle' ? (
          <div style={{ marginTop: 12 }}>
            {!manualOpen ? (
              <button className="btn btn-ghost btn-block" onClick={() => setManualOpen(true)}>
                Use manual mode instead
              </button>
            ) : (
              <div>
                <label className="field">
                  <span>I’m currently at</span>
                  <select
                    className="select"
                    value={manualHutId}
                    onChange={(e) => setManualHutId(e.target.value)}
                  >
                    {STOPS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {stopShortName(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={applyManual}>
                  Set position from stop
                </button>
                <p className="card-sub" style={{ marginTop: 8 }}>
                  Manual mode pins you to a stop so distances still work without GPS.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
