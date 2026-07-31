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

test('the Day plan has one accessible persistent Today switch only when a plan exists', () => {
  assert.match(card, /Use Day plan on Today/);
  assert.match(card, /Show your planned calendar days instead of the generic seven-stage journey\./);
  assert.match(card, /role="switch"/);
  assert.match(card, /aria-checked=\{dayPlan\.journeyActive\}/);
  assert.match(card, /setDayPlanJourneyActive\(!dayPlan\.journeyActive\)/);
  assert.match(card, /Currently used by Today\./);
  assert.match(css, /\.setting-switch \{[^}]*height: 44px;/s);
  const noPlan = card.slice(card.indexOf('if (!dayPlan) {'), card.indexOf('const lastDay'));
  assert.ok(!noPlan.includes('role="switch"'), 'no switch exists until a plan exists');
});

test('the planned-day chooser is modal, cancellable and separates selection from Preview', () => {
  assert.match(onRoute, /function PlannedDayChooser\(/);
  assert.match(onRoute, /className="sheet planned-day-chooser"/);
  assert.match(onRoute, /showModal\(\)/);
  assert.match(onRoute, /chooserTriggerRef\.current\?\.focus\(\)/);
  assert.match(onRoute, /onClose=\{onClose\}/);
  assert.match(onRoute, /onCancel=\{\(e\) => \{ e\.preventDefault\(\); onClose\(\); \}\}/);
  assert.match(onRoute, /if \(e\.key === 'Escape'\)/);
  assert.match(onRoute, /e\.target === dialogRef\.current/);
  assert.match(onRoute, /setCurrentPlannedDay\(d\.id\)/);
  assert.match(onRoute, /Follow plan dates/);
  assert.match(onRoute, /disabled=\{dayPlan\?\.currentDayId == null && dayPlan\?\.currentLegId == null\}/);
  assert.match(card, /Set current day/);
  assert.match(card, /Preview day/);
});

test('manual and clamped sources use height-neutral, accessible wording', () => {
  for (const copy of ['Selected', 'Up next', 'Plan ended']) assert.ok(onRoute.includes(copy), copy);
  assert.match(onRoute, /Manually selected planned day/);
  assert.match(onRoute, /the plan has not started yet/);
  assert.match(onRoute, /showing the final planned day/);
  assert.match(onRoute, /hero-day__source/);
  assert.ok(!onRoute.includes('today-source-row'), 'no standalone Today status row');
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

test('a manually selected day is named and the chooser offers date following', () => {
  // A pointer set via Stages → "Set as current" never expires on its own, so
  // while one is active Today must SAY the day was chosen manually and offer
  // the return to date-following — outside the day-edit action hierarchy.
  assert.match(onRoute, /source === 'manual'/);
  assert.match(onRoute, /'Selected'/);
  assert.match(onRoute, /Manually selected planned day/);
  assert.match(onRoute, /Follow plan dates/);
  assert.match(onRoute, /followPlanDates\(\); onClose\(\);/);
  // Gated on the RESOLVED source, never re-derived from the pointer or the
  // clock — and rendered only in the planned branch, so no-plan mode (where
  // the source is always 'generic') cannot show it. Exactly one gate.
  assert.equal((onRoute.match(/source === 'manual'/g) ?? []).length, 3);
  const generic = onRoute.slice(onRoute.indexOf('if (!planned) {'), onRoute.indexOf('// ---- Planned state'));
  assert.ok(!/followPlanDates/.test(generic), 'the generic branch is untouched');
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

test('the leg editor replaces the stage-count endpoint chooser entirely', () => {
  assert.match(sheet, /Edit route legs/);
  assert.match(sheet, /function LegEditor\(/);
  // The retired interactions must not come back.
  for (const gone of [
    'Change endpoint',
    'EndpointChooser',
    'hikingEndpointOptions',
    'mergeConsequence',
    'setHikingDayStages',
    'End day at',
    'Continue past',
    'toggleBoundary',
  ]) {
    assert.ok(!sheet.includes(gone), `the stage-count interaction is gone: ${gone}`);
    assert.ok(!card.includes(gone), `the stage-count interaction is gone: ${gone}`);
  }
  assert.ok(!css.includes('.dayplan-boundary'), 'its CSS is gone too');
});

test('the leg editor lists the exact ordered legs with their oriented routes', () => {
  const editor = sheet.slice(sheet.indexOf('function LegEditor('));
  assert.match(editor, /day\.legs\.map\(\(leg, i\) => \{/);
  assert.match(editor, /\{stopName\(leg\.stage\.fromHutId\)\} → \{stopName\(leg\.stage\.toHutId\)\}/);
  assert.match(editor, /formatDistanceKm\(leg\.stage\.distanceKm\)/);
  // A leg walked against the plan's own direction says so, explicitly.
  assert.match(editor, /walks the section in reverse/);
  assert.match(editor, /leg\.orientation !== natural/);
  // A repeated stage names its other occurrences instead of hiding them.
  assert.match(editor, /Also walked/);
  assert.match(editor, /stageOccurrences\(plannedDays, leg\.stageId\)/);
});

test('every leg action is gated on the pure model and touches one day', () => {
  const editor = sheet.slice(sheet.indexOf('function LegEditor('));
  // Reverse / remove / repeat / move are the model's own predicates.
  assert.match(editor, /canReverseLeg\(rawLegs, leg\.id, STAGE_TOPOLOGY\)/);
  assert.match(editor, /canRemoveLeg\(rawLegs, leg\.id, STAGE_TOPOLOGY\)/);
  assert.match(editor, /withLegRepeated\(rawLegs, legId, STAGE_TOPOLOGY\) !== rawLegs/);
  assert.match(editor, /withLegMoved\(rawLegs, from, to, STAGE_TOPOLOGY\) !== rawLegs/);
  // Every mutation goes through the store's per-day leg actions.
  for (const action of [
    'addHikingLeg(day.id',
    'removeHikingLeg(day.id',
    'reverseHikingLeg(day.id',
    'repeatHikingLeg(day.id',
    'moveHikingLeg(day.id',
  ]) {
    assert.ok(editor.includes(action), `${action} …) is the only write path`);
  }
  // A blocked control says why rather than accepting a dead tap.
  assert.match(editor, /would disconnect the day’s walk/);
  assert.match(editor, /A hiking day walks at least one leg/);
});

test('add-candidates show from → to, orientation, distance and prior planning', () => {
  const editor = sheet.slice(sheet.indexOf('function LegEditor('));
  assert.match(editor, /legCandidatesTo\(STAGE_TOPOLOGY, day\.fromStopId\)/);
  assert.match(editor, /legCandidatesFrom\(STAGE_TOPOLOGY, day\.toStopId\)/);
  assert.match(editor, /Add before the start/);
  assert.match(editor, /Add after the end/);
  assert.match(editor, /\{stopName\(candidate\.fromStopId\)\} → \{stopName\(candidate\.toStopId\)\}/);
  assert.match(editor, /formatDistanceKm\(stageDistanceKm\(candidate\.stageId\)\)/);
  assert.match(editor, /Already planned on day/);
  // Concise decision info only — no guide or highlight content in the editor.
  for (const forbidden of ['stageHighlights', 'stageGuide', 'elevationProfile', 'totalAscentM']) {
    assert.ok(!editor.includes(forbidden), `the editor must not show ${forbidden}`);
  }
});

test('reverse and repeat are explicit about what they do', () => {
  const editor = sheet.slice(sheet.indexOf('function LegEditor('));
  assert.match(editor, /Walk this section the other way round/);
  assert.match(editor, /a second occurrence, the first stays where it is/);
  assert.match(editor, /> Reverse\s*<\/button>/);
  assert.match(editor, /> Walk again\s*<\/button>/);
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

test('removing a day\'s walking is explicit, confirmed and names the route', () => {
  // Rest on a walking day, or toggling hiking off, never silently drops the
  // legs: the confirmation states what is removed and that no other day
  // changes — the coverage gap becomes a diagnostic, not a repair.
  assert.match(sheet, /setConfirmingDrop\(\['rest'\]\)/);
  assert.match(sheet, /Remove the day’s walking\?/);
  // The finalised copy: name the legs and the route, and state BOTH that no
  // other planned day changes and that no walking is redistributed.
  assert.match(sheet, /This removes the day's walking — \$\{\s*\n?\s*dropLegs === 1 \? 'its one leg' : `all \$\{dropLegs\} legs`\s*\n?\s*\}/);
  assert.match(sheet, /No other planned day changes and no walking moves to another day/);
  assert.match(sheet, /dropDayHiking\(day\.id, confirmingDrop\)/);
  // The leg editor offers the same explicit exit for the final leg.
  assert.match(sheet, /Remove walking from this day/);
  // No donor/heir machinery — nothing borrows or inherits stages any more.
  for (const gone of ['hikingDonorIndex', 'hikingHeirIndex', 'canInsertHikingDay', 'NO_DONOR', 'NO_HEIR']) {
    assert.ok(!sheet.includes(gone), `${gone} is gone`);
    assert.ok(!card.includes(gone), `${gone} is gone from the card`);
  }
});

test('a blocked activity toggle is disabled and says why', () => {
  assert.match(sheet, /blocked=\{kindBlocked\('hiking'\)\}/);
  assert.match(sheet, /blocked=\{kindBlocked\('travel'\)\}/);
  assert.match(sheet, /blocked=\{kindBlocked\('rest'\)\}/);
  assert.match(sheet, /disabled=\{blocked !== null\}/);
  // And a blocked toggle never reaches the store.
  assert.match(sheet, /if \(kindBlocked\(kind\)\) return;/);
  // Taking on walking names the proposed section up front — and ONLY
  // auto-proceeds when exactly one not-yet-planned candidate exists; every
  // other case (a fork, or only repeats) opens the explicit chooser.
  assert.match(sheet, /Adding hiking starts this day with/);
  assert.match(sheet, /the connecting section not yet in your plan/);
  assert.match(sheet, /newDayLegCandidates\(plannedDays, day\.index/);
  assert.match(sheet, /startUnplanned\.length === 1 \? startUnplanned\[0\] : null/);
  assert.match(sheet, /setChoosingStart\(kinds\)/);
  assert.match(sheet, /<StartLegOptions/);
  assert.match(sheet, /asks which connecting section this day starts with/);
});

test('a new hiking day never repeats a stage silently', () => {
  // Add-day: the fast path exists only for the single not-yet-planned
  // candidate; forks and repeat-only cases open the chooser, with repeats
  // marked. The shared options component is the one place that renders a
  // candidate, so the two surfaces cannot diverge.
  assert.match(card, /const unplanned = candidates\.filter\(\(c\) => !c\.alreadyPlanned\);/);
  assert.match(card, /unplanned\.length === 1 \? unplanned\[0\] : null/);
  assert.match(card, /proposed \? onAdd\(\['hiking'\], proposed\) : setChoosingStart\(true\)/);
  assert.match(card, /the connecting\s+section not yet in your plan/);
  assert.match(card, /Sections already in your plan\s*\n?\s*are marked\./);
  const options = read('src/components/StartLegOptions.tsx');
  assert.match(options, /Already planned/);
  assert.match(options, /choosing\s*\n?\s*it walks the section again/);
  assert.match(options, /walks the section in reverse/);
  assert.match(options, /formatDistanceKm/);
  assert.ok(!/stageGuide|stageHighlights/.test(options), 'decision info only');
});

test('a destructive confirmation is never offered for a mutation that no-ops', () => {
  const actions = sheet.slice(sheet.indexOf('<div className="sheet-actions">'), sheet.indexOf("{view === 'legs'"));
  assert.match(actions, /disabled=\{!canRemove\}/);
  assert.match(sheet, /This is the only day in your plan\./);
  // Day removal now states that the walking goes WITH the day.
  assert.match(sheet, /is removed with it — no other day changes\./);
});

test('the coverage summary is informational, edit-mode only, and never mutates', () => {
  // One compact summary; specifics behind a native disclosure. It reads the
  // pure selector — no local re-derivation — and offers NO repair action.
  assert.match(card, /function CoverageSummary\(\)/);
  assert.match(card, /dayPlanCoverageDiagnostics\(plannedDays, dayPlan\?\.direction \?\? '', STAGE_TOPOLOGY\)/);
  assert.match(card, /if \(!hasCoverageDifferences\(diagnostics\)\) return null;/);
  assert.match(card, /Your plan differs from the full route/);
  assert.match(card, /coverageSummaryLines\(diagnostics\)/);
  // Rendered inside the edit-mode branch only.
  const editBlock = card.slice(card.indexOf('{editing ? ('), card.indexOf('<ol className="dayplan"'));
  assert.match(editBlock, /<CoverageSummary \/>/);
  // Information, not alarm: no repair verbs, no store action in the summary.
  const summary = card.slice(card.indexOf('function CoverageSummary('), card.indexOf('/** One day in the compact list'));
  assert.ok(!/setDayActivities|addHikingLeg|removeHikingLeg|dropDayHiking|onClick/.test(summary),
    'the summary never mutates or offers a one-tap repair');
  assert.ok(!/error|invalid|fix\b/i.test(summary.replace(/\/\*[\s\S]*?\*\//g, '')),
    'differences are never framed as errors');
});

test('the recovery notice is calm, offers export, and removal needs confirming', () => {
  assert.match(card, /function RecoveryNotice\(\)/);
  assert.match(card, /if \(!dayPlanRecovery\) return null;/, 'invisible in every ordinary state');
  assert.match(card, /Your saved Day plan could not be migrated to this version\./);
  assert.match(card, /The original was set aside untouched and nothing else was affected\./);
  assert.match(card, /Download original plan/);
  assert.match(card, /downloadJson\('fjallkompis-day-plan-recovery\.json'/);
  assert.match(card, /dayPlan: dayPlanRecovery\.dayPlan,/, 'the export carries the verbatim value');
  // Removal is explicit: a confirmation dialog naming permanence, then the
  // one store action. Nothing here renders or interprets the payload.
  assert.match(card, /Remove recovery copy/);
  assert.match(card, /Remove the recovery copy\?/);
  assert.match(card, /deleted permanently — download it first if you want to keep it\./);
  assert.match(card, /removeDayPlanRecovery\(\);/);
  const notice = card.slice(card.indexOf('function RecoveryNotice('), card.indexOf('/** Compact activity glyphs'));
  assert.ok(!/\.days|\.legs|stages|normalize/.test(notice), 'the payload is opaque to the UI');
  // Present in BOTH branches — with and without an active plan.
  assert.equal((card.match(/<RecoveryNotice \/>/g) ?? []).length, 2);
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
  assert.match(onRoute, /function DayTypeBadge\(\{ kinds, reversed \}/);
  assert.match(onRoute, /<span className="hero-day__type" aria-hidden>/);
  assert.match(onRoute, /<DayTypeBadge kinds=\{day\.kinds\} reversed=\{contraryLegCount > 0\} \/>/);
  // The words are always in the hero's accessible name, in stored order.
  assert.match(onRoute, /const kindWords = activityOrderPhrase\(day\);/);
  assert.match(onRoute, /aria-label=\{`\$\{previewing \? 'Previewing' : 'Today'\}: day \$\{day\.number\} of \$\{dayCount\}/);
  // It costs no height: it rides the eyebrow line.
  assert.match(css, /\.hero-day__type \{[^}]*margin-left: 8px;/s);
});

test('previewing keeps the ordered activity glyphs visible (v0.26.2 regression)', () => {
  // v0.26.2 shipped `.hero--preview .hero-day__type { display: none }`: a
  // previewed day no longer said whether it was Hiking, Travel, Rest or a
  // mixed day. The badge renders unconditionally — including while
  // previewing — and no preview rule may hide it again. Narrow viewports
  // WRAP the badge (kept whole via nowrap) under the exit pill's reserved
  // corner; hiding the day's meaning is not a layout strategy.
  const previewTypeRule =
    css.match(/\.hero--preview \.hero-day__type \{[^}]*\}/s)?.[0] ?? '';
  assert.ok(!/display:\s*none/.test(previewTypeRule), 'preview must not hide the glyphs');
  assert.ok(!/visibility:\s*hidden/.test(previewTypeRule), 'nor make them invisible');
  assert.match(previewTypeRule, /white-space: nowrap/);
  // The badge itself is unconditional in the hero — not gated on previewing.
  assert.match(onRoute, /<DayTypeBadge kinds=\{day\.kinds\} reversed=\{contraryLegCount > 0\} \/>/);
  assert.ok(
    !/previewing[^]{0,80}<DayTypeBadge/.test(onRoute),
    'the badge must not sit inside a previewing conditional',
  );
  // Glyph order is the stored activity order (Hiking→Travel ≠ Travel→Hiking),
  // and the ordered words stay in the accessible name in both modes.
  assert.match(onRoute, /\{kinds\.map\(\(kind\) => \{/);
  assert.match(onRoute, /const kindWords = activityOrderPhrase\(day\);/);
  // The exit control names its ACTION (never a "Preview" state label), and
  // previewing still adds no standalone row (height-neutral rule).
  assert.match(onRoute, /aria-hidden \/> Exit\s*<\/button>/);
  assert.match(onRoute, /aria-label="Exit preview — return to today’s own view"/);
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

test('all three surfaces acknowledge a title-only movement (v0.26.2 regression)', () => {
  // The reproduced defect: the day sheet listed the matched movement by its
  // own title while the compact Day plan row and Today — both fed by the
  // shared presenter — dropped an item whose from/to were empty and said
  // "no travel added yet". The presenter's title fallback is unit-tested in
  // day-presentation.test.mjs; here the SHEET must keep rendering the same
  // derived day.travelItems by title, so the three surfaces cannot disagree
  // about a title-only bus again.
  assert.match(sheet, /\{day\.travelItems\.map\(\(item\) => \(/);
  assert.match(sheet, /<strong>\{item\.title\}<\/strong>/);
  // The sheet reads the derived day's matched items — the exact array the
  // presenter summarises — never a private re-match of state.trip by date.
  assert.ok(
    !/state\.trip[^]{0,60}\.filter\([^]{0,80}date/.test(stripComments(sheet)),
    'the sheet never re-matches trip items itself',
  );
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

test('a leg walked against the route direction is stated, height-neutrally', () => {
  // The marker rides the EXISTING eyebrow badge (no new line, the same rule
  // the activity glyphs follow); the exact count rides the accessible name;
  // and the oriented title endpoints plus the leg editor tell the full
  // story. A hero-via sentence measured +36px at 375×667 — a new variant
  // may not introduce overflow, so the words live in the label, not a row.
  assert.match(onRoute, /const naturalOrientation = isReversed\(routeDirection\) \? 'opposite' : 'canonical';/);
  assert.match(onRoute, /l\.orientation !== naturalOrientation/);
  assert.match(onRoute, /reversed=\{contraryLegCount > 0\}/);
  assert.match(onRoute, /\{reversed \? <ArrowUpDown size=\{14\}/);
  assert.match(onRoute, /Walked in reverse of the route direction\./);
  assert.match(onRoute, /legs walked in reverse of the route direction\./);
  assert.match(onRoute, /\}\. \$\{kindWords\}\.\$\{sourceWords\}\$\{reversedWords\}`\}/);
  // No standalone hero row for it — the height-neutral rule.
  assert.ok(!/hero-via">[^<]*reverse/.test(onRoute), 'never a dedicated via line');
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

test('the row marker distinguishes previewing, current and unrelated rows', () => {
  const row = card.slice(card.indexOf('function DayRow('), card.indexOf('function AddDayRow('));
  // Previewing replaces the Preview action on the previewed row; the REAL
  // (manual or date-resolved) day keeps its Today pill; other rows Preview.
  assert.match(row, /marker === 'previewing' \? \(/);
  assert.match(row, /Previewing/);
  assert.match(row, /marker === 'current' \? \(/);
  assert.match(row, /Set current day/);
  // The marker derives from the ONE store resolution, never a local re-derive.
  assert.match(card, /day\.id === currentPlannedDay\?\.id/);
  assert.match(card, /todaySource === 'preview'/);
  // Preview both sets the transient pointer AND navigates to Today.
  assert.match(card, /previewPlannedDay\(day\.id\);/);
  assert.match(card, /onNavigate\('today'\);/);
});

test('Today names the preview and offers exactly one way out', () => {
  // HEIGHT-NEUTRAL by construction: the marker rides the hero's existing
  // eyebrow line and the exit pill floats in the hero's corner. Previewing
  // must never add a standalone vertical section — the planned variants
  // already spend the whole 375x667 budget (measured: a one-stage hero plus
  // a 50px status row overflowed `main` by 23px).
  assert.match(onRoute, /hero\$\{previewing \? ' hero--preview' : ''\}/);
  assert.match(onRoute, /hero-day__preview/);
  assert.match(onRoute, /Preview · /);
  assert.match(onRoute, /className="hero-exit"/);
  assert.match(onRoute, /onClick=\{onExitPreview\}/);
  assert.match(onRoute, /onExitPreview=\{exitDayPreview\}/);
  assert.match(onRoute, /aria-label="Exit preview — return to today’s own view"/);
  // The exit control lives INSIDE the hero, not as a sibling row, and the
  // old standalone status row must not come back in any wording.
  const hero = onRoute.slice(
    onRoute.indexOf('function PlannedDayHero('),
    onRoute.indexOf('function PlannedJourney('),
  );
  assert.match(hero, /hero-exit/);
  assert.ok(!onRoute.includes('Previewing planned day'), 'no standalone preview row');
  // Source context stays in the existing eyebrow; no standalone status row.
  assert.equal((onRoute.match(/today-override /g) ?? []).length, 0);
  // The CSS enforces the same rule: an absolutely positioned corner pill
  // (out of flow) with a ≥44px touch target, and eyebrow space reserved so
  // narrow viewports wrap under the pill instead of colliding with it.
  assert.match(css, /\.hero-exit \{[^}]*position: absolute;/s);
  assert.match(css, /\.hero-exit::after \{[^}]*inset: -9px;/s);
  assert.match(css, /\.hero--preview \.hero-day \{[^}]*padding-right: \d+px;/s);
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
