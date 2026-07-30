/**
 * Hiking days — the Settings configuration surface
 * (src/components/HikingDaysCard.tsx, mounted by src/screens/SettingsScreen.tsx).
 *
 * Source-text contracts over the React surface, the established technique for
 * screens in this repo. They fence the product decisions that are easy to
 * erode: the boundary control's dual accessible name, its 44px target, the
 * non-overnight framing of the copy, reset vs remove, and the fact that this
 * screen never edits canonical stage data.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const card = read('src/components/HikingDaysCard.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const css = read('src/styles/global.css');

// ---- Placement --------------------------------------------------------------

test('Hiking days is a Settings accordion directly after Route direction', () => {
  const directionAt = settings.indexOf('id="direction"');
  const hikingAt = settings.indexOf('id="hiking-days"');
  const readinessAt = settings.indexOf('<TrailReadinessCard');
  assert.ok(directionAt > 0 && hikingAt > 0, 'both sections exist');
  assert.ok(directionAt < hikingAt, 'Route direction comes first');
  assert.ok(hikingAt < readinessAt, 'Hiking days precedes Trail readiness');
  assert.match(settings, /title="Hiking days"/);
  assert.match(settings, /<HikingDaysCard \/>/);
});

test('no new navigation destination, route or Prepare entry point is added', () => {
  const routes = read('src/navigation/routes.mjs');
  assert.ok(!/hiking|dayplan|day-plan/i.test(routes), 'the tab table is untouched');
  const prepare = read('src/components/TodayPrepare.tsx');
  assert.ok(
    !/[Hh]iking days|dayPlan|plannedDays/.test(prepare),
    'Prepare gains no summary card in this iteration',
  );
});

test('the collapsed summary states the plan without expanding it', () => {
  assert.match(settings, /const hikingDaysSummary = dayPlan/);
  assert.match(settings, /hiking \$\{plannedDays\.length === 1 \? 'day' : 'days'\} from/);
  assert.match(settings, /One stage per day — set a first hiking date to plan/);
});

// ---- Naming -----------------------------------------------------------------

/**
 * Prose only: comments and member-expression identifiers removed, so a store
 * value named `itinerary.statistics` can't be mistaken for user-facing copy.
 */
function prose(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\b\w+(\.\w+)+/g, '');
}

test('the user-facing name is "Hiking days" — never itinerary, trip, journey or schedule', () => {
  const copy = prose(card);
  assert.match(copy, /hiking days/i);
  for (const forbidden of [/\bitinerar/i, /\bjourney\b/i, /\bschedule\b/i]) {
    assert.ok(!forbidden.test(copy), `this feature is never called ${forbidden}`);
  }
  // "Trip plan" appears exactly once, and only to name the OTHER feature that
  // removal leaves alone — never as a name for this one.
  const tripMentions = copy.match(/Trip plan/g) ?? [];
  assert.equal(tripMentions.length, 1);
  assert.match(copy, /packing list, Trip plan, journal and stop notes are not affected/);
});

// ---- No plan ----------------------------------------------------------------

test('with no plan the card explains the feature and offers the first date', () => {
  assert.match(card, /if \(!dayPlan\) \{/);
  assert.match(card, /Plan how the route stages are divided across your hiking days/);
  assert.match(card, /The\s*\n?\s*stages themselves, their guides and their route data never change/);
  assert.match(card, /label="First hiking day"/);
  assert.match(card, /Choosing a date creates a plan with one stage per day/);
});

test('the date field is the existing app-owned DateField — no native date input', () => {
  assert.match(card, /import \{ DateField \} from '\.\/DateField'/);
  assert.ok(!/type="date"/.test(card), 'no native date input is introduced');
  assert.match(card, /onChange=\{setFirstHikingDate\}/);
});

// ---- Active plan ------------------------------------------------------------

test('an active plan shows day count, date range and total route distance', () => {
  assert.match(card, /\{plannedDays\.length\} hiking \{plannedDays\.length === 1 \? 'day' : 'days'\}/);
  assert.match(card, /\{firstLabel\} – \{lastLabel\}/);
  // The days partition the route, so the total is their sum — one source.
  assert.match(
    card,
    /formatDistanceKm\(plannedDays\.reduce\(\(sum, d\) => sum \+ d\.distanceKm, 0\)\)/,
  );
});

test('the consecutive-dates limitation is stated where the plan is configured', () => {
  assert.match(card, /Dates assume you hike on consecutive days\./);
});

test('a day card shows its number, date, endpoints and aggregate statistics', () => {
  assert.match(card, /Day \{day\.number\}/);
  assert.match(card, /\{dateLabel\}/);
  assert.match(card, /const dayRoute = `\$\{shortName\(day\.fromStopId\)\} → \$\{shortName\(day\.toStopId\)\}`/);
  assert.match(card, /formatDistanceKm\(day\.distanceKm\)/);
  assert.match(card, /↗ \{day\.totalAscentM \?\? '—'\} m/);
  assert.match(card, /↘ \{day\.totalDescentM \?\? '—'\} m/);
  assert.match(card, /formatHoursEstimate\(day\.estimatedHours\)/);
});

test('a multi-stage day names its via-stops and lists its canonical parts', () => {
  assert.match(card, /const multi = day\.stages\.length > 1/);
  assert.match(card, /via \{day\.viaStopIds\.map\(shortName\)\.join\(' and '\)\}/);
  assert.match(card, /Part \{j \+ 1\}/);
  assert.match(card, /shortName\(stage\.fromHutId\)\} → \{shortName\(stage\.toHutId\)/);
  // Parts keep their own canonical distance — never a share of the day's total.
  assert.match(card, /formatDistanceKm\(stage\.distanceKm\)/);
});

// ---- Boundary control -------------------------------------------------------

test('one button both combines and splits, carrying its state in aria-pressed', () => {
  assert.match(card, /function BoundaryToggle\(/);
  assert.match(card, /aria-pressed=\{active\}/);
  assert.match(card, /onClick=\{\(\) => onToggle\(stageIndex\)\}/);
  // Components never touch groups; they address a boundary by stage index.
  assert.ok(!/groups/.test(card), 'the card never manipulates the raw grouping');
});

test('the accessible name states the CURRENT state and the RESULT of activating', () => {
  const label = /const label = active[\s\S]*?`;/.exec(card)[0];
  // Active: a day ends here → activating combines.
  assert.match(label, /End day at \$\{stopName\}\./);
  assert.match(label, /Activate to continue past \$\{stopName\} and walk the next stage on the same day\./);
  // Removed: the stages share a day → activating splits.
  assert.match(label, /Continue past \$\{stopName\}\./);
  assert.match(label, /Activate to end the day at \$\{stopName\} and split it into two days\./);
  // Both names describe the current grouping too.
  assert.match(label, /ends the day here\./);
  assert.match(label, /is currently one hiking day\./);
});

test('boundary copy never claims the user sleeps at the stop', () => {
  // A user may stay at the hut, camp nearby, or simply end the day's walking
  // there — the control talks about ending the day, never about sleeping.
  const copy = prose(card);
  for (const forbidden of [/overnight/i, /\bsleep/i, /stay the night/i, /camp here/i]) {
    assert.ok(!forbidden.test(copy), `copy avoids ${forbidden} framing`);
  }
});

test('the boundary control meets the 44px touch target and shows focus', () => {
  assert.match(css, /\.dayplan-boundary \{[^}]*min-height: 30px;/s);
  // 30px visual + a 7px inset pseudo-element on each side = 44px hit area,
  // the same technique as the Today mode pill.
  assert.match(css, /\.dayplan-boundary::after \{[^}]*inset: -7px 0;/s);
  assert.match(css, /\.dayplan-boundary:focus-visible \{\s*outline: 2px solid var\(--glacier-700\);/);
  assert.match(css, /\.dayplan-boundary:active \{\s*transform: scale\(0\.97\);/);
});

test('the boundary is a real button, so keyboard activation is native', () => {
  const toggle = /function BoundaryToggle\([\s\S]*$/.exec(card)[0];
  assert.match(toggle, /<button\s+type="button"/);
  assert.ok(!/onKeyDown|role="button"|tabIndex/.test(toggle), 'no re-implemented button');
});

// ---- Activation, reset, removal ---------------------------------------------

test('a day can be made current, and the current day says so instead', () => {
  assert.match(card, /onClick=\{onActivate\}/);
  assert.match(card, /aria-label=\{`Make day \$\{day\.number\}, \$\{dayRoute\}, the current hiking day`\}/);
  assert.match(card, /onActivate=\{\(\) => activatePlannedDay\(day\.index\)\}/);
  assert.match(card, /isCurrent \? \(\s*<span className="pill pill-current">/);
});

test('Reset keeps the date, needs no confirmation and hides when already default', () => {
  assert.match(card, /disabled=\{dayPlanIsDefault\}/);
  assert.match(card, /onClick=\{resetDayPlan\}/);
  assert.match(card, /Reset to one stage per day/);
  // Reset is NOT routed through a confirmation dialog.
  const reset = /Reset to one stage per day[\s\S]{0,200}/.exec(card)[0];
  assert.ok(!/ConfirmDialog/.test(reset));
});

test('Remove is destructive, confirmed, and states what it does NOT touch', () => {
  assert.match(card, /className="btn btn-danger btn-block"/);
  assert.match(card, /onClick=\{\(\) => setConfirmRemove\(true\)\}/);
  assert.match(card, /<ConfirmDialog/);
  assert.match(card, /title="Remove hiking days\?"/);
  assert.match(card, /destructive/);
  assert.match(
    card,
    /The route stages, your current stage, packing list, Trip plan, journal and stop notes are not affected\./,
  );
  assert.match(card, /onCancel=\{\(\) => setConfirmRemove\(false\)\}/);
});

test('removal uses the shared ConfirmDialog (focus trap + opener restore)', () => {
  assert.match(card, /import \{ ConfirmDialog \} from '\.\/ConfirmDialog'/);
  const dialog = read('src/components/ConfirmDialog.tsx');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /useOverlayScrollLock/);
});

// ---- Route direction --------------------------------------------------------

test('the direction confirmation explains the reset only when a plan exists', () => {
  assert.match(settings, /if \(currentStage \|\| dayPlan\) setPending\(dir\);/);
  assert.match(
    settings,
    /Your hiking days will return to one stage per day\. Your first hiking date will be kept\./,
  );
  assert.match(settings, /\(dayPlan\s*\n?\s*\?/, 'the extra sentence is conditional');
});

// ---- Canonical data ---------------------------------------------------------

test('the card reads canonical data but never writes it', () => {
  assert.match(card, /import \{ STOPS_BY_ID, stopShortName \} from '\.\.\/data\/stops'/);
  for (const forbidden of ['geoJson', 'points', 'gpx', 'elevationProfile', 'bounds']) {
    assert.ok(!card.includes(forbidden), `the card never touches ${forbidden}`);
  }
});

// ---- Canonical "Stage N" terminology ----------------------------------------
//
// A canonical route segment is ALWAYS a stage, whether or not a personal plan
// exists; a planned hiking day is always "Day N of M". The two vocabularies
// never swap places and never depend on each other's state.

test('Stages labels canonical segments "Stage N", never "Day N"', () => {
  const stagesScreen = read('src/screens/StagesScreen.tsx');
  assert.match(stagesScreen, /Stage \{stage\.day\}/);
  assert.match(stagesScreen, /aria-label=\{`Set stage \$\{stage\.day\} as the current stage`\}/);
  assert.match(stagesScreen, /aria-label=\{`Stage \$\{stage\.day\} guide`\}/);
  assert.match(stagesScreen, /aria-label=\{`Stage \$\{stage\.day\} — highlights and detours`\}/);
  assert.ok(!/Day \{stage\.day\}|Day \$\{stage\.day\}/.test(stagesScreen), 'no Day N on a stage');
  // The label is unconditional — never a ternary on whether a plan exists.
  assert.ok(!/dayPlan|plannedDays/.test(stagesScreen), 'Stages never reads the personal plan');
});

test('Stages header states the stage count from data, not a hardcoded week', () => {
  const stagesScreen = read('src/screens/StagesScreen.tsx');
  assert.match(stagesScreen, /eyebrow=\{`\$\{stages\.length\} stages · \$\{itinerary\.orderedStops\.length\} stops`\}/);
  assert.match(stagesScreen, /as \{stages\.length\}\s*\n?\s*fixed\s*\n?\s*stages/);
  assert.ok(!/seven day stages|7 days/.test(stagesScreen), 'no stale calendar-week copy');
});

test('Map uses canonical Stage N labels in stage contexts', () => {
  const mapScreen = read('src/screens/MapScreen.tsx');
  assert.match(mapScreen, /`Stage \$\{currentStage\.day\}: /);
  assert.match(mapScreen, /stageLabel=\{`Stage \$\{currentStage\.day\}`\}/);
  assert.match(mapScreen, /aria-label=\{`Stage \$\{s\.day\}`\}/);
  assert.ok(!/Day \$\{s\.day\}|Day \$\{currentStage\.day\}/.test(mapScreen), 'no Day N on the Map');
  assert.ok(!/dayPlan|plannedDays/.test(mapScreen), 'the Map never reads the personal plan');
});

test('the Map keeps its stage colouring and canonical day property', () => {
  const mapStyle = read('src/map/mapStyle.ts');
  // ItineraryStage.day remains the canonical stage sequence position: the
  // colour expression still matches on it, one colour per stage.
  assert.match(mapStyle, /\['get', 'day'\]/);
  assert.match(mapStyle, /export const STAGE_COLORS: Record<number, string> = \{/);
  const itinerary = read('src/route/itinerary.mjs');
  assert.match(itinerary, /toLineString\(points, \{ stageId: stage\.id, day: itineraryDay \}\)/);
});

test('Today labels planned days "Day N of M" and stage parts "Part N"', () => {
  const todayScreen = read('src/screens/TodayScreen.tsx');
  assert.match(todayScreen, /Day \{day\.number\} of \{plannedDays\.length\}/);
  assert.match(todayScreen, /Part \{i \+ 1\}/);
  // Per-part links name the stage guide, matching the hero's Stage Guide.
  assert.match(todayScreen, /aria-hidden \/> Stage guide/);
});
