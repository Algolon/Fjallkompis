/**
 * Pure live-tracking session logic for the TEMPORARY Delft pilot
 * (docs/delft-pilot-test.md). No browser APIs — the geolocation watcher lives
 * in src/hooks/useLiveTracking.ts; this module only decides what to do with
 * each reading, so every rule below is unit-testable in Node.
 *
 * Authored as plain ESM (with a sibling .d.mts declaration) so the SAME
 * implementation is imported by the app and by tests/pilot-session.test.mjs,
 * mirroring the routeProgress.mjs convention.
 *
 * Off-route / accuracy model (documented thresholds):
 *
 *  Per accepted fix, classifyFix() derives a qualified route status from the
 *  cross-track distance AND the reported accuracy — never from a single hard
 *  threshold:
 *   - accuracy missing or worse than ACCURACY_UNCERTAIN_M (40 m): the fix is
 *     too imprecise to judge on/off route at the scale of a walking test →
 *     'uncertain', regardless of cross-track distance;
 *   - cross-track ≤ max(ON_ROUTE_FLOOR_M, 1.5 × accuracy): 'on-route'
 *     (the floor absorbs GPX generalisation and normal pavement offset);
 *   - cross-track ≥ max(OFF_ROUTE_FLOOR_M, 3 × accuracy): 'off-route'
 *     (aligned with the reliability gate in routeProgress.mjs — a fix the
 *     projection itself calls unreliable is never called "on route");
 *   - anything in between: 'uncertain'.
 *
 *  The session-level status additionally debounces 'off-route': it is only
 *  declared after OFF_ROUTE_CONSECUTIVE consecutive off-route fixes ("likely
 *  off route"), while recovery to 'on-route' is immediate. Until the streak
 *  completes the session reads 'uncertain' — conservative by design.
 *
 * Reading acceptance (noisy/stale handling):
 *   - non-finite coordinates are rejected ('invalid');
 *   - a timestamp at or before the previous accepted fix is rejected
 *     ('stale') — watchPosition can replay cached positions;
 *   - reported accuracy worse than MAX_ACCEPT_ACCURACY_M is rejected
 *     ('low-accuracy'): it is logged for diagnostics but moves neither the
 *     marker, the trail, the status nor the progress.
 *
 * Progress (along-route km / %) only updates from fixes whose projection is
 * reliable (see routeProgress.mjs); otherwise the last reliable progress is
 * kept and flagged stale — walking away from the route can therefore never
 * produce an implausible jump in completed distance.
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

export function createPilotSession() {
  return {
    /** Diagnostic log: every reading, accepted or not (capped). */
    log: [],
    /** Accepted-fix count (accepted entries in `log` before capping). */
    acceptedCount: 0,
    rejectedCount: 0,
    /** Breadcrumb as [lon, lat] positions (MapLibre order). */
    trail: [],
    /** Latest ACCEPTED fix, or null. */
    lastFix: null,
    /** Debounced session status. */
    routeStatus: 'unknown',
    offRouteStreak: 0,
    /**
     * Last RELIABLE along-route progress
     * { alongKm, remainingKm, percent, timestamp } or null; `stale` on the
     * session flags that newer fixes could not update it.
     */
    progress: null,
    progressStale: false,
  };
}

/**
 * Fold one geolocation reading into the session. Pure: returns a NEW session.
 *
 * @param session   Current session (from createPilotSession/advance).
 * @param fix       { lat, lon, accuracyM, timestamp } — raw reading.
 * @param projection Result of projectOntoRoute() for this fix (or null when
 *                   no route geometry is available).
 * @param nowMs     Receipt time (Date.now() at the call site) for fix age.
 */
export function advancePilotSession(session, fix, projection, nowMs) {
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

  const reject = (reason) => {
    const entry = { ...entryBase, rejectReason: reason };
    return {
      ...session,
      log: appendCapped(session.log, entry),
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

  const proj = projection && projection.ok ? projection : null;
  const crossTrackM = proj ? proj.crossTrackM : null;
  const status = classifyFix({ crossTrackM, accuracyM: fix.accuracyM });

  // Debounced session status: off-route needs a streak, recovery is instant.
  let offRouteStreak;
  let routeStatus;
  if (status === 'on-route') {
    offRouteStreak = 0;
    routeStatus = 'on-route';
  } else if (status === 'off-route') {
    offRouteStreak = session.offRouteStreak + 1;
    routeStatus = offRouteStreak >= OFF_ROUTE_CONSECUTIVE ? 'off-route' : 'uncertain';
  } else {
    offRouteStreak = 0;
    routeStatus = 'uncertain';
  }

  // Progress only moves on a reliable projection; otherwise it goes stale.
  let progress = session.progress;
  let progressStale = session.progressStale;
  if (proj && proj.reliable) {
    progress = {
      alongKm: proj.distanceAlongKm,
      remainingKm: proj.distanceRemainingKm,
      percent: proj.percent,
      timestamp: fix.timestamp,
    };
    progressStale = false;
  } else if (progress) {
    progressStale = true;
  }

  // Breadcrumb, thinned so standing still doesn't grow the geometry.
  let trail = session.trail;
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

  const entry = {
    ...entryBase,
    crossTrackM,
    alongKm: proj ? proj.distanceAlongKm : null,
    percent: proj ? proj.percent : null,
    reliable: !!(proj && proj.reliable),
    status,
    accepted: true,
  };

  return {
    ...session,
    log: appendCapped(session.log, entry),
    acceptedCount: session.acceptedCount + 1,
    trail,
    lastFix: {
      lat: fix.lat,
      lon: fix.lon,
      accuracyM: fix.accuracyM ?? null,
      timestamp: fix.timestamp,
    },
    routeStatus,
    offRouteStreak,
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
