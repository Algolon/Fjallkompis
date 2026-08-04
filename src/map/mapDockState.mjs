/**
 * Trail-status dock state machine (the compact bar above the bottom
 * navigation on the Map).
 *
 * The dock replaces the old always-visible progress card, so it has to say
 * the honest thing in one or two lines at every point of a hike:
 *
 *   no fix → offer Locate · locating → say so · one-shot fix → route-match
 *   state + remaining · live tracking → live status, progress and Stop ·
 *   uncertain match → uncertainty, NEVER "you are off route" · no current
 *   stage → explain what tracking needs.
 *
 * Wording rules that are easy to get wrong, so they live here and are
 * fenced by tests/map-status-dock.test.mjs:
 *  - "off route" is only ever said when the LIVE full-route status is
 *    off-route (a hiker on another Kungsleden stage is on the mapped
 *    route, and a merely unreliable one-shot projection means nothing);
 *  - stage progress is only shown when the fix is reliably matched to the
 *    CURRENT stage — never the stage being browsed;
 *  - a frozen (stale) live progress reading says that it is frozen.
 *
 * Pure ESM: no React, no data imports, all labels injected.
 */

/**
 * @param {object} o
 * @param {boolean} [o.trackingActive]  live session running
 * @param {boolean} [o.locating]        one-shot fix in flight
 * @param {string|null} [o.error]       geolocation / tracking error text
 * @param {boolean} [o.hasCurrentStage] a persisted current stage exists
 * @param {string|null} [o.stageLabel]  short label of that stage ("Day 4")
 * @param {boolean} [o.hasFix]          any position is known
 * @param {'gps'|'manual'|null} [o.fixSource] how a non-live fix was obtained
 * @param {boolean} [o.matched]         fix reliably matched to the current stage
 * @param {'on-route'|'off-route'|'uncertain'|'unknown'|null} [o.routeStatus]
 * @param {boolean} [o.progressStale]   live progress frozen at the last match
 * @param {number|null} [o.percent]     0–100 along the current stage
 * @param {string|null} [o.remainingLabel] preformatted "4.8 km"
 */
export function dockStatus({
  trackingActive = false,
  locating = false,
  error = null,
  hasCurrentStage = false,
  stageLabel = null,
  hasFix = false,
  fixSource = null,
  matched = false,
  routeStatus = null,
  progressStale = false,
  percent = null,
  remainingLabel = null,
} = {}) {
  const stage = stageLabel ?? 'today’s stage';
  const progress =
    percent != null && remainingLabel
      ? `${Math.round(percent)}% · ${remainingLabel} left`
      : null;

  if (trackingActive) {
    const base = {
      kind: 'live',
      actionKind: 'stop',
      actionLabel: 'Stop',
      showProgress: matched && progress != null,
      percent: matched ? percent : null,
    };
    if (routeStatus === 'off-route') {
      return {
        ...base,
        tone: 'warn',
        headline: 'You may be off route',
        detail: `Tracking ${stage} — check the map and your surroundings.`,
      };
    }
    if (routeStatus === 'uncertain') {
      return {
        ...base,
        tone: 'warn',
        headline: 'GPS signal uncertain',
        detail: `Tracking ${stage} — route status unavailable right now.`,
      };
    }
    if (!matched || progress == null) {
      return {
        ...base,
        tone: 'neutral',
        headline: `Tracking ${stage}`,
        detail:
          routeStatus === 'on-route'
            ? `On the mapped route, but not on ${stage} right now — stage progress is paused.`
            : `Waiting for a fix close enough to ${stage} to match reliably.`,
      };
    }
    return {
      ...base,
      tone: 'neutral',
      headline: `Tracking ${stage}`,
      detail: progressStale
        ? `${progress} — frozen at the last reliable match.`
        : `${progress} — live, approximate.`,
    };
  }

  if (locating) {
    return {
      kind: 'locating',
      tone: 'neutral',
      headline: 'Locating…',
      detail: 'Waiting for a GPS fix.',
      actionKind: null,
      actionLabel: null,
      showProgress: false,
      percent: null,
    };
  }

  if (error && !hasFix) {
    return {
      kind: 'error',
      tone: 'warn',
      headline: 'Location unavailable',
      detail: error,
      actionKind: 'locate',
      actionLabel: 'Retry',
      showProgress: false,
      percent: null,
    };
  }

  if (hasFix) {
    const source = fixSource === 'manual' ? 'Pinned to a stop' : 'GPS fix';
    if (!hasCurrentStage) {
      return {
        kind: 'fix',
        tone: 'neutral',
        headline: source,
        detail: 'Set a current stage in Stages to see progress along it.',
        actionKind: 'locate',
        actionLabel: 'Locate',
        showProgress: false,
        percent: null,
      };
    }
    if (!matched || progress == null) {
      return {
        kind: 'fix',
        tone: 'warn',
        headline: source,
        // Deliberately NOT "off route": an unmatched one-shot projection
        // says nothing about the mapped route as a whole.
        detail: `Not reliably matched to ${stage} — progress unavailable.`,
        actionKind: 'locate',
        actionLabel: 'Locate',
        showProgress: false,
        percent: null,
      };
    }
    return {
      kind: 'fix',
      tone: 'neutral',
      headline: `${source} · ${stage}`,
      detail: `${progress} — approximate.`,
      actionKind: 'locate',
      actionLabel: 'Locate',
      showProgress: true,
      percent,
    };
  }

  return {
    kind: hasCurrentStage ? 'idle' : 'no-stage',
    tone: 'neutral',
    headline: 'Where am I?',
    detail: hasCurrentStage
      ? `One-shot fix, or follow ${stage} live while you walk.`
      : 'Live tracking needs a current stage — set one in Stages.',
    actionKind: 'locate',
    actionLabel: 'Locate',
    showProgress: false,
    percent: null,
  };
}
