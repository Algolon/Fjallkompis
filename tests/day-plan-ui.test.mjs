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
  assert.match(settings, /<DayPlanCard onNavigate=\{onNavigate\} \/>/);
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
  assert.match(onRoute, /const planned = plannedDays\.length > 0 && day !== null;/);
  assert.match(onRoute, /if \(!planned\) \{/);
});

test('a plan without an effective day renders the SAME generic view — never blank', () => {
  // The 0.26.1 regression fence: a fresh plan has currentDayId null, and a
  // future or expired plan matches no date. Today used to render an empty
  // "No day selected yet" card; now the ONE planned gate requires a resolved
  // day, so every no-day case falls into the unchanged generic branch.
  assert.ok(!/NoDayEmpty/.test(onRoute), 'the empty planned state is gone');
  assert.ok(!/No day selected yet/.test(onRoute));
  assert.ok(!/Open day plan/.test(onRoute));
  // And there is exactly one branch point: nothing else forks on the plan.
  assert.equal((onRoute.match(/plannedDays\.length > 0/g) ?? []).length, 1);
});

test('the effective day comes from the store resolution, not from isCurrent', () => {
  const screen = read('src/screens/TodayScreen.tsx');
  assert.match(screen, /currentPlannedDay/);
  assert.match(screen, /day=\{currentPlannedDay\}/);
  // The screen and the view never re-resolve: no clock, no isCurrent scan.
  assert.ok(!/todayIso|localIsoDate|isCurrent/.test(screen));
});

test('an active manual override is named and offers exactly one way back', () => {
  // A pointer set via Stages → "Set as current" never expires on its own, so
  // while one is active Today must SAY the day was chosen manually and offer
  // the return to date-following — outside the day-edit action hierarchy.
  assert.match(onRoute, /\) : todaySource === 'override' \? \(/);
  assert.match(onRoute, /Manually selected day/);
  assert.match(onRoute, /Follow plan dates/);
  assert.match(onRoute, /onClick=\{followPlanDates\}/);
  // Gated on the RESOLVED source, never re-derived from the pointer or the
  // clock — and rendered only in the planned branch, so no-plan mode (where
  // the source is always 'generic') cannot show it. Exactly one gate.
  assert.equal((onRoute.match(/todaySource === 'override'/g) ?? []).length, 1);
  const generic = onRoute.slice(onRoute.indexOf('if (!planned) {'), onRoute.indexOf('// ---- Planned state'));
  assert.ok(!/todaySource|followPlanDates/.test(generic), 'the generic branch is untouched');
  // It stays out of the edit sheet: this is not a day-editing action.
  assert.ok(!sheet.includes('Follow plan dates'));
  assert.ok(!sheet.includes('followPlanDates'));
  // The quiet-row styling exists and is not a banner.
  assert.match(css, /\.today-override \{[^}]*justify-content: space-between;/s);
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
  // The consequence is COUNTED, never a fixed sentence: a distant endpoint can
  // absorb several days, and one about "the following hiking day" understates
  // it. Both branches carry a singular and a plural form.
  const merge = sheet.slice(sheet.indexOf('function mergeConsequence('), sheet.indexOf('/**\n * The one place'));
  assert.match(merge, /the next hiking day/);
  assert.match(merge, /the next \$\{option\.absorbedDays\} hiking days/);
  assert.match(merge, /Merges \$\{days\} into this day\./);
  // A nearer endpoint takes stages without emptying a day, and says so.
  assert.match(merge, /Takes \$\{stages\} from the next hiking day\./);
  assert.match(merge, /Merges \$\{days\} into this day and shortens the one after\./);
  assert.match(chooser, /Creates a new hiking day for the remaining stage\./);
  assert.match(
    chooser,
    /Creates a new hiking day for the remaining \$\{option\.releasedStages\} stages\./,
  );
  assert.ok(
    !/Merges the following hiking day|Splits the rest of the walking/.test(chooser),
    'the uncounted sentences are gone',
  );
  // The one deliberate exception: nothing heavier than distance appears.
  for (const forbidden of ['totalAscentM', 'estimatedHours', 'stageHighlights', 'guide']) {
    assert.ok(!chooser.includes(forbidden), `the chooser must not show ${forbidden}`);
  }
});

test('the overnight chooser offers derived, stop, Trip stay and none', () => {
  const chooser = sheet.slice(sheet.indexOf('function OvernightChooser('));
  assert.match(chooser, /Where today’s walk ends/);
  assert.match(chooser, /itinerary\.orderedStops/);
  assert.match(chooser, /state\.trip\.filter\(\(i\) => i\.kind === 'stay'\)/);
  assert.match(chooser, /No overnight/);
  assert.match(chooser, /onChoose\(undefined\)/, 'clearing returns to derived');
  // No free-text accommodation inside the Day plan.
  assert.ok(!/<input/.test(chooser), 'no free-text accommodation field');
  assert.match(chooser, /Add it in Lists → Trip and it will\s*\n?\s*appear here\./);
});

test('a rest day can always go back to inheriting the night before', () => {
  const chooser = sheet.slice(sheet.indexOf('function OvernightChooser('));
  // The derived option is offered for ANY derivation, not just a walk's end,
  // so an overridden rest day is not a one-way door.
  assert.match(chooser, /const derived = day\.derivedOvernight;/);
  assert.match(chooser, /Same as last night — follows the day before/);
  assert.match(chooser, /derived\.kind !== 'none' && derivedLabel \? \(/);
  // Choosing it CLEARS the stored reference rather than pinning the answer.
  assert.match(chooser, /onClick=\{\(\) => onChoose\(undefined\)\}/);
});

test('derived is visibly distinct and is selected only when nothing is stored', () => {
  const chooser = sheet.slice(sheet.indexOf('function OvernightChooser('));
  assert.match(chooser, /const isDerived = day\.overnight\.source !== 'explicit';/);
  assert.match(chooser, /dayplan-option--derived/);
  assert.match(css, /\.dayplan-option--derived \{[^}]*border-style: dashed;/s);
  // An explicit entry never lights up just because the derivation agrees.
  for (const guard of [/!isDerived && day\.overnight\.kind === 'stop'/, /!isDerived &&\s*\n?\s*day\.overnight\.kind === 'stay'/, /!isDerived && day\.overnight\.kind === 'none'/]) {
    assert.match(chooser, guard);
  }
});

test('the chooser never lists the derived location twice', () => {
  const chooser = sheet.slice(sheet.indexOf('function OvernightChooser('));
  // Two entries reading "Nikkaluokta" that persist different states are a
  // trap: the derived one stays, the duplicate explicit one is filtered out.
  assert.match(chooser, /\.filter\(\(stop\) => stop\.id !== derivedStopId\)/);
  assert.match(chooser, /\.filter\(\(stay\) => stay\.id !== derivedStayId\)/);
  // Every OTHER stop and stay stays available as a deliberate override.
  assert.match(chooser, /onChoose\(\{ kind: 'stop', stopId: stop\.id \}\)/);
  assert.match(chooser, /onChoose\(\{ kind: 'stay', tripItemId: stay\.id \}\)/);
  assert.match(chooser, /onChoose\(\{ kind: 'none' \}\)/);
});

// ---- Invalid edits are refused before they are offered ----------------------

test('every day-sheet control is gated on the model rule, not a local copy', () => {
  assert.match(sheet, /from '\.\.\/plan\/dayPlan\.mjs'/);
  assert.match(sheet, /const canTakeAStage = canInsertHikingDay\(plannedDays, day\.index\);/);
  assert.match(sheet, /const canGiveUpWalking = canDropHikingFromDay\(plannedDays, day\.index\);/);
  assert.match(sheet, /const canRemove = canRemoveDay\(plannedDays, day\.index\);/);
  // The superseded approximation must not come back.
  assert.ok(
    !/canRemove = plannedDays\.length > 1/.test(sheet),
    'removal is not gated on the day count alone',
  );
});

test('a blocked activity toggle is disabled and says why', () => {
  assert.match(sheet, /blocked=\{kindBlocked\('hiking'\)\}/);
  assert.match(sheet, /blocked=\{kindBlocked\('travel'\)\}/);
  assert.match(sheet, /blocked=\{kindBlocked\('rest'\)\}/);
  assert.match(sheet, /disabled=\{blocked !== null\}/);
  assert.match(sheet, /\{blockedNotes\.map\(\(note\) => \(/);
  // The reason reuses the Add day flow's sentence.
  assert.match(sheet, /Every stage already has its own hiking day/);
  assert.match(card, /Every stage already has its own hiking day/);
  // And a blocked toggle never reaches the store.
  assert.match(sheet, /if \(kindBlocked\(kind\)\) return;/);
});

test('a destructive confirmation is never offered for a mutation that no-ops', () => {
  const actions = sheet.slice(sheet.indexOf('<div className="sheet-actions">'), sheet.indexOf('{view === \'endpoint\''));
  assert.match(actions, /disabled=\{!canRemove\}/);
  assert.match(actions, /title=\{canRemove \? undefined : removeBlockedReason\}/);
  assert.match(sheet, /\{removeBlockedReason\}/, 'the reason is visible, not only a tooltip');
  assert.match(
    sheet,
    /plannedDays\.length <= 1 \? 'This is the only day in your plan\.' : NO_HEIR/,
  );
  assert.match(sheet, /This is the only day with walking, so its route stages have nowhere to go\./);
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
  // The words are always in the hero's accessible name, in stored order.
  assert.match(onRoute, /const kindWords = activityOrderPhrase\(day\);/);
  assert.match(onRoute, /aria-label=\{`\$\{previewing \? 'Previewing' : 'Today'\}: day \$\{day\.number\} of \$\{dayCount\}/);
  // It costs no height: it rides the eyebrow line.
  assert.match(css, /\.hero-day__type \{[^}]*margin-left: 8px;/s);
});

test('a multi-stage day offers one honest action and no whole-day map claim', () => {
  const combined = stripComments(
    onRoute.slice(
      onRoute.indexOf('{hiking && multiStage && leadStage ? ('),
      onRoute.indexOf(') : hiking && leadStage ? ('),
    ),
  );
  assert.match(combined, /Open in Stages/);
  assert.match(combined, /guideStageId: leadStage\.id/, "it opens the DAY's first stage");
  assert.ok(!/Stage Guide|View Route|mapStageId/.test(combined));
  assert.ok(!/Stage guides/.test(combined), 'never a plural label for one deep link');
});

test('a single-stage planned day keeps chips and both original actions', () => {
  assert.match(onRoute, /hiking && !multiStage && !travel && leadStage\s*\?\s*stageHighlights/);
  const single = onRoute.slice(
    onRoute.indexOf(') : hiking && leadStage ? ('),
    onRoute.indexOf('{/* Travel-ONLY days'),
  );
  assert.match(single, /Stage Guide/);
  assert.match(single, /View Route/);
});

test('every planned-day hero fact comes from the DAY, never from currentStage', () => {
  // The regression: chips and actions were sourced from the global route
  // pointer while route and statistics came from the day, so a split could
  // show one stage's terrain under another stage's title.
  const hero = stripComments(
    onRoute.slice(onRoute.indexOf('function PlannedDayHero('), onRoute.indexOf('function PlannedJourney(')),
  );
  assert.ok(!/currentStage/.test(hero), 'the planned hero never reads currentStage');
  assert.match(hero, /const leadStage: ItineraryStage \| null = day\.stages\[0\] \?\? null;/);
  // Chips and both deep links resolve through that same day-owned stage.
  assert.match(hero, /stageHighlights\(leadStage\.id/);
  assert.match(hero, /guideStageId: leadStage\.id/);
  assert.match(hero, /mapStageId: leadStage\.id/);
});

test('the no-plan hero still runs on currentStage, unchanged', () => {
  const stageHero = stripComments(
    onRoute.slice(onRoute.indexOf('function StageHero('), onRoute.indexOf('function StageJourney(')),
  );
  assert.match(stageHero, /stageHighlights\(stage\.id/);
  assert.match(stageHero, /guideStageId: stage\.id/);
  assert.match(stageHero, /mapStageId: stage\.id/);
  // TodayOnRoute passes the route pointer straight through in the no-plan path.
  assert.match(onRoute, /<StageHero\s+stage=\{currentStage\}/);
});

test('a travel day shows its matched movements and opens Trip', () => {
  assert.match(onRoute, /const travelLine = travelPresentation\(day\);/);
  assert.match(onRoute, /Open in Trip/);
  // A MIXED day keeps the two walking actions; the transfer is already a line
  // above or below, and a third button would break the fixed responsibility.
  assert.match(onRoute, /\{travel && !hiking \? \(/);
});

// ---- Activity order ---------------------------------------------------------
//
// The stored order records whether the transfer happens before or after the
// walking. Both surfaces must say so, in the same words, or the day sheet's
// swap control is a button that appears to do nothing.

test('both surfaces read activity order from ONE shared helper', () => {
  for (const [name, src] of [['Today', onRoute], ['the planner', card]]) {
    assert.match(
      src,
      /from '\.\.\/plan\/dayPresentation\.mjs'/,
      `${name} imports the shared presenter`,
    );
    assert.match(src, /travelPresentation\(day\)/, `${name} asks it for the travel line`);
    // No surface re-derives the wording or the ordering for itself.
    assert.ok(
      !/then travel \{|then travel \$\{/.test(stripComments(src)),
      `${name} never hardcodes the sequencing copy`,
    );
  }
});

test('Today places the travel line by the stored order, not by a fixed slot', () => {
  const hero = onRoute.slice(
    onRoute.indexOf('function PlannedDayHero('),
    onRoute.indexOf('function PlannedJourney('),
  );
  // Above the route when travel comes first...
  const before = hero.indexOf("travelLine?.position === 'before'");
  const title = hero.indexOf('<h2 className="hero-title">');
  const after = hero.indexOf("travelLine && travelLine.position !== 'before'");
  assert.ok(before > 0 && title > 0 && after > 0);
  assert.ok(before < title, 'a leading transfer renders above the walking route');
  assert.ok(after > title, 'a following transfer renders below it');
  // The accessible name carries the same sequence.
  assert.match(hero, /const kindWords = activityOrderPhrase\(day\);/);
  assert.match(hero, /aria-label=\{`\$\{previewing \? 'Previewing' : 'Today'\}: day \$\{day\.number\} of \$\{dayCount\}/);
});

test('the planner places the travel line by the same rule and leads the walk', () => {
  const row = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  const before = row.indexOf("travelLine?.position === 'before'");
  const route = row.indexOf('<h3 className="dayplan-day__route">');
  const after = row.indexOf("travelLine?.position === 'after'");
  assert.ok(before > 0 && route > 0 && after > 0);
  assert.ok(before < route && after > route);
  assert.match(row, /const walkLead = hikingLead\(day\);/);
  assert.match(row, /\{walkLead \? <span className="dayplan-day__lead">\{walkLead\} <\/span> : null\}/);
});

test('a mixed day never hides its travel when no Trip item matches the date', () => {
  // Travel-only already had an honest empty state; the mixed day rendered
  // nothing at all and was indistinguishable from a plain hiking day.
  const hero = onRoute.slice(
    onRoute.indexOf('function PlannedDayHero('),
    onRoute.indexOf('function PlannedJourney('),
  );
  assert.ok(
    !/travelLine\.text|travelLine &&\s*!travelLine\.isEmpty/.test(hero),
    'Today renders the line unconditionally, empty state included',
  );
  const row = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  assert.match(row, /travelLine\?\.position === 'only' && travelLine\.isEmpty/);
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

// ---- Transient planned-day preview ------------------------------------------
//
// The Day plan ↔ Today connection: any planned day can be INSPECTED in its
// Today presentation without touching route progress. Preview is presentation
// only (the store contracts prove transience); these fence the surfaces.

test('view mode offers a small explicit Preview action, never the whole row', () => {
  const row = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  assert.match(row, /Preview/);
  assert.match(row, /onClick=\{onPreview\}/);
  // A full accessible name: the day and its concise route/activity summary.
  assert.match(row, /aria-label=\{`Preview day \$\{day\.number\} on Today — \$\{previewSummary\}`\}/);
  // The row article itself is never a button/navigation target.
  assert.ok(!/<article[^>]*onClick/.test(row), 'the row is a reading surface, not a control');
  // Edit mode keeps Edit — Preview renders only when NOT editing (the same
  // ternary slot), and no Save/OK/Done/Make-this-today exists anywhere.
  assert.match(row, /\{editing \? \(/);
  for (const gone of ['Make this today', '>Save<', '>OK<', '>Done<']) {
    assert.ok(!row.includes(gone), `${gone} must not exist on a day row`);
  }
});

test('the row marker distinguishes previewing, today and unrelated rows', () => {
  const row = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  // Previewing replaces the Preview action on the previewed row; the REAL
  // (manual or date-resolved) day keeps its Today pill; other rows Preview.
  assert.match(row, /marker === 'previewing' \? \(/);
  assert.match(row, /Previewing/);
  assert.match(row, /marker === 'today' \? \(/);
  // The marker derives from the ONE store resolution, never a local re-derive.
  assert.match(card, /day\.id === currentPlannedDay\?\.id/);
  assert.match(card, /todaySource === 'preview'/);
  // Preview both sets the transient pointer AND navigates to Today.
  assert.match(card, /previewPlannedDay\(day\.id\);/);
  assert.match(card, /onNavigate\('today'\);/);
});

test('Today names the preview and offers exactly one way out', () => {
  assert.match(onRoute, /\{previewing \? \(/);
  assert.match(onRoute, /Previewing planned day/);
  assert.match(onRoute, /Exit preview/);
  assert.match(onRoute, /onClick=\{exitDayPreview\}/);
  // Reuses the manual-override row's scale — same class, same slot, before
  // Journey — and the two rows are mutually exclusive branches of ONE ternary.
  const previewAt = onRoute.indexOf('Previewing planned day');
  const journeyAt = onRoute.indexOf('<PlannedJourney');
  assert.ok(previewAt > 0 && previewAt < journeyAt, 'the status row precedes Journey');
  assert.match(onRoute, /previewing \? \([\s\S]*?today-override[\s\S]*?\) : todaySource === 'override' \? \(/);
});

test('a previewed day is never announced as actual progress', () => {
  // Hero leads with "Previewing", Journey says "(previewing)" and drops the
  // aria-current step claim.
  assert.match(onRoute, /previewing \? 'Previewing' : 'Today'/);
  assert.match(onRoute, /previewing \? ' \(previewing\)' : ' \(current day\)'/);
  assert.match(onRoute, /aria-current=\{status === 'current' && !previewing \? 'step' : undefined\}/);
  // The preview flag is the RESOLVED source, nothing else.
  assert.match(onRoute, /const previewing = todaySource === 'preview';/);
});

test('Settings gained exactly one navigation duty: Preview → Today', () => {
  assert.match(settings, /onNavigate\?: \(tab: TabId\) => void;/);
  const uses = settings.match(/onNavigate/g) ?? [];
  // Declaration, prop destructure/doc and the single pass-through — no other
  // Settings control navigates anywhere.
  assert.ok(uses.length <= 4, `Settings must not grow other navigations (${uses.length})`);
  assert.match(settings, /<DayPlanCard onNavigate=\{onNavigate\} \/>/);
});
