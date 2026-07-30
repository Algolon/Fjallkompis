/**
 * Day plan — how a day's activities READ.
 *
 * A day's activity array is ordered, and that order is the whole point: it
 * records whether the transfer happens before or after the walking. Today and
 * the Settings planner both have to say so, and they have to say the same
 * thing — so the vocabulary and the ordering rules live here once instead of
 * being re-derived (and drifting) in two React components.
 *
 * This module presents; it never decides. It reads a derived PlannedDay and
 * returns strings. No canonical data, no Trip data and no plan state is
 * created, copied or persisted here — a travel line is assembled from the
 * matched Trip items at render time and thrown away again.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises the wording
 * directly — the convention shared with dayPlan.mjs and plannedDays.mjs.
 */
import { DAY_ACTIVITY_LABELS } from './dayPlan.mjs';

/** The empty state a day shows when no Trip movement matches its date. */
const NO_TRAVEL = 'no travel added yet';

/**
 * The day's activities as one ordered phrase — "Hiking, then Travel",
 * "Travel, then Hiking", "Rest & explore". Used for the non-hiking hero title
 * and, on every variant, for the accessible name, so screen-reader output
 * carries the same sequence the eye sees.
 */
export function activityOrderPhrase(day) {
  const kinds = day?.kinds ?? [];
  const words = kinds.map((k) => DAY_ACTIVITY_LABELS[k]).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words[0]}, then ${words.slice(1).join(', then ').toLowerCase()}`;
}

/**
 * The transport a day's Trip items describe: "Nikkaluokta → Kiruna", several
 * legs joined. Endpoints are the user's own free text and are never invented —
 * a leg missing one end renders "?" rather than a guess, and a leg missing
 * both is dropped.
 */
export function travelItemsText(items) {
  if (!Array.isArray(items)) return '';
  return items
    .filter((i) => i?.kind === 'transport')
    .map((i) => [i.from, i.to])
    .filter(([a, b]) => a || b)
    .map(([a, b]) => `${a ?? '?'} → ${b ?? '?'}`)
    .join(', ');
}

/**
 * How a day's travel activity reads, or null when the day has none.
 *
 *   position  'only'   the day is travel (or travel + rest is impossible, so
 *                      simply: no walking) — the line stands alone;
 *             'before' travel comes first: the line goes ABOVE the walk;
 *             'after'  travel follows the walk: the line goes BELOW it.
 *   line      the ready-to-render sentence, including its lead word and the
 *             honest empty state.
 *
 * A mixed day ALWAYS gets a line: a Hiking + Travel day with nothing recorded
 * in Lists → Trip must not be indistinguishable from a plain hiking day, so it
 * says so in the same words the travel-only day already uses.
 */
export function travelPresentation(day) {
  const kinds = day?.kinds ?? [];
  if (!kinds.includes('travel')) return null;
  const text = travelItemsText(day?.travelItems);
  const isEmpty = text === '';

  if (!kinds.includes('hiking')) {
    // Travel alone: no lead word to sequence against.
    return {
      position: 'only',
      lead: null,
      text,
      isEmpty,
      line: isEmpty ? capitalise(NO_TRAVEL) : text,
    };
  }

  const travelFirst = kinds.indexOf('travel') < kinds.indexOf('hiking');
  const lead = travelFirst ? 'Travel' : 'then travel';
  return {
    position: travelFirst ? 'before' : 'after',
    lead,
    text,
    isEmpty,
    line: isEmpty ? `${lead} — ${NO_TRAVEL}` : `${lead} ${text}`,
  };
}

/**
 * The lead word for the walking line when travel already happened earlier the
 * same day ("then hike"), else null. Surfaces with room render it in front of
 * the route; Today's hero conveys the same sequence by position alone, because
 * its one-viewport budget has no line to spare.
 */
export function hikingLead(day) {
  const kinds = day?.kinds ?? [];
  if (!kinds.includes('hiking') || !kinds.includes('travel')) return null;
  return kinds.indexOf('travel') < kinds.indexOf('hiking') ? 'then hike' : null;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
