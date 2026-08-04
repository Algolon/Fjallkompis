import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { MapView, type MapViewHandle, type ImageryMode } from '../components/MapView';
import { TrackingStatusOverlay } from '../components/TrackingStatus';
import { MapScopeControl, type ScopeOption } from '../components/MapScopeControl';
import { MapControlStack } from '../components/MapControlStack';
import { MapStatusDock, MapStatusSheet } from '../components/MapStatusDock';
import { FacilityIcon } from '../components/FacilityIcon';
import { useGeolocation } from '../hooks/useGeolocation';
import { useRouteTracking } from '../hooks/useRouteTracking';
import type { TrackingSession } from '../utils/trackingSession.mjs';
import {
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { WAYPOINT_BY_ID, stopIdForWaypoint } from '../route/routeData';
import { facilitySummary, popupActionLabel } from '../map/stopMarkers.mjs';
import type { BasemapMode } from '../map/pmtilesProtocol';
import { cameraPaddingFor } from '../map/mapPadding.mjs';
import type { MapPadding } from '../map/mapPadding.mjs';
import { dockStatus } from '../map/mapDockState.mjs';
import {
  FULL_ROUTE_LABEL,
  scopeMismatch,
  scopePillLabel,
  stageScopeLabel,
  stageShortLabel,
} from '../map/mapScope.mjs';
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
        Select a current stage before route progress can be calculated — set
        one on the Stages tab.
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
  viewStageId,
  onViewStageChange,
  onOpenStop,
  focus,
}: {
  viewStageId: string | null;
  onViewStageChange: (stageId: string | null) => void;
  /** Focused navigation: open this stop's full detail in Huts & Stations. */
  onOpenStop?: (stopId: string) => void;
  /** One-shot "View on map": geometry-aware temporary highlight (verified only). */
  focus?: {
    kind: 'point' | 'route' | 'stage';
    stageId: string;
    label: string;
    coord?: LatLng;
    track?: LatLng[];
    tracks?: LatLng[][];
    start?: LatLng;
    destination?: LatLng;
    note?: string;
  } | null;
}) {
  const { itinerary, currentStage } = useStore();
  const route = itinerary.route;
  const geo = useGeolocation();
  const mapRef = useRef<MapViewHandle>(null);

  // Which stage the MAP is looking at (null = full-route overview). App owns
  // this as in-memory browse state: a fresh app starts on the full route, but
  // Today → View route and Map selector choices survive tab switches until
  // refresh. It stays deliberately independent of the persisted current trip
  // stage except for explicit focus actions below.
  const setViewStageId = onViewStageChange;
  const [basemapMode, setBasemapMode] = useState<BasemapMode | null>(null);
  const [imagery, setImagery] = useState<ImageryMode>('terrain');
  const [satelliteAvailable, setSatelliteAvailable] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHutId, setManualHutId] = useState<string>(
    itinerary.orderedStops[0]?.id ?? '',
  );
  // The status dock's details sheet (position, progress, live tracking,
  // manual fallback) — opened from the dock, never permanently in front of
  // the map.
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ---- Layout-aware camera padding ---------------------------------------
  // The cockpit floats over the map, so the screen measures its OWN overlay
  // bands and hands MapView a padding rectangle (typed prop, pure maths in
  // map/mapPadding.mjs). MapLibre code never inspects app DOM to find out
  // what is covering it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const dockBandRef = useRef<HTMLDivElement>(null);
  const [padding, setPadding] = useState<MapPadding>(() =>
    cameraPaddingFor({ viewportWidth: 0, viewportHeight: 0 }),
  );

  const measurePadding = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // The insets are the regions the cockpit ACTUALLY covers, measured from
    // the map's own box: how far down the lead column reaches, how far in
    // the control stack reaches, where the dock starts. Reserving whole
    // bands instead would spend vertical fit the bounded camera does not
    // have (see mapPadding.mjs).
    const box = wrap.getBoundingClientRect();
    const depth = (el: HTMLElement | null, edge: 'top' | 'right' | 'bottom') => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return 0;
      if (edge === 'top') return Math.max(0, r.bottom - box.top);
      if (edge === 'bottom') return Math.max(0, box.bottom - r.top);
      return Math.max(0, box.right - r.left);
    };
    const next = cameraPaddingFor({
      viewportWidth: wrap.clientWidth,
      viewportHeight: wrap.clientHeight,
      topInset: depth(leadRef.current, 'top'),
      rightInset: depth(controlsRef.current, 'right'),
      bottomInset: depth(dockBandRef.current, 'bottom'),
    });
    setPadding((prev) =>
      prev.top === next.top &&
      prev.right === next.right &&
      prev.bottom === next.bottom &&
      prev.left === next.left
        ? prev
        : next,
    );
    // MapLibre's own scale and attribution controls sit at the bottom
    // corners; lift them above the dock so nothing overlaps them.
    wrap.style.setProperty(
      '--map-dock-h',
      `${Math.round(dockBandRef.current?.offsetHeight ?? 0)}px`,
    );
  }, []);

  // useLayoutEffect, not useEffect: the FIRST measurement has to land before
  // MapView's own (passive) effect builds the map, so the very first camera
  // fit already frames the route inside the visible band instead of under
  // the status dock.
  useLayoutEffect(() => {
    measurePadding();
    const observer = new ResizeObserver(measurePadding);
    for (const el of [
      wrapRef.current,
      leadRef.current,
      controlsRef.current,
      dockBandRef.current,
    ]) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [measurePadding]);

  // ---- Live tracking (beta, opt-in, foreground-only) ----------------------
  // Status is judged against the COMPLETE route; progress against the
  // persisted CURRENT stage only (never the stage merely browsed above).
  // Production mode: no diagnostic log, no breadcrumb (see trackingSession).
  // Progress/status geometry is the ACTIVE itinerary's oriented data: the
  // current stage carries its direction-correct point order, so projection
  // increases from the selected start toward the selected end with no
  // presentation-time "100 − percent".
  const tracking = useRouteTracking({
    routePoints: route.overviewPoints,
    stagePoints: currentStage?.points ?? null,
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

  // One-shot "View on map": highlight the experience's verified geometry — a
  // point, an owner GPX route, or the whole Stage (route-wide). MapView remounts
  // on tab switch / direction change, so the highlight never persists.
  useEffect(() => {
    if (!focus) return;
    const m = mapRef.current;
    if (!m) return;
    if (focus.kind === 'stage') {
      m.focusPoint(null);
      m.fitStage(focus.stageId);
    } else if (
      focus.kind === 'route' &&
      ((focus.tracks && focus.tracks.length > 0) || (focus.track && focus.track.length > 0))
    ) {
      m.focusRoute({
        track: focus.track,
        tracks: focus.tracks,
        start: focus.start ?? null,
        destination: focus.destination ?? null,
      });
    } else if (focus.coord) {
      m.focusPoint({ lat: focus.coord.lat, lon: focus.coord.lng });
    }
  }, [focus]);

  const stepStage = (dir: 1 | -1) => {
    // Order follows the active itinerary: overview → Day 1 … Day 7 → overview.
    const ids = [null, ...route.stages.map((s) => s.id)];
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

  const currentStageTitle = currentStage
    ? `Stage ${currentStage.day}: ${stopShortName(STOPS_BY_ID[currentStage.fromHutId])} → ${stopShortName(STOPS_BY_ID[currentStage.toHutId])}`
    : null;

  // Along-route progress is always computed against the CURRENT persisted
  // stage — never the stage merely being browsed on the map above.
  const progress = useMemo<Progress>(() => {
    if (geo.status !== 'success' || !geo.coord) return null;
    if (!currentStage) return { kind: 'no-stage' };

    const totalKm =
      currentStage.points[currentStage.points.length - 1]?.cumulativeDistanceKm ??
      currentStage.distanceKm;

    if (geo.source === 'manual') {
      // fromHutId/toHutId are already oriented, so "start"/"end" follow the
      // active direction.
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
        currentStage.points,
        { lat: geo.coord.lat, lon: geo.coord.lng },
        { accuracyM: geo.accuracyM },
      ),
    };
  }, [geo.status, geo.coord, geo.source, geo.manualStopId, geo.accuracyM, currentStage]);

  // ---- Scope: what the map is showing ------------------------------------
  // A temporary "View on map" focus owns the pill while it is showing; the
  // moment the hiker chooses a scope themselves, the map is theirs again.
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  useEffect(() => {
    setFocusLabel(focus && focus.kind !== 'stage' ? focus.label : null);
  }, [focus]);

  // Scope options come from the ACTIVE itinerary (oriented order, oriented
  // endpoints), like every other screen — never from raw route data.
  const stageScope = (stage: { day: number; fromHutId: string; toHutId: string }) => ({
    day: stage.day,
    fromName: stopShortName(STOPS_BY_ID[stage.fromHutId]),
    toName: stopShortName(STOPS_BY_ID[stage.toHutId]),
  });
  const viewStage = itinerary.stages.find((s) => s.id === viewStageId) ?? null;
  const scopeOptions: ScopeOption[] = [
    { id: null, label: FULL_ROUTE_LABEL, isCurrent: false },
    ...itinerary.stages.map((s) => ({
      id: s.id,
      label: stageScopeLabel(stageScope(s)),
      isCurrent: s.id === currentStage?.id,
    })),
  ];
  const scopeLabel = scopePillLabel({
    focusLabel,
    viewStage: viewStage ? stageScope(viewStage) : null,
  });
  // Selecting a scope changes the BROWSED stage only — never the persisted
  // current stage that progress and tracking are computed from.
  const selectScope = (stageId: string | null) => {
    setFocusLabel(null);
    setViewStageId(stageId);
  };
  const fitScope = () => {
    if (viewStageId) mapRef.current?.fitStage(viewStageId);
    else mapRef.current?.fitRoute();
  };

  // ---- Status dock -------------------------------------------------------
  const liveProgress = session.progress;
  const oneShotMatch =
    progress?.kind === 'gps'
      ? progress.proj.ok && progress.proj.reliable
      : progress?.kind === 'manual-start' || progress?.kind === 'manual-end';
  const oneShotPercent =
    progress?.kind === 'gps' && progress.proj.ok
      ? progress.proj.percent
      : progress?.kind === 'manual-start'
        ? 0
        : progress?.kind === 'manual-end'
          ? 100
          : null;
  const oneShotRemainingKm =
    progress?.kind === 'gps' && progress.proj.ok
      ? progress.proj.distanceRemainingKm
      : progress?.kind === 'manual-start'
        ? progress.totalKm
        : progress?.kind === 'manual-end'
          ? 0
          : null;
  const status = dockStatus({
    trackingActive: tracking.active,
    locating: geo.status === 'locating',
    error: tracking.error ?? (geo.status === 'error' ? geo.error : null),
    hasCurrentStage: currentStage != null,
    stageLabel: currentStage ? stageShortLabel(currentStage.day) : null,
    hasFix: marker != null,
    fixSource: liveCurrent ? 'gps' : geo.source,
    matched: liveCurrent
      ? session.stageMatched && liveProgress != null
      : oneShotMatch === true,
    routeStatus: liveCurrent ? session.routeStatus : null,
    progressStale: session.progressStale,
    percent: liveCurrent ? (liveProgress?.percent ?? null) : oneShotPercent,
    remainingLabel: liveCurrent
      ? liveProgress
        ? formatDistanceKm(liveProgress.remainingKm)
        : null
      : oneShotRemainingKm != null
        ? formatDistanceKm(oneShotRemainingKm)
        : null,
  });
  // Both stages, explicitly, whenever they differ — the map may be browsing
  // Day 5 while progress is still tracked against Day 4.
  const mismatch = scopeMismatch({
    viewedStageId: viewStageId,
    viewedDay: viewStage?.day ?? null,
    trackedStageId: currentStage?.id ?? null,
    trackedDay: currentStage?.day ?? null,
  });

  return (
    <div className="screen screen--map">
      {/* The Map destination is a workspace, not a document: the map fills
          the whole available <main> height and nothing on this screen
          scrolls the shell. The screen therefore carries no visible
          header — its accessible name is this heading, and the destination
          is named by the primary navigation. */}
      <h1 className="sr-only">Map</h1>

      {/* TRAIL COCKPIT. The map IS the screen; three deliberate layers float
          over it: the scope control (top-left, "what am I looking at"), the
          map control stack (top-right, "what can I do to the map") and the
          trail status dock (bottom, "where am I on the route"). Everything
          else — full progress readouts, accuracy, errors, live tracking and
          the manual fallback — lives one tap deep in sheets, so the map
          keeps the space. */}
      <div className="map-layout">
        <div className="map-canvas-wrap" ref={wrapRef}>
          <MapView
            // Remount when the direction flips: MapView captures its route at
            // mount (route lines, markers, camera bounds), so a fresh key is
            // the clean way to rebuild it with the oriented geometry — no
            // stale selected-stage or progress state can survive.
            key={itinerary.direction}
            ref={mapRef}
            route={route}
            selectedStageId={viewStageId}
            onSelectStage={(id) => selectScope(id)}
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
            padding={padding}
          />

          {/* Top band: scope on the left, controls on the right. The lead
              column's depth becomes the camera's TOP padding and the control
              stack's width its RIGHT padding, so geometry is framed clear of
              both without paying for the empty span between them. */}
          <div className="map-cockpit-top">
            <div className="map-cockpit-lead" ref={leadRef}>
              <MapScopeControl
                label={scopeLabel}
                options={scopeOptions}
                viewStageId={viewStageId}
                onSelect={selectScope}
                onStep={stepStage}
              />
              {/* Off-trail "View on map" note: a point with no supplied route
                  opens with clear wording that the marker is a destination
                  reference, not a route. */}
              {focus?.note ? (
                <p className="map-note map-note--warn" role="status">
                  <TriangleAlert size={15} strokeWidth={2} aria-hidden />
                  <span>
                    <strong>{focus.label}</strong> — {focus.note}
                  </span>
                </p>
              ) : null}
              {/* A basemap that failed to resolve changes the map materially,
                  so it says so on the map — compactly, never as a permanent
                  banner that eats the workspace. */}
              {basemapMode === 'none' ? (
                <p className="map-note map-note--warn" role="status">
                  <TriangleAlert size={15} strokeWidth={2} aria-hidden />
                  <span>
                    Offline basemap missing — route on a plain background.
                  </span>
                </p>
              ) : null}
              {tracking.active && currentStage ? (
                <TrackingStatusOverlay
                  session={session}
                  stageLabel={stageShortLabel(currentStage.day)}
                />
              ) : null}
            </div>

            <MapControlStack
              stackRef={controlsRef}
              imagery={imagery}
              onImageryChange={setImagery}
              satelliteAvailable={satelliteAvailable}
              basemapAvailable={basemapMode !== 'none'}
              fitLabel={`Fit ${viewStage ? stageShortLabel(viewStage.day) : 'route'}`}
              onFit={fitScope}
              onLocate={geo.locate}
              locateDisabled={tracking.active || geo.status === 'locating'}
              locating={geo.status === 'locating'}
              follow={follow}
              onToggleFollow={() => setFollow((f) => !f)}
              canFollow={marker != null}
            />
          </div>

          {/* Bottom band: the trail status dock, immediately above the
              persistent bottom navigation. Measured for the camera's bottom
              padding for the same reason as the top band. */}
          <div className="map-cockpit-bottom" ref={dockBandRef}>
            <MapStatusDock
              status={status}
              mismatch={mismatch}
              detailsOpen={detailsOpen}
              onOpenDetails={() => setDetailsOpen(true)}
              onAction={() => {
                if (status.actionKind === 'stop') stopTracking();
                else if (status.actionKind === 'locate') geo.locate();
              }}
            />
          </div>
        </div>
      </div>

      {detailsOpen ? (
        <MapStatusSheet title="Position & progress" onClose={() => setDetailsOpen(false)}>
          {/* The full readout the Map used to keep permanently on screen:
              source, accuracy, along-stage progress, errors, live tracking
              and the manual fallback. No raw coordinates — the marker on the
              map IS the position. */}
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
              <strong>Locate</strong> takes a one-shot GPS fix. <strong>Live
              tracking · Beta</strong> follows today’s stage as you walk
              (foreground only — approximate, not for primary navigation).
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

          {/* Live tracking (beta): one position source at a time — the
              one-shot Locate in the control stack is disabled while a live
              session runs. */}
          <div className="map-sheet-actions">
            {!tracking.active ? (
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  startTracking();
                  setDetailsOpen(false);
                }}
                disabled={!currentStage}
                title={
                  currentStage ? undefined : 'Select a current stage first (in Stages)'
                }
              >
                ▶ Live tracking · Beta
              </button>
            ) : (
              <button
                className="btn btn-danger btn-block"
                onClick={() => {
                  stopTracking();
                  setDetailsOpen(false);
                }}
              >
                ■ Stop tracking
              </button>
            )}
            {!currentStage ? (
              <p className="card-sub" style={{ marginTop: 8 }}>
                Live tracking (beta) follows today’s stage — select a current
                stage first on the Stages tab.
              </p>
            ) : null}
          </div>

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
                      {itinerary.orderedStops.map((s) => (
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
        </MapStatusSheet>
      ) : null}
    </div>
  );
}
