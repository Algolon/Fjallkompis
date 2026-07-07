/**
 * TEMPORARY Delft pilot panel — a bounded field test of the Map tab (route
 * rendering, offline basemap, one-shot GPS, live tracking, along-route
 * projection) on a short walk in Delft. See docs/delft-pilot-test.md for the
 * test protocol and how to remove the pilot again.
 *
 * Rendered by MapScreen only when the VITE_ENABLE_DELFT_PILOT flag is on AND
 * the user explicitly selects the "Delft pilot" route context. Everything in
 * here is session-only React state:
 *  - it never reads or writes the persisted app store (current stage, notes);
 *  - the GPS log stays in memory unless the user exports it;
 *  - unmounting (switching back to Kungsleden, changing tab) stops any
 *    running geolocation watcher via useLiveTracking's cleanup.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type MapViewHandle } from '../components/MapView';
import { DelftPilotMapCard } from '../components/OfflineMapCard';
import { IconLocate } from '../components/Icons';
import { useGeolocation } from '../hooks/useGeolocation';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { DELFT_ROUTE, DELFT_STAGE } from '../route/delftPilot';
import { DELFT_ARCHIVE } from '../map/offlineMap';
import type { BasemapMode } from '../map/pmtilesProtocol';
import { projectOntoRoute } from '../utils/routeProgress.mjs';
import {
  classifyFix,
  sessionToCsv,
  sessionToExport,
  ACCURACY_UNCERTAIN_M,
  OFF_ROUTE_CONSECUTIVE,
} from '../utils/pilotSession.mjs';
import type { SessionRouteStatus } from '../utils/pilotSession.mjs';
import { downloadJson, downloadTextFile } from '../utils/exportImport';
import { formatDistanceKm, todayIso } from '../utils/format';
import { APP_VERSION } from '../constants';

const STATUS_LABEL: Record<SessionRouteStatus, string> = {
  'on-route': 'On route',
  uncertain: 'Uncertain (GPS accuracy / distance ambiguous)',
  'off-route': 'Likely off route',
  unknown: 'No position yet',
};

/** "12:34:56" for diagnostic timestamps. */
const clock = (ms: number | null) =>
  ms == null ? '—' : new Date(ms).toLocaleTimeString();

/** Missing-asset checklist shown until the Delft GPX has been processed. */
function MissingAssetsCard() {
  return (
    <div className="card">
      <span className="card-title">Delft route data not built yet</span>
      <p className="card-sub" style={{ marginTop: 4 }}>
        The pilot UI is installed, but its route assets are missing. To
        activate it (full instructions: docs/delft-pilot-test.md):
      </p>
      <ol style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          Export the pilot walk from gpx.studio as GPX 1.1 and save it as{' '}
          <span className="tnum">public/gpx/delft-pilot.gpx</span> (1 track: segment 0
          = overview, segment 1 = stage; 2 waypoints with machine ids{' '}
          <span className="tnum">START_DELFT</span> / <span className="tnum">END_DELFT</span> in
          their comment/description).
        </li>
        <li>
          Run <span className="tnum">npm run generate:route:delft</span> and commit the
          regenerated <span className="tnum">src/generated/delft-pilot-route.json</span>.
        </li>
        <li>
          Build the basemap via the <em>Delft pilot map data</em> GitHub Actions
          workflow (or locally: <span className="tnum">scripts/extract-offline-map.sh
          &lt;YYYYMMDD&gt; 15 delft-pilot</span>) →{' '}
          <span className="tnum">public/maps/delft-pilot.pmtiles</span>.
        </li>
        <li>Rebuild and redeploy the app.</li>
      </ol>
    </div>
  );
}

export function DelftPilotPanel() {
  const mapRef = useRef<MapViewHandle>(null);
  const geo = useGeolocation();
  const tracking = useLiveTracking(DELFT_STAGE?.points ?? null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode | null>(null);
  const [follow, setFollow] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);

  // 1 Hz tick so the "fix age" readout stays honest while tracking.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tracking.active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [tracking.active]);

  const { session } = tracking;

  // Marker position: latest accepted live fix wins; else the one-shot fix.
  const marker = session.lastFix
    ? { lat: session.lastFix.lat, lng: session.lastFix.lon }
    : geo.coord;

  // Readout values: the live session once it has fixes; otherwise a direct
  // projection of the one-shot fix (same math, same thresholds).
  const oneShotProj = useMemo(() => {
    if (session.lastFix || !geo.coord || !DELFT_STAGE) return null;
    return projectOntoRoute(
      DELFT_STAGE.points,
      { lat: geo.coord.lat, lon: geo.coord.lng },
      { accuracyM: geo.accuracyM },
    );
  }, [session.lastFix, geo.coord, geo.accuracyM]);

  const live = session.lastFix != null;
  const accuracyM = live ? session.lastFix!.accuracyM : geo.accuracyM;
  const fixTimestamp = live ? session.lastFix!.timestamp : geo.timestamp;
  const fixAgeS =
    fixTimestamp != null ? Math.max(0, Math.round((Date.now() - fixTimestamp) / 1000)) : null;

  const lastAccepted = useMemo(() => {
    for (let i = session.log.length - 1; i >= 0; i--) {
      if (session.log[i].accepted) return session.log[i];
    }
    return null;
  }, [session.log]);

  const crossTrackM = live
    ? lastAccepted?.crossTrackM ?? null
    : oneShotProj?.ok
      ? oneShotProj.crossTrackM
      : null;

  const routeStatus: SessionRouteStatus = live
    ? session.routeStatus
    : oneShotProj?.ok
      ? classifyFix({ crossTrackM: oneShotProj.crossTrackM, accuracyM: geo.accuracyM })
      : 'unknown';

  const progress = live
    ? session.progress
    : oneShotProj?.ok && oneShotProj.reliable
      ? {
          alongKm: oneShotProj.distanceAlongKm,
          remainingKm: oneShotProj.distanceRemainingKm,
          percent: oneShotProj.percent,
          timestamp: fixTimestamp ?? 0,
        }
      : null;
  const progressStale = live && session.progressStale;

  const lastEntry = session.log.length ? session.log[session.log.length - 1] : null;

  const exportSession = (format: 'json' | 'csv') => {
    const stamp = `${todayIso()}-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}`;
    if (format === 'json') {
      downloadJson(
        `delft-pilot-session-${stamp}.json`,
        sessionToExport(session, {
          appVersion: APP_VERSION,
          route: 'delft-pilot',
          exportedAt: new Date().toISOString(),
        }),
      );
    } else {
      downloadTextFile(
        `delft-pilot-session-${stamp}.csv`,
        sessionToCsv(session),
        'text/csv',
      );
    }
  };

  const waypoint = selectedWaypointId
    ? DELFT_ROUTE?.waypoints.find((w) => w.id === selectedWaypointId) ?? null
    : null;

  return (
    <>
      {/* Clearly visible but unobtrusive pilot-mode label. */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span className="pill pill-warn">Pilot mode · Delft test route</span>
      </div>
      <p className="card-sub" style={{ marginTop: -6, marginBottom: 14 }}>
        Temporary Map-tab field test. Your Kungsleden data (current stage, notes,
        offline maps) is not touched, and nothing here is saved after you leave
        unless you export it.
      </p>

      {!DELFT_ROUTE || !DELFT_STAGE ? (
        <>
          <MissingAssetsCard />
          <DelftPilotMapCard />
        </>
      ) : (
        <>
          <div className="card map-card">
            <div className="map-canvas-wrap">
              <MapView
                ref={mapRef}
                route={DELFT_ROUTE}
                archive={DELFT_ARCHIVE}
                enableSatellite={false}
                selectedStageId={null}
                onSelectStage={() => {}}
                onSelectWaypoint={setSelectedWaypointId}
                onBasemapMode={setBasemapMode}
                imagery="terrain"
                gps={marker}
                trail={session.trail}
                follow={follow}
                onUserInteract={() => setFollow(false)}
              />
            </div>
            {basemapMode === 'none' ? (
              <div className="banner-warn" style={{ margin: 10 }}>
                <span>🗺️</span>
                <span>
                  Delft basemap unavailable — showing the route on a placeholder
                  background. Download the pilot map below while online.
                </span>
              </div>
            ) : null}
            <div className="map-toolbar">
              <button className="btn btn-ghost" onClick={() => mapRef.current?.fitRoute()}>
                Fit route
              </button>
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
          </div>

          {waypoint ? (
            <div className="card" role="region" aria-label={`Waypoint ${waypoint.name}`}>
              <div className="row-between">
                <span className="card-title">{waypoint.name}</span>
                <button className="link-btn" onClick={() => setSelectedWaypointId(null)}>
                  Close
                </button>
              </div>
              <p className="card-sub" style={{ marginTop: 2 }}>
                <span className="tnum">{waypoint.id}</span> ·{' '}
                <span className="tnum">
                  {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
                </span>
              </p>
            </div>
          ) : null}

          {/* Route summary */}
          <div className="card">
            <div className="row-between">
              <span className="card-title">{DELFT_ROUTE.name}</span>
              <span className="pill tnum">
                {formatDistanceKm(DELFT_STAGE.statistics.distanceKm)}
              </span>
            </div>
            <p className="card-sub" style={{ marginTop: 6 }}>
              One test stage, {DELFT_ROUTE.waypoints.map((w) => w.name).join(' → ')}.
              Delft is flat — this pilot validates GPS matching and offline maps,
              not ascent/descent behaviour.
            </p>
          </div>

          {/* GPS: one-shot + live tracking */}
          <div className="card">
            <button
              className="btn btn-glacier btn-block"
              onClick={geo.locate}
              disabled={geo.status === 'locating'}
            >
              <IconLocate />
              {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
            </button>

            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {!tracking.active ? (
                <button className="btn btn-primary btn-block" onClick={tracking.start}>
                  ▶ Start live tracking
                </button>
              ) : (
                <button className="btn btn-danger btn-block" onClick={tracking.stop}>
                  ■ Stop tracking
                </button>
              )}
            </div>

            {tracking.active ? (
              <>
                <p className="banner-info" style={{ marginTop: 12 }}>
                  <span>🛰️</span>
                  <span>
                    <strong>Live tracking active</strong> — foreground only: updates
                    pause when the screen locks or the browser suspends the app.
                    This is not reliable background tracking.
                  </span>
                </p>
                <p className="card-sub" style={{ marginTop: 8 }}>
                  Live tracking uses additional battery. High-accuracy location
                  remains active while this screen is open. Stop tracking when
                  you no longer need it.
                </p>
              </>
            ) : null}

            {/* Qualified off-route hint: live tracking only, and only for the
                debounced session status (never for 'uncertain'). Rendering is
                purely derived, so recovery removes it immediately. Kept apart
                from the geolocation/API error banner below. */}
            {tracking.active && session.routeStatus === 'off-route' ? (
              <p className="banner-warn" style={{ marginTop: 12 }} role="status">
                <span>🧭</span>
                <span>
                  You may be off route
                  {crossTrackM != null && isFinite(crossTrackM)
                    ? ` · approximately ${Math.round(crossTrackM)} m from the mapped trail`
                    : ''}
                  . Check the map and your surroundings.
                </span>
              </p>
            ) : null}

            {(tracking.error || (geo.status === 'error' && geo.error)) && (
              <p className="banner-warn" style={{ marginTop: 12 }}>
                <span>📍</span>
                <span>{tracking.error ?? geo.error}</span>
              </p>
            )}

            {marker ? (
              <div style={{ marginTop: 14 }}>
                <div className="row-between">
                  <span className="muted">Position{live ? ' (live)' : ' (one-shot)'}</span>
                  <span className="tnum">
                    {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted">GPS accuracy</span>
                  <span className="tnum">
                    {accuracyM != null ? `±${Math.round(accuracyM)} m` : '—'}
                    {accuracyM != null && accuracyM > ACCURACY_UNCERTAIN_M ? ' (poor)' : ''}
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted">Fix age</span>
                  <span className="tnum">{fixAgeS != null ? `${fixAgeS} s` : '—'}</span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted">Cross-track distance</span>
                  <span className="tnum">
                    {crossTrackM != null && isFinite(crossTrackM)
                      ? `~${Math.round(crossTrackM)} m`
                      : '—'}
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted">Route status</span>
                  <span>{STATUS_LABEL[routeStatus]}</span>
                </div>

                <div className="hr" />

                {progress ? (
                  <div className="route-progress">
                    <div className="row-between">
                      <span className="card-sub">
                        Pilot stage progress{progressStale ? ' · stale (last reliable match)' : ''}
                      </span>
                      <span className="tnum" style={{ fontWeight: 800, fontSize: 20 }}>
                        {Math.round(progress.percent)}%
                      </span>
                    </div>
                    <progress
                      className="map-progress"
                      style={{ width: '100%', marginTop: 10 }}
                      value={Math.round(progress.percent)}
                      max={100}
                      aria-label={`Pilot route completed: ${Math.round(progress.percent)}%`}
                    />
                    <div className="stat-grid" style={{ marginTop: 12 }}>
                      <div className="stat">
                        <div className="k">Completed</div>
                        <div className="v tnum">{formatDistanceKm(progress.alongKm)}</div>
                      </div>
                      <div className="stat">
                        <div className="k">Remaining</div>
                        <div className="v tnum">{formatDistanceKm(progress.remainingKm)}</div>
                      </div>
                    </div>
                    {progressStale ? (
                      <p className="card-sub" style={{ marginTop: 8 }}>
                        Progress is frozen at the last reliable route match — recent
                        fixes were off-route or too inaccurate to trust.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="card-sub">
                    No reliable route match yet — progress appears once a fix lands
                    close enough to the mapped line for its reported accuracy.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Diagnostics */}
          <div className="card">
            <span className="card-title">Pilot diagnostics</span>
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="muted">Fixes accepted / rejected</span>
              <span className="tnum">
                {session.acceptedCount} / {session.rejectedCount}
              </span>
            </div>
            <div className="row-between" style={{ marginTop: 6 }}>
              <span className="muted">Trail points</span>
              <span className="tnum">{session.trail.length}</span>
            </div>
            {lastEntry ? (
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="muted">Last reading</span>
                <span className="tnum">
                  {clock(lastEntry.receivedAt)} ·{' '}
                  {lastEntry.accepted ? lastEntry.status : `rejected (${lastEntry.rejectReason})`}
                </span>
              </div>
            ) : null}
            <p className="card-sub" style={{ marginTop: 10 }}>
              Off-route logic: a fix needs accuracy ≤ {ACCURACY_UNCERTAIN_M} m to be
              judged at all; “likely off route” only after {OFF_ROUTE_CONSECUTIVE}{' '}
              consecutive off-route fixes; recovery is immediate.
            </p>

            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-block"
                onClick={() => exportSession('json')}
                disabled={session.log.length === 0}
              >
                Export JSON
              </button>
              <button
                className="btn btn-block"
                onClick={() => exportSession('csv')}
                disabled={session.log.length === 0}
              >
                Export CSV
              </button>
            </div>
            <button
              className="btn btn-danger btn-block"
              style={{ marginTop: 10 }}
              onClick={tracking.clearSession}
              disabled={session.log.length === 0 && session.trail.length === 0}
            >
              Clear recorded trail & log
            </button>
            <p className="card-sub" style={{ marginTop: 10 }}>
              Privacy: the GPS log lives only in this page’s memory and is gone
              when you leave or clear it — nothing is uploaded or stored unless
              you export it to a file yourself.
            </p>
          </div>

          <DelftPilotMapCard />
        </>
      )}
    </>
  );
}
