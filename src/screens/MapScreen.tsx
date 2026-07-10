import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { MapView, type MapViewHandle, type ImageryMode } from '../components/MapView';
import { ElevationProfile } from '../components/ElevationProfile';
import { TrackingStatusOverlay } from '../components/TrackingStatus';
import { FacilityIcon } from '../components/FacilityIcon';
import { IconLocate } from '../components/Icons';
import { useGeolocation } from '../hooks/useGeolocation';
import { useRouteTracking } from '../hooks/useRouteTracking';
import type { TrackingSession } from '../utils/trackingSession.mjs';
import {
  STOPS,
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { STAGES_BY_ID } from '../data/stages';
import {
  ROUTE,
  OVERVIEW_ELEVATION_PROFILE,
  STAGE_BY_ID,
  WAYPOINT_BY_ID,
  stopIdForWaypoint,
} from '../route/routeData';
import { facilitySummary, popupActionLabel } from '../map/stopMarkers.mjs';
import { INITIAL_MAP_VIEW_STAGE_ID } from '../map/mapDefaults.mjs';
import { STAGE_COLORS } from '../map/mapStyle';
import type { BasemapMode } from '../map/pmtilesProtocol';
import { projectOntoRoute } from '../utils/routeProgress.mjs';
import type { RouteProjection } from '../utils/routeProgress.mjs';
import { formatDistanceKm } from '../utils/format';
import type { LatLng, TrailStop } from '../types';

/** Whole metres, phrased as an approximation ("~38 m", "~640 m"). */
const approxMeters = (m: number) => `~${Math.round(m)} m`;

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

/**
 * Live-tracking progress readout. Progress comes from CURRENT-STAGE
 * projections only; the full-route status decides how a non-match is
 * explained — a hiker on another Kungsleden stage is on the mapped route,
 * never "off route" merely because the persisted stage differs.
 */
function renderLiveProgress(session: TrackingSession, stageTitle: string | null) {
  const onRouteNotStage =
    session.routeStatus === 'on-route' && !session.stageMatched;

  if (!session.progress) {
    return onRouteNotStage ? (
      <p className="card-sub" style={{ marginTop: 4 }}>
        On the mapped route, but not reliably matched to today’s stage
        {stageTitle ? ` (${stageTitle})` : ''}. Stage progress appears once you
        are on today’s section.
      </p>
    ) : (
      <p className="card-sub" style={{ marginTop: 4 }}>
        No reliable route match yet — stage progress appears once a fix lands
        close enough to today’s stage for its reported accuracy.
      </p>
    );
  }

  const accuracyM = session.lastFix?.accuracyM ?? null;
  const note = session.progressStale
    ? onRouteNotStage
      ? 'Progress frozen at the last reliable match — you are on the mapped route, but not on today’s stage right now.'
      : 'Progress frozen at the last reliable match — recent fixes were off today’s stage or too inaccurate to trust.'
    : `Live — matched to today’s stage${
        accuracyM != null ? ` · GPS accuracy ±${Math.round(accuracyM)} m` : ''
      } — approximate, not exact.`;

  return (
    <ProgressReadout
      stageTitle={stageTitle}
      completedKm={session.progress.alongKm}
      remainingKm={session.progress.remainingKm}
      percent={session.progress.percent}
      note={note}
    />
  );
}

/**
 * Anchored stop preview — the content of the map popup. A PREVIEW, not a
 * second detail screen: short name, a compact facility row (same helpers
 * and iconography as Huts & Stations) and a chevron. The whole card is one
 * button that navigates to the stop's full detail in Huts & Stations; the
 * icon row is decorative to AT, replaced by one spoken facility summary.
 */
function StopPreview({ stop, onOpen }: { stop: TrailStop; onOpen: () => void }) {
  const name = stopShortName(stop);
  const facilities = collapsedFacilities(stop, 4);
  const absences = importantAbsences(stop);
  const summaryId = `stop-preview-sum-${stop.id}`;
  return (
    <button
      type="button"
      className="stop-popup"
      aria-label={popupActionLabel(name)}
      aria-describedby={summaryId}
      onClick={onOpen}
    >
      <span className="stop-popup__row">
        <span className="stop-popup__name">{name}</span>
        <ChevronRight className="stop-popup__chevron" size={17} strokeWidth={2.2} aria-hidden />
      </span>
      {facilities.length > 0 || absences.length > 0 ? (
        <span className="stop-popup__facilities" aria-hidden>
          {facilities.map((f) => (
            <span key={f.id} className="stop-popup__fac" title={f.label}>
              <FacilityIcon id={f.id} size={14} />
            </span>
          ))}
          {absences.map((f) => (
            <span key={f.id} className="stop-popup__absence">
              <TriangleAlert size={11} strokeWidth={2.4} /> {f.label}
            </span>
          ))}
        </span>
      ) : null}
      <span id={summaryId} className="sr-only">
        {facilitySummary(
          facilities.map((f) => f.label),
          absences.map((f) => f.label),
        )}
      </span>
    </button>
  );
}

export function MapScreen({
  onOpenStop,
}: {
  /** Focused navigation: open this stop's full detail in Huts & Stations. */
  onOpenStop?: (stopId: string) => void;
}) {
  const { currentStage, setCurrentStage } = useStore();
  const geo = useGeolocation();
  const mapRef = useRef<MapViewHandle>(null);

  // Which stage the MAP is looking at (null = full-route overview). Starts
  // on the FULL ROUTE — deliberately independent of the persisted current
  // trip stage (Day 1 by default, still driving Today/tracking/progress):
  // browsing days on the map must not silently change persisted app state,
  // and a fresh install should see the whole route first. Starting live
  // tracking (below) is the one action that focuses the tracked stage.
  const [viewStageId, setViewStageId] = useState<string | null>(INITIAL_MAP_VIEW_STAGE_ID);
  const [basemapMode, setBasemapMode] = useState<BasemapMode | null>(null);
  const [imagery, setImagery] = useState<ImageryMode>('terrain');
  const [satelliteAvailable, setSatelliteAvailable] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHutId, setManualHutId] = useState<string>(STOPS[0].id);

  const viewStage = viewStageId ? STAGE_BY_ID[viewStageId] : null;
  const appStage = viewStageId ? STAGES_BY_ID[viewStageId] : null;

  // ---- Live tracking (beta, opt-in, foreground-only) ----------------------
  // Status is judged against the COMPLETE route; progress against the
  // persisted CURRENT stage only (never the stage merely browsed above).
  // Production mode: no diagnostic log, no breadcrumb (see trackingSession).
  const currentRouteStage = currentStage ? STAGE_BY_ID[currentStage.id] : null;
  const tracking = useRouteTracking({
    routePoints: ROUTE.overviewPoints,
    stagePoints: currentRouteStage?.points ?? null,
    stageId: currentStage?.id ?? null,
    keepLog: false,
    keepTrail: false,
  });
  const [follow, setFollow] = useState(false);
  const { session } = tracking;

  // Live fixes take precedence while tracking; after stopping, the last
  // live marker is kept for this screen session unless a NEWER one-shot/
  // manual position arrives.
  const liveCurrent =
    session.lastFix != null &&
    (tracking.active || geo.timestamp == null || session.lastFix.timestamp >= geo.timestamp);
  const marker = liveCurrent
    ? { lat: session.lastFix!.lat, lng: session.lastFix!.lon }
    : geo.coord;

  const startTracking = () => {
    if (!currentStage) return;
    // One position source at a time: clear one-shot/manual state so it can
    // never compete with the live session.
    geo.reset();
    setManualOpen(false);
    tracking.start();
    setFollow(true);
    // Focus the tracked stage if the user was browsing elsewhere.
    setViewStageId(currentStage.id);
  };

  const stopTracking = () => {
    tracking.stop();
    setFollow(false);
  };

  // A one-shot Locate is a deliberate "show me where I am": when the fix
  // arrives, bring the camera to it (live tracking has Follow for this).
  useEffect(() => {
    if (geo.status === 'success' && geo.coord && geo.source === 'gps' && !tracking.active) {
      mapRef.current?.centerOn(geo.coord);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.timestamp]);

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

  // The selected marker's stop, previewed in the anchored map popup. Every
  // rendered waypoint currently maps to a stop (fenced by
  // tests/map-stop-markers.test.mjs); the name-only fallback below is
  // defensive, for a future unmapped waypoint — it gets a plain preview
  // with no Huts & Stations action.
  const selectedStopId = selectedWaypointId ? stopIdForWaypoint(selectedWaypointId) : null;
  const selectedStop = selectedStopId ? STOPS_BY_ID[selectedStopId] ?? null : null;
  const selectedWaypointName = selectedWaypointId
    ? WAYPOINT_BY_ID[selectedWaypointId]?.name ?? null
    : null;

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
    <div className="screen screen--map">
      <ScreenHeader eyebrow="Route" title="Map">
        An offline basemap of the route. Tap a stage line or stop.
      </ScreenHeader>

      {/* Primary Map composition. Compact: plain blocks in DOM order (map
          card, then the route selector, then the combined summary+elevation
          card). Roomy landscape (≥ 900×500, see global.css): a map-dominant
          two-column grid — the complete map card left, .map-side right. */}
      <div className="map-layout">
        <div className="card map-card">
          <div className="map-canvas-wrap">
            <MapView
              ref={mapRef}
              selectedStageId={viewStageId}
              onSelectStage={(id) => setViewStageId(id)}
              onSelectWaypoint={(id) => setSelectedWaypointId(id)}
              selectedWaypointId={selectedWaypointId}
              onDismissWaypoint={() => setSelectedWaypointId(null)}
              waypointPopup={
                selectedStop ? (
                  <StopPreview
                    stop={selectedStop}
                    onOpen={() => {
                      setSelectedWaypointId(null);
                      onOpenStop?.(selectedStop.id);
                    }}
                  />
                ) : selectedWaypointName ? (
                  <span className="stop-popup stop-popup--plain">{selectedWaypointName}</span>
                ) : null
              }
              onBasemapMode={setBasemapMode}
              onSatelliteAvailable={setSatelliteAvailable}
              imagery={imagery}
              gps={marker}
              follow={follow}
              onUserInteract={() => setFollow(false)}
              overlay={
                tracking.active && currentStage ? (
                  <TrackingStatusOverlay
                    session={session}
                    stageLabel={`Day ${currentStage.day}`}
                  />
                ) : null
              }
            />
            <div
              className="map-layer-toggle seg"
              role="radiogroup"
              aria-label="Basemap imagery"
            >
              <button
                role="radio"
                aria-checked={imagery === 'terrain'}
                className="seg-btn"
                onClick={() => setImagery('terrain')}
              >
                Terrain
              </button>
              <button
                role="radio"
                aria-checked={imagery === 'satellite'}
                className="seg-btn"
                onClick={() => setImagery('satellite')}
                disabled={!satelliteAvailable}
                title={
                  satelliteAvailable
                    ? undefined
                    : 'Download the satellite imagery in Settings to enable this layer'
                }
              >
                Satellite
              </button>
            </div>
          </div>
          {!satelliteAvailable ? (
            <div className="banner-warn" style={{ margin: 10 }}>
              <span>🛰️</span>
              <span>
                Satellite imagery isn’t on this device yet — download it in Settings → Satellite
                imagery to use the satellite layer offline.
              </span>
            </div>
          ) : null}
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

          {/* Live tracking (beta): a second compact control row, separate
              from stage navigation above. One position source at a time —
              one-shot Locate is disabled while a live session runs. */}
          <div className="map-toolbar map-track-row">
            <button
              className="btn btn-ghost"
              onClick={geo.locate}
              disabled={tracking.active || geo.status === 'locating'}
              title={
                tracking.active
                  ? 'One-shot location is off while live tracking runs'
                  : undefined
              }
            >
              <IconLocate />
              {geo.status === 'locating' ? 'Locating…' : 'Locate'}
            </button>
            {!tracking.active ? (
              <button
                className="btn btn-primary"
                onClick={startTracking}
                disabled={!currentStage}
                title={
                  currentStage
                    ? undefined
                    : 'Select a current stage first (below, or in Stages)'
                }
              >
                ▶ Live tracking · Beta
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopTracking}>
                ■ Stop tracking
              </button>
            )}
            <button
              className="btn btn-ghost"
              aria-pressed={follow}
              onClick={() => setFollow((f) => !f)}
              disabled={!marker}
              title={marker ? undefined : 'No position yet'}
            >
              {follow ? '◉ Following' : '○ Follow'}
            </button>
          </div>
          {!currentStage ? (
            <p className="card-sub" style={{ margin: '0 12px 12px' }}>
              Live tracking (beta) follows today’s stage — select a current
              stage first with “Set as current” below, or from the Stages tab.
            </p>
          ) : null}
        </div>

        <div className="map-side">
          {/* Stage selector above the summary: a wrapping block instead of a
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

          {/* Combined stage/route summary: identity and scannable statistics
              first, the elevation profile as the detailed visual below. */}
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
            <div className="elev-section">
              <p className="elev-heading">Elevation</p>
              <ElevationProfile
                profile={profile}
                statistics={stats}
                onScrub={(s) => mapRef.current?.setScrubPoint(s ? { lat: s.lat, lon: s.lon } : null)}
              />
            </div>
          </div>

          {/* Position & progress. No raw coordinates in the normal UI — the
              marker on the map IS the position; here we show source, accuracy
              and along-stage progress. */}
          <div className="card">
            {liveCurrent && session.lastFix ? (
              <div>
                <div className="row-between">
                  <span className="muted">Position</span>
                  <span>
                    {tracking.active ? 'Live GPS' : 'Last live fix'}
                    {session.lastFix.accuracyM != null
                      ? ` · ±${Math.round(session.lastFix.accuracyM)} m`
                      : ''}
                  </span>
                </div>
                <div className="hr" />
                {renderLiveProgress(session, currentStageTitle)}
              </div>
            ) : geo.status === 'success' && geo.coord ? (
              <div>
                <div className="row-between">
                  <span className="muted">Position</span>
                  <span>
                    {geo.source === 'manual' ? 'Manual (pinned to a stop)' : 'GPS one-shot'}
                    {geo.accuracyM != null ? ` · ±${Math.round(geo.accuracyM)} m` : ''}
                  </span>
                </div>
                <div className="hr" />
                {renderProgress(progress, currentStageTitle, geo.accuracyM)}
              </div>
            ) : (
              <p className="card-sub">
                Use <strong>Locate</strong> under the map for a one-shot GPS fix, or{' '}
                <strong>Live tracking · Beta</strong> to follow today’s stage as you
                walk (foreground only — approximate, not for primary navigation).
              </p>
            )}

            {tracking.error ? (
              <p className="banner-warn" style={{ marginTop: 12 }}>
                <span>📍</span>
                <span>{tracking.error}</span>
              </p>
            ) : null}

            {geo.status === 'error' && geo.error ? (
              <p className="banner-warn" style={{ marginTop: 12 }}>
                <span>📍</span>
                <span>{geo.error}</span>
              </p>
            ) : null}

            {/* Manual fallback: available when GPS fails or nothing located yet —
                hidden entirely while a live session runs (one source at a time). */}
            {!tracking.active && (geo.status === 'error' || geo.status === 'idle') ? (
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
      </div>
    </div>
  );
}
