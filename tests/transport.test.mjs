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
  timetableStatus,
  scheduleRunsOn,
  entriesForContext,
} from '../src/data/transport.mjs';

const byId = Object.fromEntries(TRANSPORT_ENTRIES.map((e) => [e.id, e]));
const schedById = (entryId) =>
  Object.fromEntries((byId[entryId].schedules ?? []).map((s) => [s.id, s]));

// ---- Scope ------------------------------------------------------------------

test('only route-relevant services are encoded, grouped by journey context', () => {
  assert.deepEqual(
    TRANSPORT_ENTRIES.map((e) => e.id).sort(),
    [
      'alesjaure-boat',
      'laddjujavri-boat',
      'line-91',
      'nikkaluoktaexpressen',
      'train-kiruna-abisko',
    ].sort(),
  );
  assert.deepEqual(entriesForContext('to-trail').map((e) => e.id), ['line-91']);
  assert.deepEqual(entriesForContext('along-trail').map((e) => e.id), [
    'alesjaure-boat',
    'laddjujavri-boat',
  ]);
  assert.deepEqual(entriesForContext('from-trail').map((e) => e.id), ['nikkaluoktaexpressen']);
  assert.deepEqual(entriesForContext('live-alternative').map((e) => e.id), ['train-kiruna-abisko']);
});

// ---- Validity / expired-state logic -----------------------------------------

test('timetableStatus resolves upcoming / valid / expired around the window', () => {
  const l91 = byId['line-91'];
  assert.equal(timetableStatus(l91, '2026-08-16'), 'upcoming'); // day before start
  assert.equal(timetableStatus(l91, '2026-08-17'), 'valid'); // first day
  assert.equal(timetableStatus(l91, '2026-09-01'), 'valid');
  assert.equal(timetableStatus(l91, '2026-09-20'), 'valid'); // last day
  assert.equal(timetableStatus(l91, '2026-09-21'), 'expired'); // day after end
});

test('a live alternative is never expired; an undated entry is "undated"', () => {
  assert.equal(timetableStatus(byId['train-kiruna-abisko'], '2030-01-01'), 'live');
  assert.equal(timetableStatus({ live: false }, '2026-07-12'), 'undated');
});

// ---- Special line 91 Saturdays ----------------------------------------------

test('special line-91 Saturdays replace the normal Saturday service', () => {
  assert.deepEqual(SPECIAL_LINE91_SATURDAYS, ['2026-08-22', '2026-08-29', '2026-09-05']);
  const sched = schedById('line-91');
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

  // The special service departs Kiruna Stadshustorget at 15:35 (not 14:35).
  assert.equal(special.calls[0].time, '15:35');
  assert.equal(normal.calls[0].time, '14:35');
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
  assert.equal(timetableStatus(bus, '2026-08-09'), 'upcoming');
  assert.equal(timetableStatus(bus, '2026-08-10'), 'valid');
  assert.equal(timetableStatus(bus, '2026-09-20'), 'valid'); // last day
  assert.equal(timetableStatus(bus, '2026-09-21'), 'expired');
});

// ---- Static ≠ live ----------------------------------------------------------

test('static timetables are never presented as live; only the train is live', () => {
  for (const e of TRANSPORT_ENTRIES) {
    if (e.id === 'train-kiruna-abisko') {
      assert.equal(e.live, true);
      assert.equal(e.source.kind, 'live');
      // A live alternative stores NO fixed timetable.
      assert.equal(e.validFrom, undefined);
      assert.equal(e.validTo, undefined);
      assert.ok(!e.schedules || e.schedules.length === 0);
    } else {
      assert.notEqual(e.live, true, `${e.id} must not be marked live`);
      assert.equal(e.source.kind, 'static', `${e.id} source must be static`);
      // Every static timetable carries an explicit validity window.
      assert.match(e.validFrom, /^\d{4}-\d{2}-\d{2}$/, `${e.id} needs validFrom`);
      assert.match(e.validTo, /^\d{4}-\d{2}-\d{2}$/, `${e.id} needs validTo`);
    }
  }
});

test('line 91 keeps its official 17 Aug – 20 Sep 2026 window and mountain-fare note', () => {
  const l91 = byId['line-91'];
  assert.equal(l91.validFrom, '2026-08-17');
  assert.equal(l91.validTo, '2026-09-20');
  assert.ok(l91.warnings.some((w) => /mountain fare/i.test(w)));
});

test('boat/bus connection notes are never stated as guarantees', () => {
  const enoks = byId['laddjujavri-boat'];
  assert.ok(enoks.connections.some((c) => /never a guaranteed/i.test(c)));
  const nik = byId['nikkaluoktaexpressen'];
  assert.ok(nik.connections.some((c) => /not unconditional guarantees/i.test(c)));
});
