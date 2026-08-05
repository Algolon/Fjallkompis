/**
 * CHARACTERIZATION — the effective-Today resolution.
 *
 * Behavioural, not structural: every assertion drives the real modules
 * (src/plan/effectiveToday.mjs and src/plan/plannedDays.mjs) with real inputs
 * and pins the value they return TODAY. Nothing here describes a wanted future
 * behaviour; where the current answer is surprising it is pinned as-is and
 * called out in a comment.
 *
 * Why it exists: the vNext restructuring moves Today's controls (Set as
 * current, occurrence selection, Follow plan dates, progress) between screens
 * and gives Plan the ownership of the personal journey. The one thing that
 * must survive all of that untouched is WHICH planned day Today decides it is
 * showing, and on what grounds — the six-source ladder
 *
 *     preview → manual → date → before-plan → after-plan → generic
 *
 * plus the rule that the resolution only ever READS.
 *
 * Regressions this catches: a reordered ladder; a preview that stops
 * outranking a manual pointer (or starts implying progress); a manual pointer
 * that survives `journeyActive === false`; a dangling pointer that stops
 * falling through; a clamp that starts guessing on dates it cannot order; a
 * resolver that starts writing pointers back or cloning its inputs; and any
 * change to which derived day/leg the persisted pointer pair marks current.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TODAY_SOURCES,
  plannedDayForDate,
  resolveEffectiveToday,
} from '../src/plan/effectiveToday.mjs';
import {
  buildPlannedDays,
  currentLegIndex,
  currentPlannedDayOf,
  plannedDaysForStage,
} from '../src/plan/plannedDays.mjs';

// ---- Fixtures ---------------------------------------------------------------

/**
 * Derived planned days, as `buildPlannedDays` hands them to the resolver.
 * Consecutive dates — the shape the derivation always produces (a day's date
 * is `startDate + index`, see dayPlan.mjs `dateForDayIndex`).
 */
const CONSECUTIVE = [
  { id: 'day_1', number: 1, date: '2026-09-03', kinds: ['travel'] },
  { id: 'day_2', number: 2, date: '2026-09-04', kinds: ['hiking'] },
  { id: 'day_3', number: 3, date: '2026-09-05', kinds: ['hiking'] },
  { id: 'day_4', number: 4, date: '2026-09-06', kinds: ['rest'] },
  { id: 'day_5', number: 5, date: '2026-09-07', kinds: ['hiking', 'travel'] },
];

const resolve = ({
  days = CONSECUTIVE,
  preview = null,
  active = true,
  manual = null,
  today = '2026-09-05',
  stage = 'd4',
} = {}) => resolveEffectiveToday(days, preview, active, manual, today, stage);

/** A minimal oriented stage view — everything `buildPlannedDays` reads. */
const stageView = (id, fromHutId, toHutId) => ({
  id,
  fromHutId,
  toHutId,
  distanceKm: 12,
  estimatedHours: 4,
  totalAscentM: 300,
  totalDescentM: 250,
  minimumElevationM: 400,
  maximumElevationM: 900,
  points: [{ cumulativeDistanceKm: 0 }, { cumulativeDistanceKm: 12 }],
  elevationProfile: [
    { distanceKm: 0, elevationM: 400, lat: 68.3, lon: 18.8 },
    { distanceKm: 12, elevationM: 900, lat: 68.2, lon: 18.9 },
  ],
});

const ORIENTED = {
  canonical: {
    d1: stageView('d1', 'abisko', 'abiskojaure'),
    d2: stageView('d2', 'abiskojaure', 'alesjaure'),
    d3: stageView('d3', 'alesjaure', 'tjaktja'),
  },
  opposite: {
    d1: stageView('d1', 'abiskojaure', 'abisko'),
    d2: stageView('d2', 'alesjaure', 'abiskojaure'),
    d3: stageView('d3', 'tjaktja', 'alesjaure'),
  },
};

const leg = (id, stageId, orientation = 'canonical') => ({
  id,
  kind: 'canonical-stage',
  stageId,
  orientation,
});

/** A plan with a travel day, a two-leg hiking day, a rest day and a walk back. */
const planWith = (currentDayId, currentLegId) => ({
  direction: 'abisko-to-nikkaluokta',
  startDate: '2026-09-03',
  journeyActive: true,
  currentDayId,
  currentLegId,
  days: [
    { id: 'day_1', activities: [{ kind: 'travel' }] },
    {
      id: 'day_2',
      activities: [{ kind: 'hiking', legs: [leg('leg_2a', 'd1'), leg('leg_2b', 'd2')] }],
    },
    { id: 'day_3', activities: [{ kind: 'rest' }] },
    {
      id: 'day_4',
      activities: [{ kind: 'hiking', legs: [leg('leg_4a', 'd2', 'opposite')] }],
    },
  ],
});

// ---- The ladder -------------------------------------------------------------

test('the six decision sources exist in exactly this precedence order', () => {
  assert.deepEqual(TODAY_SOURCES, [
    'preview',
    'manual',
    'date',
    'before-plan',
    'after-plan',
    'generic',
  ]);
});

test('removing each winning source reveals exactly the next one down', () => {
  // One input set, six answers: the ladder is walked from the top by taking
  // away only the source that just won. This is the whole contract in one
  // test — reordering ANY two rungs turns it red.
  const base = { days: CONSECUTIVE, preview: 'day_1', manual: 'day_4', today: '2026-09-05' };

  assert.equal(resolve(base).source, 'preview');
  assert.equal(resolve({ ...base, preview: null }).source, 'manual');
  assert.equal(resolve({ ...base, preview: null, manual: null }).source, 'date');
  assert.equal(
    resolve({ ...base, preview: null, manual: null, today: '2026-08-01' }).source,
    'before-plan',
  );
  assert.equal(
    resolve({ ...base, preview: null, manual: null, today: '2026-10-01' }).source,
    'after-plan',
  );
  assert.equal(
    resolve({ ...base, preview: null, manual: null, days: [] }).source,
    'generic',
  );
});

test('each source names the day a user would expect it to name', () => {
  assert.equal(resolve({ preview: 'day_1' }).dayId, 'day_1');
  assert.equal(resolve({ manual: 'day_4' }).dayId, 'day_4');
  assert.equal(resolve({ today: '2026-09-05' }).dayId, 'day_3');
  assert.equal(resolve({ today: '2026-08-01' }).dayId, 'day_1', 'before → the FIRST day');
  assert.equal(resolve({ today: '2026-10-01' }).dayId, 'day_5', 'after → the LAST day');
});

// ---- Preview ----------------------------------------------------------------

test('a valid preview outranks manual and date, whatever the journey mode', () => {
  for (const active of [true, false]) {
    for (const today of ['2026-08-01', '2026-09-05', '2026-10-01']) {
      const result = resolve({ preview: 'day_2', active, manual: 'day_4', today });
      assert.equal(result.source, 'preview', `active=${active} today=${today}`);
      assert.equal(result.dayId, 'day_2');
    }
  }
});

test('preview is presentation: it changes no input and no persisted pointer', () => {
  // The resolver receives the pointers by value; a preview must not rewrite
  // them, and Today must be able to leave the preview and find its previous
  // answer unchanged. Both are asserted from the outside here.
  const days = structuredClone(CONSECUTIVE);
  const snapshot = JSON.stringify(days);
  const previewing = resolveEffectiveToday(days, 'day_1', true, 'day_4', '2026-09-05', 'd4');
  const after = resolveEffectiveToday(days, null, true, 'day_4', '2026-09-05', 'd4');
  assert.equal(previewing.source, 'preview');
  assert.equal(after.source, 'manual');
  assert.equal(after.dayId, 'day_4', 'the manual pointer survived the preview untouched');
  assert.equal(JSON.stringify(days), snapshot, 'the derived days are never rewritten');
});

test('a dangling or empty preview id falls silently through to the next source', () => {
  // A previewed day removed by a plan edit must not blank Today.
  assert.equal(resolve({ preview: 'day_gone', manual: 'day_4' }).source, 'manual');
  assert.equal(resolve({ preview: 'day_gone' }).source, 'date');
  assert.equal(resolve({ preview: 'day_gone', active: false }).source, 'generic');
  for (const empty of ['', null, undefined, 0, false]) {
    assert.equal(resolve({ preview: empty }).source, 'date', `preview=${String(empty)}`);
  }
});

// ---- Manual override --------------------------------------------------------

test('a manual pointer outranks an exact date match', () => {
  const result = resolve({ manual: 'day_1', today: '2026-09-05' });
  assert.equal(result.source, 'manual');
  assert.equal(result.dayId, 'day_1', 'the date would have said day_3');
});

test('plan pointers are inert unless journeyActive is exactly true', () => {
  // The v10 activation flag is strict on purpose: an old payload carrying a
  // pointer is not consent to replace the generic Today. Called directly so
  // `undefined` reaches the resolver instead of the helper's default.
  for (const active of [false, null, undefined, 'true', 1, {}]) {
    const result = resolveEffectiveToday(CONSECUTIVE, null, active, 'day_4', '2026-09-05', 'd4');
    assert.equal(result.source, 'generic', `journeyActive=${String(active)}`);
    assert.equal(result.day, null);
    assert.equal(result.stageId, 'd4', 'the canonical stage still populates Today');
  }
  assert.equal(resolve({ active: true, manual: 'day_4' }).source, 'manual');
});

test('an inactive journey stays generic before, during and after the plan', () => {
  for (const today of ['2026-08-01', '2026-09-05', '2026-10-01']) {
    assert.equal(resolve({ active: false, today }).source, 'generic');
  }
});

test('a dangling manual day id falls through to date and to the clamps', () => {
  assert.equal(resolve({ manual: 'day_gone' }).source, 'date');
  assert.equal(resolve({ manual: 'day_gone', today: '2026-08-01' }).source, 'before-plan');
  assert.equal(resolve({ manual: 'day_gone', today: '2026-10-01' }).source, 'after-plan');
  for (const empty of ['', null, undefined]) {
    assert.equal(resolve({ manual: empty }).source, 'date', `manual=${String(empty)}`);
  }
});

test('the resolver takes NO leg pointer — the day is the whole manual answer', () => {
  // `currentLegId` never reaches this function (see the store call site); the
  // leg pointer is projected onto the derived legs instead, which is what the
  // pointer-projection tests at the bottom of this file pin. Five required
  // parameters (`currentStageId` is the sixth, and defaulted): slipping a leg
  // pointer into the signature turns this fence red first.
  assert.equal(resolveEffectiveToday.length, 5);
});

// ---- Date, and the two clamps ----------------------------------------------

test('an exact local date picks its planned day, and boundaries are dates — not clamps', () => {
  assert.equal(resolve({ today: '2026-09-03' }).source, 'date', 'first planned date');
  assert.equal(resolve({ today: '2026-09-03' }).dayId, 'day_1');
  assert.equal(resolve({ today: '2026-09-07' }).source, 'date', 'last planned date');
  assert.equal(resolve({ today: '2026-09-07' }).dayId, 'day_5');
  // One day outside on either side is where the clamps start.
  assert.equal(resolve({ today: '2026-09-02' }).source, 'before-plan');
  assert.equal(resolve({ today: '2026-09-08' }).source, 'after-plan');
});

test('plannedDayForDate matches on the date string only, and never guesses', () => {
  assert.equal(plannedDayForDate(CONSECUTIVE, '2026-09-04').id, 'day_2');
  assert.equal(plannedDayForDate(CONSECUTIVE, '2026-09-08'), null);
  for (const bad of [null, '', '2026-9-4', '2026-02-30', 'today', 20260904]) {
    assert.equal(plannedDayForDate(CONSECUTIVE, bad), null, `iso=${String(bad)}`);
  }
  assert.equal(plannedDayForDate(null, '2026-09-04'), null);
});

test('CHARACTERIZED: a gap date inside a non-consecutive plan resolves GENERIC', () => {
  // Today's derivation always produces consecutive dates, so this input is not
  // reachable through the UI — but the resolver is a public pure function and
  // vNext moves day shaping into Plan, so its answer for a gap is worth
  // pinning. The clamps deliberately only handle "before the first" and
  // "after the last"; a date that falls in a HOLE is neither, and lands on
  // generic (a populated, date-independent Today) rather than being pulled to
  // a neighbouring day. Note the module docblock reads as if such a date
  // lands on the before/after clamp — the code lands on generic, and this
  // test pins the code.
  const gapped = [
    { id: 'day_1', date: '2026-09-03' },
    { id: 'day_2', date: '2026-09-04' },
    { id: 'day_3', date: '2026-09-08' },
  ];
  assert.equal(resolve({ days: gapped, today: '2026-09-05' }).source, 'generic');
  assert.equal(resolve({ days: gapped, today: '2026-09-06' }).source, 'generic');
  assert.equal(resolve({ days: gapped, today: '2026-09-05' }).day, null);
  assert.equal(resolve({ days: gapped, today: '2026-09-05' }).stageId, 'd4');
  // The days that DO exist are unaffected, and the clamps still work outside.
  assert.equal(resolve({ days: gapped, today: '2026-09-08' }).source, 'date');
  assert.equal(resolve({ days: gapped, today: '2026-09-02' }).source, 'before-plan');
  assert.equal(resolve({ days: gapped, today: '2026-09-09' }).source, 'after-plan');
});

test('CHARACTERIZED: the clamps use ARRAY order, not chronological order', () => {
  // "First" is the first entry with a real date and "last" the last one — not
  // min/max. Derived days are always in ascending date order, so the two
  // readings agree in production; they diverge only for a hand-built list.
  const unsorted = [
    { id: 'day_late', date: '2026-09-10' },
    { id: 'day_early', date: '2026-09-04' },
  ];
  assert.equal(resolve({ days: unsorted, today: '2026-09-01' }).dayId, 'day_late');
  assert.equal(resolve({ days: unsorted, today: '2026-09-20' }).dayId, 'day_early');
  // A date between the two is before the array's FIRST entry, so it clamps
  // rather than falling to generic.
  const between = resolve({ days: unsorted, today: '2026-09-07' });
  assert.equal(between.source, 'before-plan');
  assert.equal(between.dayId, 'day_late');
});

test('an unorderable local date never guesses a day', () => {
  // Called directly so `undefined` really reaches the resolver rather than
  // picking up the helper's default date.
  for (const today of [null, undefined, '', '2026-9-5', '2026-02-30', 'not-a-date', 20260905]) {
    const result = resolveEffectiveToday(CONSECUTIVE, null, true, null, today, 'd4');
    assert.equal(result.source, 'generic', `today=${String(today)}`);
    assert.equal(result.day, null);
  }
});

test('planned days with unorderable dates cannot be clamped either', () => {
  const malformed = CONSECUTIVE.map((d) => ({ ...d, date: null }));
  assert.equal(resolve({ days: malformed, today: '2026-09-05' }).source, 'generic');
  // A single real date is enough to clamp against — the scan skips the rest.
  const partial = [{ id: 'day_x', date: null }, { id: 'day_y', date: '2026-09-05' }];
  assert.equal(resolve({ days: partial, today: '2026-08-01' }).source, 'before-plan');
  assert.equal(resolve({ days: partial, today: '2026-08-01' }).dayId, 'day_y');
});

// ---- Generic ----------------------------------------------------------------

test('no plan resolves generic, carrying the canonical stage and no day', () => {
  for (const days of [[], null, undefined, 'nope', {}]) {
    const result = resolveEffectiveToday(days, 'day_1', true, 'day_2', '2026-09-05', 'd7');
    assert.deepEqual(result, { kind: 'generic', stageId: 'd7', day: null, source: 'generic' });
  }
});

test('the two result shapes are distinguishable without reading `source`', () => {
  // Callers switch on `kind`; the shapes must stay disjoint so a planned
  // result can never be mistaken for a generic one (or vice versa).
  const planned = resolve({ today: '2026-09-05' });
  assert.deepEqual(Object.keys(planned), ['kind', 'dayId', 'day', 'source']);
  assert.equal(planned.kind, 'planned');
  assert.equal(planned.dayId, planned.day.id);

  const generic = resolve({ days: [] });
  assert.deepEqual(Object.keys(generic), ['kind', 'stageId', 'day', 'source']);
  assert.equal(generic.kind, 'generic');
  assert.equal(generic.day, null);
});

test('a null current stage is carried through generic as null, never invented', () => {
  const result = resolveEffectiveToday([], null, true, null, '2026-09-05', null);
  assert.equal(result.stageId, null);
  // The default parameter is null too — an omitted stage is not "unknown".
  assert.equal(resolveEffectiveToday([], null, true, null, '2026-09-05').stageId, null);
});

// ---- Purity -----------------------------------------------------------------

test('the resolution is read-only: frozen inputs resolve without a write attempt', () => {
  const days = CONSECUTIVE.map((d) => Object.freeze({ ...d }));
  Object.freeze(days);
  for (const today of ['2026-08-01', '2026-09-05', '2026-10-01', 'garbage']) {
    assert.doesNotThrow(() => resolveEffectiveToday(days, null, true, null, today, 'd4'));
  }
  assert.doesNotThrow(() => resolveEffectiveToday(days, 'day_2', true, 'day_4', '2026-09-05', 'd4'));
});

test('repeated calls with the same input are deterministic', () => {
  const inputs = [
    { preview: 'day_2', manual: 'day_4', today: '2026-09-05' },
    { manual: 'day_4', today: '2026-09-05' },
    { today: '2026-09-05' },
    { today: '2026-08-01' },
    { today: '2026-10-01' },
    { active: false, today: '2026-09-05' },
  ];
  for (const input of inputs) {
    const first = resolve(input);
    const second = resolve(input);
    assert.deepEqual(second, first, JSON.stringify(input));
    assert.equal(second.source, first.source);
  }
});

test('the resolved day is the derived object itself — no defensive copy', () => {
  // Today renders straight off this object every render; cloning here would
  // both churn React identity and quietly detach the day from the derived
  // list it belongs to. Pinned so a copy would be a deliberate decision.
  const days = structuredClone(CONSECUTIVE);
  assert.equal(resolveEffectiveToday(days, null, true, null, '2026-09-04', 'd4').day, days[1]);
  assert.equal(resolveEffectiveToday(days, 'day_5', true, null, '2026-09-04', 'd4').day, days[4]);
});

// ---- The pointer pair, projected onto the derived days ----------------------
//
// `resolveEffectiveToday` answers "which DAY", and the persisted pointer pair
// (`currentDayId` + `currentLegId`) is projected onto the derived days by
// `buildPlannedDays`. These tests pin that relation, which is the precise
// meaning of the pair the store writes.

test('currentDayId marks exactly one derived day, and no other', () => {
  const days = buildPlannedDays(ORIENTED, planWith('day_2', null), []);
  assert.equal(days.length, 4);
  assert.deepEqual(days.map((d) => d.isCurrent), [false, true, false, false]);
  assert.equal(currentPlannedDayOf(days).id, 'day_2');
});

test('a null currentDayId marks NO day current — never a fallback day', () => {
  const days = buildPlannedDays(ORIENTED, planWith(null, null), []);
  assert.ok(days.every((d) => d.isCurrent === false));
  assert.equal(currentPlannedDayOf(days), null);
});

test('currentLegId only marks a leg of the CURRENT day', () => {
  const onDay2 = buildPlannedDays(ORIENTED, planWith('day_2', 'leg_2b'), []);
  assert.deepEqual(
    onDay2.flatMap((d) => d.legs.filter((l) => l.isCurrent).map((l) => l.id)),
    ['leg_2b'],
  );
  assert.equal(currentLegIndex(onDay2[1]), 1, 'the SECOND leg of the combined day');
  assert.equal(currentLegIndex(onDay2[3]), -1);

  // The very same leg id, with the day pointer aimed elsewhere: nothing is
  // marked. A leg pointer is meaningless without its own day.
  const elsewhere = buildPlannedDays(ORIENTED, planWith('day_4', 'leg_2b'), []);
  assert.ok(elsewhere.every((d) => d.legs.every((l) => l.isCurrent === false)));
  assert.equal(currentLegIndex(elsewhere[3]), -1);
  assert.equal(currentPlannedDayOf(elsewhere).id, 'day_4', 'the day pointer still holds');
});

test('a current day with no current leg is a valid, honest state', () => {
  // This is exactly what the store leaves behind when a selected stage has
  // zero or several planned occurrences: the calendar day stays, the
  // occurrence pointer clears.
  const days = buildPlannedDays(ORIENTED, planWith('day_2', null), []);
  assert.equal(days[1].isCurrent, true);
  assert.equal(currentLegIndex(days[1]), -1);
  assert.ok(days[1].legs.every((l) => l.isCurrent === false));
});

test('a repeated stage produces two independent occurrences, only one current', () => {
  // d2 is walked on day_2 (canonical) and again on day_4 (opposite).
  const days = buildPlannedDays(ORIENTED, planWith('day_4', 'leg_4a'), []);
  const both = plannedDaysForStage(days, 'd2');
  assert.deepEqual(both.map((d) => d.id), ['day_2', 'day_4']);
  assert.deepEqual(
    days.flatMap((d) => d.legs.filter((l) => l.isCurrent).map((l) => l.id)),
    ['leg_4a'],
  );
  // Orientation is resolved per leg against its own view, so the two
  // occurrences of d2 walk in opposite geographical directions.
  assert.equal(days[1].legs[1].stage.fromHutId, 'abiskojaure');
  assert.equal(days[3].legs[0].stage.fromHutId, 'alesjaure');
});

test('the derived days feed the resolver unchanged — dates come from the plan', () => {
  const days = buildPlannedDays(ORIENTED, planWith('day_2', 'leg_2a'), []);
  assert.deepEqual(days.map((d) => d.date), [
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
  ]);
  // The pointer wins over the date, and the resolver returns the derived day.
  const result = resolveEffectiveToday(days, null, true, 'day_2', '2026-09-06', 'd1');
  assert.equal(result.source, 'manual');
  assert.equal(result.day, days[1]);
  assert.equal(result.day.legs.length, 2, 'a combined hiking day stays combined');
});
