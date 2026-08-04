/**
 * Live-tracking pill state — the ONLY status surface the Map keeps.
 *
 * The Map is a clean instrument: in the idle state nothing floats over it but
 * the scope control and the compact control stack. A status surface appears
 * exactly while a foreground live-tracking session runs, and it stays small:
 * a live dot, "Following Day 1", one short route state, and an explicit Stop.
 *
 * The qualified-wording rules survive from the earlier progress presentation,
 * because they are product rules, not layout:
 *  - "You may be off route" is said ONLY for a debounced off-route status
 *    from the COMPLETE-route matcher — never because a fix failed to match
 *    the current stage, and never on a single poor reading;
 *  - an uncertain matcher says the MATCH is uncertain, not that the hiker is
 *    somewhere wrong;
 *  - before any fix lands the pill says it is waiting, rather than implying
 *    a verdict;
 *  - stage-progress numbers are deliberately NOT here: current-stage
 *    progress needs a deliberate home (Today), and half a readout on the map
 *    would be worse than none.
 *
 * Pure ESM so tests/map-tracking-pill.test.mjs can pin every state in node.
 */
import { UNCERTAIN_UI_CONSECUTIVE } from '../utils/trackingSession.mjs';

/**
 * @param {object} o
 * @param {boolean} [o.active]        a live session is running
 * @param {boolean} [o.following]     the camera is following the position
 * @param {string|null} [o.stageLabel] short label of the tracked stage ("Day 4")
 * @param {'on-route'|'off-route'|'uncertain'|'unknown'|null} [o.routeStatus]
 * @param {number} [o.uncertainStreak] consecutive uncertain fixes (damping)
 * @param {boolean} [o.hasFix]        at least one accepted fix has landed
 * @returns {null | {
 *   tone: 'neutral'|'warn',
 *   following: boolean,
 *   label: string,
 *   state: string,
 *   stopLabel: string,
 *   note: string,
 * }} null when nothing should be shown.
 */
export function trackingPill({
  active = false,
  following = false,
  stageLabel = null,
  routeStatus = null,
  uncertainStreak = 0,
  hasFix = false,
} = {}) {
  if (!active) return null;
  const stage = stageLabel ?? 'today’s stage';

  const offRoute = routeStatus === 'off-route';
  const uncertain =
    !offRoute && routeStatus === 'uncertain' && uncertainStreak >= UNCERTAIN_UI_CONSECUTIVE;

  let state;
  if (offRoute) state = 'You may be off route';
  else if (!hasFix) state = 'Waiting for GPS';
  else if (uncertain) state = 'Match uncertain';
  else if (routeStatus === 'on-route') state = 'On route';
  else state = 'Waiting for GPS';

  return {
    tone: offRoute ? 'warn' : 'neutral',
    following,
    // Following vs merely tracking is a real difference: a deliberate pan
    // pauses the camera without ending the session, and the pill has to say
    // which of the two is happening.
    label: following ? `Following ${stage}` : `Tracking ${stage}`,
    state,
    stopLabel: 'Stop',
    note: offRoute
      ? 'Check the map and your surroundings.'
      : 'Foreground only — tracking pauses if the screen locks or you leave the Map.',
  };
}

/** What the transition announcement should say, or '' for no announcement. */
export function trackingAnnouncement(pill) {
  if (!pill) return '';
  return `${pill.label}. ${pill.state}.`;
}
