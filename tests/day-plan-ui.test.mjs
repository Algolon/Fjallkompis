/**
 * Day plan — the Settings and Today surfaces.
 *
 * Source-text contracts over the React surfaces. They fence the product
 * decisions that usability testing produced and that are easy to erode again:
 *
 *   - the default state (no plan) shows NO dates and NO activity indicators;
 *   - the planner is an overview, not a second route-detail screen;
 *   - editing is a deliberate mode, not permanent controls;
 *   - Today stays a one-viewport overview with no expanded stage cards.
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
const card = read('src/components/DayPlanCard.tsx');
const sheet = read('src/components/DayPlanDaySheet.tsx');
const onRoute = read('src/components/TodayOnRoute.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const css = read('src/styles/global.css');

const stripComments = (src) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- Naming and placement ---------------------------------------------------

test('the Settings section is called "Day plan" and follows Route direction', () => {
  const directionAt = settings.indexOf('id="direction"');
  const planAt = settings.indexOf('id="day-plan"');
  const readinessAt = settings.indexOf('<TrailReadinessCard');
  assert.ok(directionAt > 0 && planAt > 0);
  assert.ok(directionAt < planAt && planAt < readinessAt);
  assert.match(settings, /title="Day plan"/);
  assert.match(settings, /<DayPlanCard \/>/);
});

test('the feature is never named Itinerary, Trip plan, Journey or Schedule', () => {
  const copy = stripComments(card).replace(/\b\w+(\.\w+)+/g, '');
  for (const forbidden of [/\bitinerar/i, /\bjourney plan\b/i, /\bschedule\b/i]) {
    assert.ok(!forbidden.test(copy), `the feature is never called ${forbidden}`);
  }
  // "Trip plan" appears only to NAME the other feature — once in the removal
  // disclaimer, once when a referenced stay has been deleted there.
  assert.equal((copy.match(/Trip plan/g) ?? []).length, 2);
  assert.match(copy, /Trip plan, journal and stop notes are not affected/);
  assert.match(copy, /Stay no longer in your Trip plan/);
});

test('the supporting copy is the agreed sentence', () => {
  assert.match(
    card,
    /Plan what happens on each day of your journey\. Route stages, guides\s*\n?\s*and route data never change\./,
  );
});

test('no new navigation destination or route is added', () => {
  const routes = read('src/navigation/routes.mjs');
  assert.ok(!/day-?plan|hiking/i.test(routes), 'the tab table is untouched');
});

// ---- Default state ----------------------------------------------------------

test('with no plan the card invites one and states nothing exists yet', () => {
  assert.match(card, /if \(!dayPlan\) \{/);
  assert.match(card, /label="First day of your journey"/);
  assert.match(card, /Choosing a date creates a plan with one stage per day/);
  assert.match(settings, /Not set up — plan your journey day by day/);
});

test('the date field is the app-owned DateField — no native date input', () => {
  assert.match(card, /import \{ DateField \} from '\.\/DateField'/);
  assert.ok(!/type="date"/.test(card));
  assert.match(card, /onChange=\{createDayPlan\}/);
});

test('Today shows NO date and NO activity indicator without a plan', () => {
  // The unplanned branch renders the original stage hero: no date, no badge.
  const unplanned = onRoute.slice(
    onRoute.indexOf('function StageHero('),
    onRoute.indexOf('function StageJourney('),
  );
  assert.ok(!/DayTypeBadge|hero-day__date|formatDayDate/.test(unplanned));
  assert.match(unplanned, /Day \{stage\.day\} of \{stages\.length\}/);
  assert.match(onRoute, /const planned = plannedDays\.length > 0;/);
  assert.match(onRoute, /if \(!planned\) \{/);
});

// ---- View mode --------------------------------------------------------------

test('the plan list is an overview — no route statistics anywhere in it', () => {
  const list = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  for (const forbidden of [
    'formatDistanceKm',
    'formatHoursEstimate',
    'totalAscentM',
    'totalDescentM',
    'stageHighlights',
    'elevationProfile',
  ]) {
    assert.ok(!list.includes(forbidden), `the day list must not show ${forbidden}`);
  }
});

test('a day row shows date, what happens, the route line and tonight', () => {
  const list = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  assert.match(list, /const dateLabel = day\.date \? formatDateFieldLabel\(day\.date\) : null/);
  assert.match(list, /const kindsLabel = activityLabel\(day\.kinds\)/);
  assert.match(list, /const tonight = overnightLabel\(day\.overnight, trip\)/);
  assert.match(list, /dayplan-day__route/);
  assert.match(list, /via\{' '\}/);
  assert.match(list, /Tonight: \{tonight\}/);
  assert.match(list, /No overnight/);
});

test('view mode exposes no edit controls on the rows', () => {
  const list = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  assert.match(list, /\{editing \? \(\s*<button/, 'the Edit action is edit-mode only');
  assert.match(card, /\{editing \? <AddDayRow/, 'add-a-day is edit-mode only');
  assert.match(card, /\{editing \? \(\s*<>\s*<button\s*\n?\s*type="button"\s*\n?\s*className="btn btn-block"/s);
});

test('edit mode is a deliberate switch with an explicit Done', () => {
  assert.match(card, /onClick=\{\(\) => setEditing\(\(e\) => !e\)\}/);
  assert.match(card, /\{editing \? 'Done' : 'Edit plan'\}/);
  assert.match(card, /aria-pressed=\{editing\}/);
});

test('the consecutive-dates rule is stated where the start date is set', () => {
  assert.match(card, /Dates follow consecutive journey days\./);
});

// ---- Edit sheet -------------------------------------------------------------

test('a day is edited in a sheet, not inline in the list', () => {
  assert.match(card, /<DayPlanDaySheet day=\{openDay\} onClose=/);
  assert.match(sheet, /<dialog\s*\n?\s*ref=\{dialogRef\}\s*\n?\s*className="sheet"/);
  assert.match(sheet, /useOverlayScrollLock\(\)/);
});

test('the sheet offers the supported activity combinations only', () => {
  assert.match(sheet, /label="Hiking"/);
  assert.match(sheet, /label="Travel"/);
  assert.match(sheet, /label="Rest & explore"/);
  assert.match(sheet, /aria-pressed=\{pressed\}/);
  // Rest is exclusive, and a day always does something.
  assert.match(sheet, /if \(kind === 'rest'\)/);
  assert.match(sheet, /if \(kinds\.length === 0\) return;/);
});

test('a mixed day can swap its activity order', () => {
  assert.match(sheet, /\{hasHiking && hasTravel \?/);
  assert.match(sheet, /swapDayActivities\(day\.id\)/);
  assert.match(sheet, /'Hiking, then travel' : 'Travel, then hiking'/);
});

test('the endpoint chooser replaces boundary toggles entirely', () => {
  assert.match(sheet, /Change endpoint/);
  assert.match(sheet, /hikingEndpointOptions\(plannedDays, day\.index, itinerary\.stages\)/);
  // The retired interaction must not come back.
  for (const gone of ['End day at', 'Continue past', 'boundary', 'toggleBoundary']) {
    assert.ok(!sheet.includes(gone), `the boundary interaction is gone: ${gone}`);
    assert.ok(!card.includes(gone), `the boundary interaction is gone: ${gone}`);
  }
  assert.ok(!css.includes('.dayplan-boundary'), 'its CSS is gone too');
});

test('each endpoint option states its stages, distance and consequence', () => {
  const chooser = sheet.slice(sheet.indexOf('function EndpointChooser('));
  assert.match(chooser, /\{option\.stages\} \{option\.stages === 1 \? 'stage' : 'stages'\}/);
  assert.match(chooser, /formatDistanceKm\(option\.distanceKm\)/);
  assert.match(chooser, /Merges the following hiking day into this one\./);
  assert.match(chooser, /Splits the rest of the walking into a new day\./);
  // The one deliberate exception: nothing heavier than distance appears.
  for (const forbidden of ['totalAscentM', 'estimatedHours', 'stageHighlights', 'guide']) {
    assert.ok(!chooser.includes(forbidden), `the chooser must not show ${forbidden}`);
  }
});

test('the overnight chooser offers derived, stop, Trip stay and none', () => {
  const chooser = sheet.slice(sheet.indexOf('function OvernightChooser('));
  assert.match(chooser, /Where today’s walk ends/);
  assert.match(chooser, /itinerary\.orderedStops\.map/);
  assert.match(chooser, /state\.trip\.filter\(\(i\) => i\.kind === 'stay'\)/);
  assert.match(chooser, /No overnight/);
  assert.match(chooser, /onChoose\(undefined\)/, 'clearing returns to derived');
  // No free-text accommodation inside the Day plan.
  assert.ok(!/<input/.test(chooser), 'no free-text accommodation field');
  assert.match(chooser, /Add it in Lists → Trip and it will\s*\n?\s*appear here\./);
});

test('a deleted Trip stay is reported honestly, never rendered as a name', () => {
  assert.match(card, /Stay no longer in your Trip plan/);
  assert.match(sheet, /Stay no longer in your Trip plan/);
  assert.match(onRoute, /Stay no longer in your Trip plan/);
});

test('travel details are read-only and point at Lists → Trip', () => {
  assert.match(sheet, /Travel details live in Lists → Trip and are matched by date\./);
  assert.match(sheet, /No travel recorded for this date yet\./);
  const travel = sheet.slice(sheet.indexOf('{hasTravel ? ('), sheet.indexOf('<span className="section-label">Tonight'));
  assert.ok(!/<input|onChange/.test(travel), 'the day plan never edits transport');
});

// ---- Reset / remove / direction --------------------------------------------

test('reset is non-destructive and hidden when the plan is already default', () => {
  assert.match(card, /disabled=\{dayPlanIsDefault\}/);
  assert.match(card, /Reset to one stage per day/);
});

test('removal is destructive, confirmed and states what it does not touch', () => {
  assert.match(card, /className="btn btn-danger btn-block"/);
  assert.match(card, /title="Remove day plan\?"/);
  assert.match(card, /destructive/);
  assert.match(
    card,
    /The route stages, your current stage, packing list, Trip plan, journal and stop notes are not affected\./,
  );
});

test('a direction change with a plan is an explicit destructive choice', () => {
  assert.match(settings, /title=\{dayPlan \? 'Remove day plan and change direction\?' : 'Change route direction\?'\}/);
  assert.match(settings, /It cannot be reused the other way round, so it will be removed\./);
  assert.match(settings, /primaryLabel=\{dayPlan \? 'Remove day plan and change direction' : 'Change direction'\}/);
  assert.match(settings, /destructive=\{dayPlan != null\}/);
});

// ---- Today ------------------------------------------------------------------

test('Today carries NO expanded stage-detail section', () => {
  for (const gone of ['today-parts', 'Today’s stages', 'today-part__action', 'Part {i + 1}']) {
    assert.ok(!onRoute.includes(gone), `Today must not contain ${gone}`);
  }
  for (const gone of ['.today-parts', '.today-part__', '.hero-chip--light']) {
    assert.ok(!css.includes(gone), `global.css must not contain ${gone}`);
  }
});

test('the day-type indicator is icons in the existing eyebrow row', () => {
  assert.match(onRoute, /function DayTypeBadge\(\{ kinds \}/);
  assert.match(onRoute, /<span className="hero-day__type" aria-hidden>/);
  assert.match(onRoute, /<DayTypeBadge kinds=\{day\.kinds\} \/>/);
  // The words are always in the hero's accessible name.
  assert.match(onRoute, /const kindWords = day\.kinds\.map\(\(k\) => ACTIVITY_WORD\[k\]\)\.join\(' and '\)/);
  assert.match(onRoute, /aria-label=\{`Today: day \$\{day\.number\} of \$\{dayCount\}/);
  // It costs no height: it rides the eyebrow line.
  assert.match(css, /\.hero-day__type \{[^}]*margin-left: 8px;/s);
});

test('a multi-stage day offers one honest action and no whole-day map claim', () => {
  const combined = stripComments(
    onRoute.slice(onRoute.indexOf('{hiking && multiStage ? ('), onRoute.indexOf(') : hiking && currentStage ? (')),
  );
  assert.match(combined, /Open in Stages/);
  assert.ok(!/Stage Guide|View Route|mapStageId/.test(combined));
  assert.ok(!/Stage guides/.test(combined), 'never a plural label for one deep link');
});

test('a single-stage planned day keeps chips and both original actions', () => {
  assert.match(onRoute, /hiking && !multiStage && !travel && currentStage\s*\?\s*stageHighlights/);
  const single = onRoute.slice(onRoute.indexOf(') : hiking && currentStage ? ('), onRoute.indexOf('{/* Travel-ONLY days'));
  assert.match(single, /Stage Guide/);
  assert.match(single, /View Route/);
});

test('a travel day shows its matched movements and opens Trip', () => {
  assert.match(onRoute, /const travelLine = day\.travelItems/);
  assert.match(onRoute, /No travel added yet/);
  assert.match(onRoute, /Open in Trip/);
  // A MIXED day keeps the two walking actions; the transfer is already a line
  // above, and a third button would break the block's fixed responsibility.
  assert.match(onRoute, /\{travel && !hiking \? \(/);
});

test('a rest day names where it is based and opens Stop info', () => {
  assert.match(onRoute, /Based at \$\{stopShortName\(STOPS_BY_ID\[day\.overnight\.stopId\]\)\}/);
  assert.match(onRoute, /Stop info/);
});

test('Tonight follows the effective overnight and is omitted when there is none', () => {
  assert.match(onRoute, /day\.overnight\.kind === 'stop' \? \(day\.overnight\.stopId \?\? null\) : null/);
  assert.match(onRoute, /<TonightCard stopId=\{overnightStopId\}/);
  assert.match(onRoute, /<StayTonightCard title=\{overnightStay\.title\}/);
  assert.match(onRoute, /\) : null\}\s*\n\s*<\/>/, 'no Tonight card when the overnight is none');
});

test('the journey rail runs over planned days when a plan exists', () => {
  assert.match(onRoute, /function PlannedJourney\(/);
  assert.match(onRoute, /plannedDays\.map\(\(d\) => \{/);
  assert.match(onRoute, /Day \{day\.number\} of \{plannedDays\.length\}/);
  assert.match(onRoute, /key=\{d\.id\}/, 'markers key on the stable day id');
  // A non-hiking day still gets a marker, marked as off-trail.
  assert.match(onRoute, /d\.stages\.length === 0 \? ' is-off-trail' : ''/);
  assert.match(css, /\.journey-step\.is-off-trail \.journey-dot \{/);
});

test('Today reads no clock — the date comes from the plan', () => {
  assert.ok(!/todayIso|Date\.now|new Date\(/.test(onRoute));
  assert.match(onRoute, /formatDateFieldLabel/);
});
