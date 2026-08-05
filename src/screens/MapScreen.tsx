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
import { MapScopeControl, type ScopeOption } from '../components/MapScopeControl';
import { MapControlStack } from '../components/MapControlStack';
import { MapTrackingPill } from '../components/MapTrackingPill';
import { FacilityIcon } from '../components/FacilityIcon';
import { useGeolocation } from '../hooks/useGeolocation';
import { useRouteTracking } from '../hooks/useRouteTracking';
import {
  STOPS_BY_ID,
  WAYPOINT_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopIdForWaypoint,
  stopShortName,
} from '../trail/activeTrailContent';
import { facilitySummary, popupActionLabel } from '../map/stopMarkers.mjs';
import type { BasemapMode } from '../map/pmtilesProtocol';
import { cameraPaddingFor, overviewPaddingFor } from '../map/mapPadding.mjs';
import type { MapPadding } from '../map/mapPadding.mjs';
import { trackingPill } from '../map/mapTrackingPill.mjs';
import {
  FULL_ROUTE_LABEL,
  scopePillLabel,
  stageScopeLabel,
  stageShortLabel,
} from '../map/mapScope.mjs';
import type { LatLng, TrailStop } from '../types';

/**
 * The Map presents NO along-route progress readout any more: the old status
 * dock and its details sheet were removed, and current-stage progress needs
 * a deliberate home (Today) rather than half a card over the map. The
 * calculations themselves are untouched — src/utils/routeProgress.mjs and
 * the live session in useRouteTracking still project fixes onto the route
 * and the current stage exactly as before.
 */

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

  // ---- Transient map message ---------------------------------------------
  // Failures and refusals (GPS denied, no current stage, a tracking error)
  // are said once, briefly, in the cockpit's own note slot — never in a
  // sheet, and never as a permanent band. role="status" makes it audible to
  // assistive tech; the timer keeps the map clean afterwards.
  const [message, setMessage] = useState<string | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const say = useCallback((text: string) => {
    setMessage(text);
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), 7000);
  }, []);
  useEffect(
    () => () => {
      if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    },
    [],
  );

  // ---- Layout-aware camera padding ---------------------------------------
  // The cockpit floats over the map, so the screen measures its OWN overlay
  // bands and hands MapView a padding rectangle (typed prop, pure maths in
  // map/mapPadding.mjs). MapLibre code never inspects app DOM to find out
  // what is covering it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // The bottom band exists only while the tracking pill does, so it is
  // attached through a callback ref: mounting or unmounting it re-observes
  // and re-measures, and the idle map pays no bottom inset at all.
  const bottomBandRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [padding, setPadding] = useState<MapPadding>(() =>
    cameraPaddingFor({ viewportWidth: 0, viewportHeight: 0 }),
  );
  // The full-route overview gets its own rectangle: balanced horizontally and
  // label-safe, because it is a composition rather than an operational view
  // (src/map/mapPadding.mjs). Both are measured from the same observer pass.
  const [overviewPadding, setOverviewPadding] = useState<MapPadding>(() =>
    overviewPaddingFor({ viewportWidth: 0, viewportHeight: 0 }),
  );

  const measurePadding = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // The insets are the regions the cockpit ACTUALLY covers, measured from
    // the map's own box: how far down the lead column reaches, how far in
    // the control stack reaches, and — ONLY while a live-tracking pill
    // exists — where that pill starts. In the idle state the bottom inset is
    // zero, because there is nothing down there any more. Reserving whole
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
    const topInset = depth(leadRef.current, 'top');
    const bottomInset = depth(bottomBandRef.current, 'bottom');
    const next = cameraPaddingFor({
      viewportWidth: wrap.clientWidth,
      viewportHeight: wrap.clientHeight,
      topInset,
      rightInset: depth(controlsRef.current, 'right'),
      bottomInset,
    });
    // The overview deliberately does NOT take the control stack's width: it
    // is a local overlay over one corner, and charging it for the full height
    // is what pushed the whole route west. Vertical insets are shared —
    // the scope control really is across the top.
    const nextOverview = overviewPaddingFor({
      viewportWidth: wrap.clientWidth,
      viewportHeight: wrap.clientHeight,
      topInset,
      bottomInset,
    });
    const same = (a: MapPadding, b: MapPadding) =>
      a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
    setPadding((prev) => (same(prev, next) ? prev : next));
    setOverviewPadding((prev) => (same(prev, nextOverview) ? prev : nextOverview));
    // MapLibre's own scale and attribution controls sit at the bottom
    // corners; lift them clear of the tracking pill while it is showing,
    // and let them drop back down when it goes.
    wrap.style.setProperty(
      '--map-bottom-h',
      `${Math.round(bottomBandRef.current?.offsetHeight ?? 0)}px`,
    );
  }, []);

  // useLayoutEffect, not useEffect: the FIRST measurement has to land before
  // MapView's own (passive) effect builds the map, so the very first camera
  // fit already frames the route inside the visible band.
  useLayoutEffect(() => {
    measurePadding();
    const observer = new ResizeObserver(measurePadding);
    observerRef.current = observer;
    for (const el of [
      wrapRef.current,
      leadRef.current,
      controlsRef.current,
      bottomBandRef.current,
    ]) {
      if (el) observer.observe(el);
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [measurePadding]);

  const attachBottomBand = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = bottomBandRef.current;
      if (previous) observerRef.current?.unobserve(previous);
      bottomBandRef.current = node;
      if (node) observerRef.current?.observe(node);
      measurePadding();
    },
    [measurePadding],
  );

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
  // Memoised on the COORDINATES, not on render: MapView eases the camera
  // whenever this prop changes identity while following, so a fresh object
  // every render would re-centre on every unrelated re-render — and would
  // cancel the deliberate "resume following" recentre a beat after it starts.
  const liveLat = liveCurrent ? session.lastFix!.lat : null;
  const liveLon = liveCurrent ? session.lastFix!.lon : null;
  const marker = useMemo(
    () => (liveLat != null && liveLon != null ? { lat: liveLat, lng: liveLon } : geo.coord),
    [liveLat, liveLon, geo.coord],
  );

  const startTracking = () => {
    if (!currentStage) {
      // A refusal has to say what to do about it — concisely, in place.
      say('Select a current stage in Stages before starting live tracking.');
      return;
    }
    // One position source at a time: clear the one-shot state so it can
    // never compete with the live session.
    geo.reset();
    tracking.start();
    setFollow(true);
    // Focus the tracked stage if the user was browsing elsewhere.
    setViewStageId(currentStage.id);
  };

  // A deliberate pan/zoom pauses the camera WITHOUT ending the session; this
  // is how the hiker gets it back.
  const resumeFollow = () => {
    if (marker) mapRef.current?.centerOn(marker);
    setFollow(true);
  };

  const stopTracking = () => {
    tracking.stop();
    setFollow(false);
  };

  // A one-shot Locate is a deliberate "show me where I am": ONE fix, the
  // marker updated, the camera centred once — no session, no follow mode.
  useEffect(() => {
    if (geo.status === 'success' && geo.coord && geo.source === 'gps' && !tracking.active) {
      mapRef.current?.centerOn(geo.coord);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.timestamp]);

  // A denied or failed fix is reported where it was asked for.
  useEffect(() => {
    if (geo.status === 'error' && geo.error) say(geo.error);
  }, [geo.status, geo.error, say]);
  useEffect(() => {
    // While a session runs the pill already carries the live state
    // ("Waiting for GPS"), so only a session-ending error needs saying.
    if (tracking.error && !tracking.active) say(tracking.error);
  }, [tracking.error, tracking.active, say]);

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

  // ---- Live tracking pill -------------------------------------------------
  // The Map's only status surface, and only while a session runs. Route
  // status comes from the COMPLETE-route matcher; the qualified wording
  // rules live in the pure module.
  const pill = trackingPill({
    active: tracking.active,
    following: follow,
    stageLabel: currentStage ? stageShortLabel(currentStage.day) : null,
    routeStatus: session.routeStatus,
    uncertainStreak: session.uncertainStreak,
    hasFix: session.lastFix != null,
  });

  // The viewed/tracked distinction needs no third label of its own: the
  // scope pill names what the map is showing, the tracking pill names the
  // stage being tracked ("Following Day 4"), and the scope sheet marks both
  // Viewing and Current per row.

  return (
    <div className="screen screen--map">
      {/* The Map destination is a workspace, not a document: the map fills
          the whole available <main> height and nothing on this screen
          scrolls the shell. The screen therefore carries no visible
          header — its accessible name is this heading, and the destination
          is named by the primary navigation. */}
      <h1 className="sr-only">Map</h1>

      {/* TRAIL COCKPIT. The map IS the screen. In the idle state exactly two
          things float over it: the scope control (top-left, "what am I
          looking at") and the map control stack (top-right, "what can I do
          to the map"). A compact live pill joins them at the bottom ONLY
          while a tracking session runs, and refusals or failures are said
          once in the note slot under the scope pill. There is no permanent
          status panel, card or sheet — the map keeps the space. */}
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
            overviewPadding={overviewPadding}
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
              {/* Transient, self-clearing: a refused start, a denied fix, a
                  tracking error. Never a sheet, never a permanent band. */}
              {message ? (
                <p className="map-note map-note--warn" role="status">
                  <TriangleAlert size={15} strokeWidth={2} aria-hidden />
                  <span>{message}</span>
                </p>
              ) : null}
            </div>

            <MapControlStack
              stackRef={controlsRef}
              imagery={imagery}
              onImageryChange={setImagery}
              satelliteAvailable={satelliteAvailable}
              fitLabel={`Fit ${viewStage ? stageShortLabel(viewStage.day) : 'route'}`}
              onFit={fitScope}
              onLocate={geo.locate}
              locating={geo.status === 'locating'}
              // One request at a time, and never while a live session owns
              // the position source.
              locateDisabled={tracking.active || geo.status === 'locating'}
              trackingActive={tracking.active}
              following={follow}
              onStartTracking={startTracking}
              onResumeFollow={resumeFollow}
            />
          </div>

          {/* Bottom band: the trail status dock, immediately above the
              persistent bottom navigation. Measured for the camera's bottom
              padding for the same reason as the top band. */}
          {/* Bottom band: nothing at all unless a live session is running,
              so the idle map has no reserved band and no empty space above
              the navigation. Its measured depth is the camera's bottom
              padding while it exists. */}
          {pill ? (
            <div className="map-cockpit-bottom" ref={attachBottomBand}>
              <MapTrackingPill pill={pill} onStop={stopTracking} />
            </div>
          ) : null}
        </div>
      </div>

    </div>
  );
}
