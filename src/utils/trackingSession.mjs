/**
 * Pure live-tracking session logic, shared by the production Kungsleden
 * tracking (src/screens/MapScreen.tsx) and the temporary Delft pilot
 * (src/screens/DelftPilotPanel.tsx). Graduated from the pilot's
 * pilotSession.mjs after the 2026-07-07 field test validated the rules
 * (docs/pilot-results/delft-2026-07-07-summary.md) — the classification and
 * debounce below are intentionally unchanged from that validated version.
 *
 * No browser APIs — the geolocation watcher lives in
 * src/hooks/useRouteTracking.ts (thin React wrapper around the pure
 * createWatchController below); this module only decides what to do with
 * each reading, so every rule is unit-testable in Node.
 *
 * Authored as plain ESM (with a sibling .d.mts declaration) so the SAME
 * implementation is imported by the app and by tests/tracking-session.test.mjs,
 * mirroring the routeProgress.mjs convention.
 *
 * ## Two projections per fix (multi-stage routes)
 *
 * Each accepted fix carries up to TWO independent projections:
 *  - `route`: against the COMPLETE route geometry — drives the qualified
 *    on-route / uncertain / off-route status. A hiker standing on a
 *    different stage of the same trail is ON the route, never "off route"
 *    merely because the persisted current stage differs.
 *  - `stage`: against the CURRENT STAGE only — drives completed/remaining/
 *    percent progress. When the route projection is reliable but the stage
 *    one is not, the session reports stageMatched=false so the UI can say
 *    "on the mapped route, but not matched to today's stage" instead of a
 *    misleading warning or percentage.
 * Single-stage routes (the Delft pilot) simply pass the same projection for
 * both.
 *
 * ## Off-route / accuracy model (documented thresholds — field-validated)
 *
 *  Per accepted fix, classifyFix() derives a qualified route status from the
 *  full-route cross-track distance AND the reported accuracy — never from a
 *  single hard threshold:
 *   - accuracy missing or worse than ACCURACY_UNCERTAIN_M (40 m): the fix is
 *     too imprecise to judge on/off route → 'uncertain', regardless of
 *     cross-track distance;
 *   - cross-track ≤ max(ON_ROUTE_FLOOR_M, 1.5 × accuracy): 'on-route'
 *     (the floor absorbs GPX generalisation and normal off-line walking);
 *   - cross-track ≥ max(OFF_ROUTE_FLOOR_M, 3 × accuracy): 'off-route'
 *     (aligned with the reliability gate in routeProgress.mjs);
 *   - anything in between: 'uncertain'.
 *
 *  The session-level status debounces 'off-route': declared only after
 *  OFF_ROUTE_CONSECUTIVE consecutive off-route fixes ("likely off route"),
 *  while recovery to 'on-route' is immediate. Until the streak completes the
 *  session reads 'uncertain' — conservative by design. `uncertainStreak`
 *  counts consecutive uncertain fixes so UIs can damp flicker (e.g. only
 *  surface a "GPS uncertain" pill after ≥ 2 in a row) without adding a
 *  second, unrelated status system.
 *
 * ## Reading acceptance (noisy/stale handling)
 *   - non-finite coordinates are rejected ('invalid');
 *   - a timestamp at or before the previous accepted fix is rejected
 *     ('stale') — watchPosition can replay cached positions;
 *   - reported accuracy worse than MAX_ACCEPT_ACCURACY_M is rejected
 *     ('low-accuracy'): counted for diagnostics but moves neither the
 *     marker, the trail, the status nor the progress.
 *
 * Progress only updates from fixes whose STAGE projection is reliable;
 * otherwise the last reliable progress is kept and flagged stale — walking
 * away from the stage can never produce an implausible jump in completed
 * distance.
 *
 * ## Session options (production vs diagnostics)
 *
 * createTrackingSession({ keepLog, keepTrail }):
 *  - keepLog=true  (Delft pilot): every reading is retained in `log` for the
 *    diagnostics panel and JSON/CSV export;
 *  - keepLog=false (Kungsleden production): no per-reading history is
 *    retained — only counters, the latest fix and the latest accepted
 *    summary. Multi-hour hikes stay memory-light and no location history
 *    accumulates.
 *  - keepTrail toggles the breadcrumb geometry the same way. Disabling the
 *    trail/log does NOT reduce GPS battery use — the high-accuracy watcher
 *    is the relevant cost either way.
 */

/** Reported accuracy worse than this → status is 'uncertain', full stop. */
export const ACCURACY_UNCERTAIN_M = 40;
/** Reported accuracy worse than this → reading rejected (logged only). */
export const MAX_ACCEPT_ACCURACY_M = 150;
/** "On route" floor: within this of the line always counts as on-route. */
export const ON_ROUTE_FLOOR_M = 30;
/** "Off route" floor: matches ROUTE_MATCH_MIN_TOLERANCE_M in routeProgress. */
export const OFF_ROUTE_FLOOR_M = 75;
/** Consecutive off-route fixes required before declaring 'off-route'. */
export const OFF_ROUTE_CONSECUTIVE = 3;
/** Consecutive uncertain fixes before a UI should surface "GPS uncertain". */
export const UNCERTAIN_UI_CONSECUTIVE = 2;
/** Breadcrumb thinning: skip trail points closer than this to the previous. */
export const MIN_TRAIL_STEP_M = 2;
/** In-memory log cap (~hours of 1 Hz fixes); oldest entries drop first. */
export const MAX_LOG_ENTRIES = 20000;

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Fast local metres between two lat/lon points (fine at walking scale). */
function approxDistanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const x = toRad(b.lon - a.lon) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * R;
}

/**
 * Qualified per-fix route status from cross-track distance and accuracy.
 * @returns {'on-route'|'uncertain'|'off-route'}
 */
export function classifyFix({ crossTrackM, accuracyM }) {
  if (!isFiniteNum(crossTrackM)) return 'uncertain';
  const acc = isFiniteNum(accuracyM) && accuracyM > 0 ? accuracyM : null;
  if (acc === null || acc > ACCURACY_UNCERTAIN_M) return 'uncertain';
  if (crossTrackM <= Math.max(ON_ROUTE_FLOOR_M, 1.5 * acc)) return 'on-route';
  if (crossTrackM >= Math.max(OFF_ROUTE_FLOOR_M, 3 * acc)) return 'off-route';
  return 'uncertain';
}

export function createTrackingSession(options = {}) {
  return {
    /** Immutable session options (see module doc). */
    options: {
      keepLog: options.keepLog !== false,
      keepTrail: options.keepTrail !== false,
    },
    /** Diagnostic log: every reading, accepted or not (empty if !keepLog). */
    log: [],
    acceptedCount: 0,
    rejectedCount: 0,
    /** Breadcrumb as [lon, lat] positions (empty if !keepTrail). */
    trail: [],
    /** Latest ACCEPTED fix, or null. */
    lastFix: null,
    /**
     * Summary of the latest accepted fix's full-route match:
     * { crossTrackM, status, reliable, timestamp } or null. Kept regardless
     * of keepLog so production UIs never need the per-reading history.
     */
    lastAccepted: null,
    /** Debounced session status (full-route). */
    routeStatus: 'unknown',
    offRouteStreak: 0,
    uncertainStreak: 0,
    /** True when the latest accepted fix matched the CURRENT STAGE reliably. */
    stageMatched: false,
    /**
     * Last RELIABLE current-stage progress
     * { alongKm, remainingKm, percent, timestamp } or null; progressStale
     * flags that newer fixes could not update it.
     */
    progress: null,
    progressStale: false,
  };
}

/**
 * Fold one geolocation reading into the session. Pure: returns a NEW session.
 *
 * @param session     Current session (from createTrackingSession/advance).
 * @param fix         { lat, lon, accuracyM, timestamp } — raw reading.
 * @param projections { route, stage } — projectOntoRoute() results against
 *                    the full route and the current stage (either may be
 *                    null when that geometry is unavailable). Single-stage
 *                    callers pass the same projection for both.
 * @param nowMs       Receipt time (Date.now() at the call site) for fix age.
 */
export function advanceTrackingSession(session, fix, projections, nowMs) {
  const routeProj =
    projections && projections.route && projections.route.ok
      ? projections.route
      : null;
  const stageProj =
    projections && projections.stage && projections.stage.ok
      ? projections.stage
      : null;

  const entryBase = {
    timestamp: fix?.timestamp ?? null,
    receivedAt: nowMs,
    ageMs:
      fix && isFiniteNum(fix.timestamp) && isFiniteNum(nowMs)
        ? Math.max(0, nowMs - fix.timestamp)
        : null,
    lat: fix?.lat ?? null,
    lon: fix?.lon ?? null,
    accuracyM: fix?.accuracyM ?? null,
    crossTrackM: null,
    alongKm: null,
    percent: null,
    reliable: false,
    status: 'uncertain',
    accepted: false,
    rejectReason: null,
  };

  const appendLog = (log, entry) =>
    session.options.keepLog ? appendCapped(log, entry) : log;

  const reject = (reason) => {
    const entry = { ...entryBase, rejectReason: reason };
    return {
      ...session,
      log: appendLog(session.log, entry),
      rejectedCount: session.rejectedCount + 1,
    };
  };

  if (!fix || !isFiniteNum(fix.lat) || !isFiniteNum(fix.lon)) {
    return reject('invalid');
  }
  if (
    session.lastFix &&
    isFiniteNum(fix.timestamp) &&
    fix.timestamp <= session.lastFix.timestamp
  ) {
    return reject('stale');
  }
  if (isFiniteNum(fix.accuracyM) && fix.accuracyM > MAX_ACCEPT_ACCURACY_M) {
    return reject('low-accuracy');
  }

  // Full-route status: never judged from the current stage alone.
  const crossTrackM = routeProj ? routeProj.crossTrackM : null;
  const status = classifyFix({ crossTrackM, accuracyM: fix.accuracyM });

  // Debounced session status: off-route needs a streak, recovery is instant.
  let offRouteStreak;
  let uncertainStreak;
  let routeStatus;
  if (status === 'on-route') {
    offRouteStreak = 0;
    uncertainStreak = 0;
    routeStatus = 'on-route';
  } else if (status === 'off-route') {
    offRouteStreak = session.offRouteStreak + 1;
    uncertainStreak = 0;
    routeStatus = offRouteStreak >= OFF_ROUTE_CONSECUTIVE ? 'off-route' : 'uncertain';
  } else {
    offRouteStreak = 0;
    uncertainStreak = session.uncertainStreak + 1;
    routeStatus = 'uncertain';
  }

  // Current-stage progress only moves on a reliable STAGE projection;
  // otherwise it goes stale (kept, never jumped).
  const stageMatched = !!(stageProj && stageProj.reliable);
  let progress = session.progress;
  let progressStale = session.progressStale;
  if (stageMatched) {
    progress = {
      alongKm: stageProj.distanceAlongKm,
      remainingKm: stageProj.distanceRemainingKm,
      percent: stageProj.percent,
      timestamp: fix.timestamp,
    };
    progressStale = false;
  } else if (progress) {
    progressStale = true;
  }

  // Breadcrumb, thinned so standing still doesn't grow the geometry.
  let trail = session.trail;
  if (session.options.keepTrail) {
    const last = trail.length ? trail[trail.length - 1] : null;
    if (
      !last ||
      approxDistanceM(
        { lat: last[1], lon: last[0] },
        { lat: fix.lat, lon: fix.lon },
      ) >= MIN_TRAIL_STEP_M
    ) {
      trail = [...trail, [fix.lon, fix.lat]];
    }
  }

  const entry = {
    ...entryBase,
    crossTrackM,
    alongKm: stageProj ? stageProj.distanceAlongKm : null,
    percent: stageProj ? stageProj.percent : null,
    reliable: stageMatched,
    status,
    accepted: true,
  };

  return {
    ...session,
    log: appendLog(session.log, entry),
    acceptedCount: session.acceptedCount + 1,
    trail,
    lastFix: {
      lat: fix.lat,
      lon: fix.lon,
      accuracyM: fix.accuracyM ?? null,
      timestamp: fix.timestamp,
    },
    lastAccepted: {
      crossTrackM,
      status,
      reliable: !!(routeProj && routeProj.reliable),
      timestamp: fix.timestamp,
    },
    routeStatus,
    offRouteStreak,
    uncertainStreak,
    stageMatched,
    progress,
    progressStale,
  };
}

function appendCapped(log, entry) {
  const next = [...log, entry];
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
}

/** JSON export payload (kept on-device unless the user exports it). */
export function sessionToExport(session, meta = {}) {
  return {
    kind: 'fjallkompis-pilot-session',
    ...meta,
    routeStatus: session.routeStatus,
    acceptedCount: session.acceptedCount,
    rejectedCount: session.rejectedCount,
    progress: session.progress,
    progressStale: session.progressStale,
    fixes: session.log,
  };
}

const CSV_COLUMNS = [
  'timestamp',
  'receivedAt',
  'ageMs',
  'lat',
  'lon',
  'accuracyM',
  'crossTrackM',
  'alongKm',
  'percent',
  'reliable',
  'status',
  'accepted',
  'rejectReason',
];

/** CSV export of the diagnostic log (one row per reading). */
export function sessionToCsv(session) {
  const rows = session.log.map((e) =>
    CSV_COLUMNS.map((c) => {
      const v = e[c];
      return v == null ? '' : String(v);
    }).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

// ---- Watcher lifecycle (pure controller, wrapped by useRouteTracking) ------

/**
 * Framework-free wrapper around navigator.geolocation.watchPosition that
 * enforces the validated lifecycle rules:
 *  - at most ONE watcher: start() while active is a no-op;
 *  - stop() clears the watcher and is always safe to call;
 *  - PERMISSION_DENIED is terminal for the attempt (auto-stops — the watcher
 *    cannot recover from it); TIMEOUT / POSITION_UNAVAILABLE are transient
 *    and keep the watcher alive;
 *  - high accuracy requested; maximumAge 0 avoids replayed cached fixes.
 *
 * `geolocation` is injected so tests can drive a fake; the hook passes
 * navigator.geolocation.
 */
export function createWatchController({ geolocation, onFix, onError }) {
  let watchId = null;

  return {
    isActive: () => watchId !== null,
    start() {
      if (watchId !== null) return false; // one watcher maximum
      if (!geolocation) {
        onError?.({ code: -1, terminal: true });
        return false;
      }
      watchId = geolocation.watchPosition(
        (pos) => {
          onFix({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? null,
            timestamp: pos.timestamp,
          });
        },
        (err) => {
          // 1 = PERMISSION_DENIED per the Geolocation spec.
          const terminal = err && err.code === 1;
          if (terminal) this.stop();
          onError?.({ code: err?.code ?? 0, terminal });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
      return true;
    },
    stop() {
      if (watchId !== null) {
        geolocation?.clearWatch(watchId);
        watchId = null;
      }
    },
  };
}
