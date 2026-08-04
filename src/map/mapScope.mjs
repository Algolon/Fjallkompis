/**
 * Map SCOPE vocabulary — what the map is currently showing, and how that
 * relates to the stage the trip is actually tracked against.
 *
 * Two deliberately separate concepts (never merge them):
 *  - the VIEWED scope: `viewStageId` on the Map, in-memory browse state
 *    (null = the whole route). Changing it only moves the camera.
 *  - the CURRENT stage: the persisted trip stage that route progress and
 *    live tracking are computed from. Only Stages (and starting a live
 *    session, which focuses it) touch that.
 *
 * The UI has to make the difference legible, so the words live here — pure,
 * injected names, no data imports — and are fenced by
 * tests/map-scope.test.mjs.
 */

export const FULL_ROUTE_LABEL = 'Full route';

/** "Day 3 · Alesjaure → Tjäktja" — the scope pill and sheet option label. */
export function stageScopeLabel({ day, fromName, toName }) {
  return `Day ${day} · ${fromName} → ${toName}`;
}

/** Short form for tight places (the dock's viewing/tracking line). */
export function stageShortLabel(day) {
  return `Day ${day}`;
}

/**
 * What the scope pill reads. A temporary "View on map" focus wins while it
 * is showing (the map is framing that geometry, not a stage); otherwise the
 * viewed stage, otherwise the full route.
 */
export function scopePillLabel({ focusLabel = null, viewStage = null } = {}) {
  if (focusLabel) return focusLabel;
  if (viewStage) return stageScopeLabel(viewStage);
  return FULL_ROUTE_LABEL;
}

/**
 * The viewed/current mismatch — "Viewing Day 5 · Tracking Day 4" — or null
 * when there is nothing to explain.
 *
 * Null in three cases, deliberately:
 *  - no current stage (there is no second thing to confuse it with);
 *  - the map is already on the current stage;
 *  - the map is on the FULL ROUTE. Browsing the whole route makes no
 *    competing claim about which day is being tracked — the dock's own
 *    headline already names the tracked stage — and the line would then be
 *    permanent chrome in the most common state, on the viewport where the
 *    camera can least afford the height (see map/mapPadding.mjs).
 */
export function scopeMismatch({
  viewedStageId = null,
  viewedDay = null,
  trackedStageId = null,
  trackedDay = null,
} = {}) {
  if (!trackedStageId || trackedDay == null) return null;
  if (!viewedStageId || viewedDay == null) return null;
  if (viewedStageId === trackedStageId) return null;
  return {
    viewing: stageShortLabel(viewedDay),
    tracking: stageShortLabel(trackedDay),
  };
}
