/**
 * Transport dataset: validity/expired-state logic, special-date rules,
 * seasonal boats, operator end dates, and the static-not-live contract.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSPORT_ENTRIES,
  SPECIAL_LINE91_SATURDAYS,
  timetablePeriodsFor,
  timetableStatus,
  scheduleRunsOn,
  entriesForContext,
} from '../src/data/transport.mjs';

const byId = Object.fromEntries(TRANSPORT_ENTRIES.map((e) => [e.id, e]));
/** A stored period by id, or the entry's single period when none is named. */
const periodById = (entryId, periodId) => {
  const periods = timetablePeriodsFor(byId[entryId]);
  const found = periodId ? periods.find((p) => p.id === periodId) : periods[0];
  assert.ok(found, `${entryId} has no period ${periodId ?? '(single)'}`);
  return found;
};
const schedById = (entryId, periodId) =>
  Object.fromEntries(periodById(entryId, periodId).schedules.map((s) => [s.id, s]));

// ---- Scope ------------------------------------------------------------------

test('only route-relevant services are encoded, grouped by journey context', () => {
  assert.deepEqual(
    TRANSPORT_ENTRIES.map((e) => e.id).sort(),
    [
      'alesjaure-boat',
      'laddjujavri-boat',
      'line-91',
      'line-91-return',
      'nikkaluoktaexpressen',
      'nikkaluoktaexpressen-outbound',
      'train-abisko-kiruna',
      'train-kiruna-abisko',
    ].sort(),
  );
  // Each context holds both operator directions; which one a hiker sees is the
  // assembly's job, not the dataset's.
  assert.deepEqual(entriesForContext('to-trail').map((e) => e.id), [
    'line-91',
    'nikkaluoktaexpressen-outbound',
  ]);
  assert.deepEqual(entriesForContext('along-trail').map((e) => e.id), [
    'alesjaure-boat',
    'laddjujavri-boat',
  ]);
  assert.deepEqual(entriesForContext('from-trail').map((e) => e.id), [
    'nikkaluoktaexpressen',
    'line-91-return',
  ]);
  assert.deepEqual(entriesForContext('live-alternative').map((e) => e.id), [
    'train-kiruna-abisko',
    'train-abisko-kiruna',
  ]);
});

// ---- Validity / expired-state logic -----------------------------------------

test('timetableStatus resolves upcoming / valid / expired around the window', () => {
  const l91 = byId['line-91'];
  // The stored coverage now runs across two published tables, so the boundary
  // between them is NOT an edge of the service: 16 → 17 August stays valid.
  assert.equal(timetableStatus(l91, '2026-06-30'), 'upcoming'); // day before the first table
  assert.equal(timetableStatus(l91, '2026-07-01'), 'valid'); // first day
  assert.equal(timetableStatus(l91, '2026-08-16'), 'valid');
  assert.equal(timetableStatus(l91, '2026-08-17'), 'valid');
  assert.equal(timetableStatus(l91, '2026-09-20'), 'valid'); // last day
  assert.equal(timetableStatus(l91, '2026-09-21'), 'expired'); // day after end
});

test('a live alternative is never expired; an undated entry is "undated"', () => {
  assert.equal(timetableStatus(byId['train-kiruna-abisko'], '2030-01-01'), 'live');
  assert.equal(timetableStatus(byId['train-abisko-kiruna'], '2030-01-01'), 'live');
  assert.equal(timetableStatus({ live: false }, '2026-07-12'), 'undated');
});

// ---- Special line 91 Saturdays ----------------------------------------------

test('special line-91 Saturdays replace the normal Saturday service', () => {
  assert.deepEqual(SPECIAL_LINE91_SATURDAYS, ['2026-08-22', '2026-08-29', '2026-09-05']);
  const sched = schedById('line-91', 'line-91-2026-08-17');
  const normal = sched['saturday-afternoon'];
  const special = sched['special-saturday'];

  // On a special date: special runs, normal does not.
  for (const d of SPECIAL_LINE91_SATURDAYS) {
    assert.equal(scheduleRunsOn(special, d), true, `special should run on ${d}`);
    assert.equal(scheduleRunsOn(normal, d), false, `normal should NOT run on ${d}`);
  }
  // On an ordinary Saturday (2026-08-15): normal runs, special does not.
  assert.equal(scheduleRunsOn(normal, '2026-08-15'), true);
  assert.equal(scheduleRunsOn(special, '2026-08-15'), false);

  // Both afternoon runs start at Kiruna Sjukhus, as the official table does;
  // the special service is an hour later all the way down.
  assert.deepEqual(special.calls.slice(0, 2).map((c) => [c.place, c.time]), [
    ['Kiruna Sjukhus', '15:30'],
    ['Kiruna Stadshustorget', '15:35'],
  ]);
  assert.deepEqual(normal.calls.slice(0, 2).map((c) => [c.place, c.time]), [
    ['Kiruna Sjukhus', '14:30'],
    ['Kiruna Stadshustorget', '14:35'],
  ]);
});

// ---- Seasonal boats ---------------------------------------------------------

test('Alesjaure boat is summer-only and unavailable after 30 August', () => {
  const boat = byId['alesjaure-boat'];
  assert.equal(timetableStatus(boat, '2026-06-30'), 'upcoming');
  assert.equal(timetableStatus(boat, '2026-07-01'), 'valid');
  assert.equal(timetableStatus(boat, '2026-08-30'), 'valid'); // last summer day
  assert.equal(timetableStatus(boat, '2026-08-31'), 'expired'); // September = gone
  assert.equal(timetableStatus(boat, '2026-09-05'), 'expired');
});

test('Enoks Láddjujávri boat runs to 13 Sep, with peak-only sailings flagged', () => {
  const boat = byId['laddjujavri-boat'];
  assert.equal(timetableStatus(boat, '2026-09-13'), 'valid'); // last day
  assert.equal(timetableStatus(boat, '2026-09-14'), 'expired'); // after end
  assert.equal(timetableStatus(boat, '2026-06-11'), 'upcoming');

  // 12:00 / 14:30 sailings are peak-only (carry a note); 09:00 is not.
  const lower = schedById('laddjujavri-boat')['lower-to-kebnekaise'];
  const nine = lower.calls.find((c) => c.time === '09:00');
  const noon = lower.calls.find((c) => c.time === '12:00');
  assert.equal(nine.note, undefined);
  assert.match(noon.note, /only/i);
});

test('Nikkaluoktaexpressen validity ends after 20 September', () => {
  const bus = byId['nikkaluoktaexpressen'];
  assert.equal(timetableStatus(bus, '2026-08-02'), 'upcoming'); // before the first table
  assert.equal(timetableStatus(bus, '2026-08-03'), 'valid');
  assert.equal(timetableStatus(bus, '2026-08-09'), 'valid'); // first table's last day
  assert.equal(timetableStatus(bus, '2026-08-10'), 'valid'); // second table takes over
  assert.equal(timetableStatus(bus, '2026-09-20'), 'valid'); // last day
  assert.equal(timetableStatus(bus, '2026-09-21'), 'expired');
});

// ---- Static ≠ live ----------------------------------------------------------

const LIVE_IDS = ['train-kiruna-abisko', 'train-abisko-kiruna'];

test('static timetables are never presented as live; only the train is live', () => {
  for (const e of TRANSPORT_ENTRIES) {
    if (LIVE_IDS.includes(e.id)) {
      assert.equal(e.live, true);
      assert.equal(e.source.kind, 'live');
      // A live alternative stores NO fixed timetable.
      assert.equal(e.validFrom, undefined);
      assert.equal(e.validTo, undefined);
      assert.ok(!e.schedules || e.schedules.length === 0);
      assert.deepEqual(timetablePeriodsFor(e), []);
    } else {
      assert.notEqual(e.live, true, `${e.id} must not be marked live`);
      // Every stored table — however many an operator has published — carries
      // its own static source and its own explicit validity window.
      const periods = timetablePeriodsFor(e);
      assert.ok(periods.length >= 1, `${e.id} needs at least one stored period`);
      for (const p of periods) {
        assert.equal(p.source.kind, 'static', `${e.id}/${p.id} source must be static`);
        assert.match(p.validFrom, /^\d{4}-\d{2}-\d{2}$/, `${e.id}/${p.id} needs validFrom`);
        assert.match(p.validTo, /^\d{4}-\d{2}-\d{2}$/, `${e.id}/${p.id} needs validTo`);
        assert.ok(p.schedules.length > 0, `${e.id}/${p.id} needs schedules`);
      }
    }
  }
});

test('line 91 keeps both official 2026 windows and the mountain-fare note', () => {
  const l91 = byId['line-91'];
  assert.deepEqual(
    timetablePeriodsFor(l91).map((p) => [p.validFrom, p.validTo]),
    [
      ['2026-07-01', '2026-08-16'],
      ['2026-08-17', '2026-09-20'],
    ],
  );
  // The fare rule is a property of the line, not of one published table.
  assert.ok(l91.warnings.some((w) => /mountain fare/i.test(w)));
});

test('boat/bus connection notes are never stated as guarantees', () => {
  const enoks = byId['laddjujavri-boat'];
  assert.ok(enoks.connections.some((c) => /never a guaranteed/i.test(c)));
  // The bus notes quote a period's own departure times, so they live with it.
  for (const period of timetablePeriodsFor(byId['nikkaluoktaexpressen'])) {
    assert.ok(
      period.connections.some((c) => /not unconditional guarantees/i.test(c)),
      `${period.id} must not state connections as guarantees`,
    );
  }
});
