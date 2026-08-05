/**
 * Timetable period coverage: which stored table applies to a date, and what the
 * app is allowed to say when none of them does.
 *
 * The contract this file defends is one distinction. "The service is out of
 * season" and "Fjällkompis has no verified table for this date" are different
 * claims, and only the operator can make the first. Before the period model the
 * app showed a neutral "Seasonal" pill for both, which reads as the first while
 * meaning the second — so a hiker could conclude no bus runs on a day the bus
 * runs perfectly well.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRANSPORT_ENTRIES,
  timetableCoverageFor,
  timetablePeriodProblems,
  timetablePeriodsFor,
  timetableStatus,
} from '../src/data/transport.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const byId = Object.fromEntries(TRANSPORT_ENTRIES.map((e) => [e.id, e]));

/** The published windows a service stores, as [from, to] pairs. */
const windows = (id) => timetablePeriodsFor(byId[id]).map((p) => [p.validFrom, p.validTo]);
/** The id of the period that covers a date, or the status when none does. */
const resolved = (id, iso) => {
  const c = timetableCoverageFor(byId[id], iso);
  return c.period ? c.period.id : c.status;
};

// ---- 1. Period selection is pure, total and deterministic -------------------

test('the same entry and date always resolve to the same period', () => {
  for (const entry of TRANSPORT_ENTRIES) {
    for (const iso of ['2026-07-15', '2026-08-05', '2026-09-30']) {
      const a = timetableCoverageFor(entry, iso);
      const b = timetableCoverageFor(entry, iso);
      assert.equal(a.status, b.status);
      assert.equal(a.period?.id, b.period?.id);
    }
  }
});

test('no shipped service has overlapping or malformed periods', () => {
  for (const entry of TRANSPORT_ENTRIES) {
    assert.deepEqual(timetablePeriodProblems(entry), [], `${entry.id}`);
  }
});

test('a date covered by two periods refuses to pick one', () => {
  // Overlap is a data fault. The honest answer is "I cannot tell", never a
  // silent choice of whichever period happens to sort first.
  const broken = {
    id: 'broken',
    mode: 'bus',
    operator: 'Test',
    timetablePeriods: [
      { id: 'a', validFrom: '2026-08-01', validTo: '2026-08-20', schedules: [], source: {} },
      { id: 'b', validFrom: '2026-08-10', validTo: '2026-08-31', schedules: [], source: {} },
    ],
  };
  const c = timetableCoverageFor(broken, '2026-08-15');
  assert.equal(c.status, 'ambiguous');
  assert.equal(c.period, null, 'must not choose a period');
  assert.deepEqual(timetablePeriodProblems(broken), ['periods "a" and "b" overlap']);
  // Dates only one period claims still resolve normally.
  assert.equal(timetableCoverageFor(broken, '2026-08-05').period.id, 'a');
  assert.equal(timetableCoverageFor(broken, '2026-08-25').period.id, 'b');
});

test('a gap between stored periods is "uncovered", not the nearest table', () => {
  const gapped = {
    id: 'gapped',
    mode: 'bus',
    operator: 'Test',
    timetablePeriods: [
      { id: 'early', validFrom: '2026-06-01', validTo: '2026-06-30', schedules: [], source: {} },
      { id: 'late', validFrom: '2026-08-01', validTo: '2026-08-31', schedules: [], source: {} },
    ],
  };
  const c = timetableCoverageFor(gapped, '2026-07-15');
  assert.equal(c.status, 'uncovered');
  assert.equal(c.period, null, 'a gap never borrows a neighbour’s times');
  // It can still say what IS stored on either side.
  assert.equal(c.previousPeriod.id, 'early');
  assert.equal(c.nextPeriod.id, 'late');
});

test('no reliable date claims no validity, and keeps every period readable', () => {
  for (const missing of [null, undefined, '', 'today', '2026-13-01x']) {
    const c = timetableCoverageFor(byId['line-91'], missing);
    assert.equal(c.status, 'undated', `${missing}`);
    assert.equal(c.period, null, 'no active-validity claim without a date');
    assert.equal(c.periods.length, 2, 'all stored periods stay available');
    assert.equal(c.date, null);
  }
});

// ---- 2. The date matrix -----------------------------------------------------

test('Nikkaluoktaexpressen selects the right table across the season, both ways', () => {
  assert.deepEqual(windows('nikkaluoktaexpressen'), [
    ['2026-08-03', '2026-08-09'],
    ['2026-08-10', '2026-09-20'],
  ]);
  // Both operator directions are stored per period, so both must switch on the
  // same dates — a hiker walking either way gets the same coverage.
  for (const [id, first, second] of [
    ['nikkaluoktaexpressen', 'nikkaluoktaexpressen-2026-08-03', 'nikkaluoktaexpressen-2026-08-10'],
    [
      'nikkaluoktaexpressen-outbound',
      'nikkaluoktaexpressen-outbound-2026-08-03',
      'nikkaluoktaexpressen-outbound-2026-08-10',
    ],
  ]) {
    assert.equal(resolved(id, '2026-08-02'), 'upcoming', `${id} before the first table`);
    assert.equal(resolved(id, '2026-08-03'), first, `${id} first day is inclusive`);
    assert.equal(resolved(id, '2026-08-05'), first, `${id} mid first period`);
    assert.equal(resolved(id, '2026-08-09'), first, `${id} last day is inclusive`);
    assert.equal(resolved(id, '2026-08-10'), second, `${id} hand-over day`);
    assert.equal(resolved(id, '2026-08-16'), second, `${id}`);
    assert.equal(resolved(id, '2026-08-17'), second, `${id}`);
    assert.equal(resolved(id, '2026-09-20'), second, `${id} last day is inclusive`);
    assert.equal(resolved(id, '2026-09-21'), 'expired', `${id} after the last table`);
  }
});

test('line 91 selects the right table across the season, both ways', () => {
  assert.deepEqual(windows('line-91'), [
    ['2026-07-01', '2026-08-16'],
    ['2026-08-17', '2026-09-20'],
  ]);
  for (const [id, first, second] of [
    ['line-91', 'line-91-2026-07-01', 'line-91-2026-08-17'],
    ['line-91-return', 'line-91-return-2026-07-01', 'line-91-return-2026-08-17'],
  ]) {
    // Before 1 July no official table is published, so the app must not claim
    // the service is out of season — it simply has nothing stored.
    assert.equal(resolved(id, '2026-06-30'), 'upcoming', `${id} before the first table`);
    assert.equal(resolved(id, '2026-07-01'), first, `${id} first day is inclusive`);
    assert.equal(resolved(id, '2026-08-05'), first, `${id} mid summer`);
    assert.equal(resolved(id, '2026-08-09'), first, `${id}`);
    assert.equal(resolved(id, '2026-08-10'), first, `${id}`);
    assert.equal(resolved(id, '2026-08-16'), first, `${id} last day of the summer table`);
    assert.equal(resolved(id, '2026-08-17'), second, `${id} hand-over day is valid`);
    assert.equal(resolved(id, '2026-09-20'), second, `${id} last day is inclusive`);
    assert.equal(resolved(id, '2026-09-21'), 'expired', `${id} after the last table`);
  }
});

test('the two published periods are genuinely different services, not copies', () => {
  const afternoonCalls = (entryId, periodId) => {
    const period = timetablePeriodsFor(byId[entryId]).find((p) => p.id === periodId);
    const run = period.schedules.find((s) => s.id === 'afternoon' || s.id === 'weekday-afternoon');
    return run.calls.map((c) => [c.place, c.time]);
  };

  // Nikkaluoktaexpressen: the early table leaves town first and calls the
  // airport last; from 10 August the run STARTS at the airport at 14:55.
  const early = afternoonCalls('nikkaluoktaexpressen-outbound', 'nikkaluoktaexpressen-outbound-2026-08-03');
  const later = afternoonCalls('nikkaluoktaexpressen-outbound', 'nikkaluoktaexpressen-outbound-2026-08-10');
  assert.deepEqual(early[0], ['Kiruna Stadshustorget', '15:05']);
  assert.deepEqual(later[0], ['Kiruna Airport', '14:55']);
  assert.notDeepEqual(early, later, 'the two afternoon runs must not be identical');

  // Line 91: one daily afternoon run in high summer, a weekday-split one after.
  const l91Early = timetablePeriodsFor(byId['line-91']).find((p) => p.id === 'line-91-2026-07-01');
  const l91Late = timetablePeriodsFor(byId['line-91']).find((p) => p.id === 'line-91-2026-08-17');
  assert.deepEqual(l91Early.schedules.map((s) => s.id), ['morning', 'afternoon']);
  assert.deepEqual(l91Late.schedules.map((s) => s.id), [
    'morning',
    'weekday-afternoon',
    'sunday-afternoon',
    'saturday-afternoon',
    'special-saturday',
  ]);
  assert.deepEqual(
    l91Early.schedules.find((s) => s.id === 'afternoon').calls.map((c) => [c.place, c.time]),
    [
      ['Kiruna Sjukhus', '15:45'],
      ['Kiruna Stadshustorget', '15:50'],
      ['Kiruna Airport', '16:00'],
      ['Abisko Östra', '17:10'],
      ['Abisko Turist E10', '17:15'],
    ],
  );
});

// ---- 3. Every status is reachable and honest --------------------------------

test('each status resolves from real or explicitly constructed data', () => {
  const stub = (periods) => ({ id: 's', mode: 'bus', operator: 'Test', timetablePeriods: periods });
  const period = (id, from, to) => ({ id, validFrom: from, validTo: to, schedules: [], source: {} });

  assert.equal(timetableStatus(byId['train-kiruna-abisko'], '2026-08-05'), 'live');
  assert.equal(timetableStatus(byId['line-91'], '2026-08-05'), 'valid');
  assert.equal(timetableStatus(byId['line-91'], '2026-06-01'), 'upcoming');
  assert.equal(timetableStatus(byId['line-91'], '2027-01-01'), 'expired');
  assert.equal(timetableStatus(byId['line-91'], null), 'undated');
  assert.equal(
    timetableStatus(stub([period('a', '2026-06-01', '2026-06-30'), period('b', '2026-08-01', '2026-08-31')]), '2026-07-10'),
    'uncovered',
  );
  assert.equal(
    timetableStatus(stub([period('a', '2026-08-01', '2026-08-31'), period('b', '2026-08-10', '2026-09-10')]), '2026-08-15'),
    'ambiguous',
  );
});

test('only valid and live ever hand out times for a date', () => {
  const stub = (periods) => ({ id: 's', mode: 'bus', operator: 'Test', timetablePeriods: periods });
  const period = (id, from, to) => ({ id, validFrom: from, validTo: to, schedules: [], source: {} });
  const cases = [
    timetableCoverageFor(byId['line-91'], '2026-06-01'), // upcoming
    timetableCoverageFor(byId['line-91'], '2027-01-01'), // expired
    timetableCoverageFor(byId['line-91'], null), // undated
    timetableCoverageFor(
      stub([period('a', '2026-06-01', '2026-06-30'), period('b', '2026-08-01', '2026-08-31')]),
      '2026-07-10',
    ), // uncovered
    timetableCoverageFor(
      stub([period('a', '2026-08-01', '2026-08-31'), period('b', '2026-08-10', '2026-09-10')]),
      '2026-08-15',
    ), // ambiguous
  ];
  for (const c of cases) {
    assert.equal(c.period, null, `${c.status} must not resolve a period`);
  }
});

// ---- 4. The copy a hiker actually reads -------------------------------------

test('an uncovered date is never presented as "Seasonal"', () => {
  const src = read('src/components/TransportView.tsx');
  // The pill that started this: it said the same neutral word for "out of
  // season" and for "we have no table", and it is gone.
  assert.equal(/Seasonal/.test(src), false, '"Seasonal" must not label a status');
  assert.equal(/>Seasonal</.test(src), false);
});

test('the no-timetable notice says all three things it has to say', () => {
  const src = read('src/components/TransportView.tsx');
  // 1. what the app does not have — and that this is about Fjällkompis, not
  //    about whether the operator runs a bus;
  assert.match(src, /No timetable for this date/);
  assert.match(src, /Fjällkompis has no verified/);
  // 2. that the service may run anyway, with who to ask;
  assert.match(src, /The service may still\s*\n?\s*run — check \{entry\.operator\} before travelling/);
  // 3. what IS stored, so a gap never reads as "nothing exists".
  assert.match(src, /Stored timetables: \{storedRangesText\(coverage\.periods\)\}/);
  // The four reasons stay distinguishable behind that one meaning.
  assert.match(src, /The stored timetable has not started yet/);
  assert.match(src, /The stored timetable has run out/);
  assert.match(src, /This date falls between the stored timetables/);
  assert.match(src, /Two stored timetables disagree about this date/);
});

test('every timetabled service offers an operator link for uncovered dates', () => {
  for (const entry of TRANSPORT_ENTRIES) {
    if (timetablePeriodsFor(entry).length <= 1) continue;
    assert.ok(entry.operatorTimetables?.url, `${entry.id} needs an operator timetable index`);
    assert.ok(entry.operatorTimetables.label, `${entry.id} needs a link label`);
  }
  // It is offered exactly where it is the answer: with no period in force.
  // With one in force each stored table already links its own document.
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /entry\.operatorTimetables && !period/);
});

test('the source shown is the one the displayed times came from', () => {
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /const source = period\?\.source \?\? entry\.source \?\? null/);
  // A card with no period in force has no dated document to cite, so it must
  // not fall back to a PDF that does not apply to the date.
  assert.equal(/entry\.source\.url/.test(src), false, 'no unconditional entry-source link');
});

// ---- 5. Shortened stop lists say so -----------------------------------------

test('a shortened call list is labelled; a complete one is not', () => {
  // Nikkaluoktaexpressen now stores the whole table, including the six halts
  // the operator serves on request, so it claims completeness.
  for (const id of ['nikkaluoktaexpressen', 'nikkaluoktaexpressen-outbound']) {
    for (const p of timetablePeriodsFor(byId[id])) {
      assert.equal(p.stopCoverage, 'complete', `${id}/${p.id}`);
      for (const s of p.schedules) {
        const halts = s.calls.filter((c) => c.note === 'stops on request');
        assert.equal(halts.length, 6, `${id}/${p.id}/${s.id} keeps all six on-request halts`);
        assert.ok(halts.every((c) => c.time === undefined), 'an on-request halt carries no time');
      }
    }
  }
  // Line 91 runs on to Riksgränsen; the stored calls are a selection and must
  // say so rather than reading as the full line.
  for (const id of ['line-91', 'line-91-return']) {
    for (const p of timetablePeriodsFor(byId[id])) {
      assert.equal(p.stopCoverage, 'selected', `${id}/${p.id}`);
    }
  }
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /Selected stops for this route/);
  assert.match(src, /period\.stopCoverage !== 'selected'/);
});

test('the six on-request halts keep each direction’s own order', () => {
  const haltsOf = (id, scheduleId) => {
    const p = timetablePeriodsFor(byId[id])[0];
    return p.schedules
      .find((s) => s.id === scheduleId)
      .calls.filter((c) => c.note === 'stops on request')
      .map((c) => c.place);
  };
  assert.deepEqual(haltsOf('nikkaluoktaexpressen-outbound', 'morning'), [
    'Kaalasjärvi vägskäl',
    'Puoltsa',
    'Holmajärvi',
    'Laukkuluspa',
    'Årosjåkk',
    'Pirttivuopio',
  ]);
  assert.deepEqual(haltsOf('nikkaluoktaexpressen', 'morning'), [
    'Pirttivuopio',
    'Årosjåkk',
    'Laukkuluspa',
    'Holmajärvi',
    'Puoltsa',
    'Kaalasjärvi vägskäl',
  ]);
});

// ---- 6. Transcription corrections this pass made ----------------------------

test('line 91 afternoon runs start at Kiruna Sjukhus, as the official table does', () => {
  const period = timetablePeriodsFor(byId['line-91']).find((p) => p.id === 'line-91-2026-08-17');
  const expected = {
    'weekday-afternoon': '14:30',
    'sunday-afternoon': '14:30',
    'saturday-afternoon': '14:30',
    'special-saturday': '15:30',
  };
  for (const [scheduleId, time] of Object.entries(expected)) {
    const run = period.schedules.find((s) => s.id === scheduleId);
    assert.deepEqual(
      [run.calls[0].place, run.calls[0].time],
      ['Kiruna Sjukhus', time],
      `${scheduleId} starts at Kiruna Sjukhus`,
    );
  }
  // The morning run already had it and must not have moved.
  const morning = period.schedules.find((s) => s.id === 'morning');
  assert.deepEqual([morning.calls[0].place, morning.calls[0].time], ['Kiruna Sjukhus', '08:20']);
});

test('the weekday label carries the "helgfri" rule the source prints', () => {
  // "Hfr M-F" is helgfri måndag–fredag: a public holiday on a weekday does NOT
  // get this run, which "Monday to Friday" quietly promised it would.
  for (const id of ['line-91', 'line-91-return']) {
    for (const p of timetablePeriodsFor(byId[id])) {
      for (const s of p.schedules) {
        assert.equal(
          /^Monday to Friday$/.test(s.dayRule ?? ''),
          false,
          `${id}/${p.id}/${s.id} still claims plain Monday to Friday`,
        );
      }
      const weekday = p.schedules.find((s) => s.id === 'weekday-afternoon');
      if (weekday) assert.equal(weekday.dayRule, 'Weekdays except public holidays');
      const saturday = p.schedules.find((s) => s.id === 'saturday-afternoon');
      if (saturday) assert.equal(saturday.dayRule, 'Saturdays except public holidays');
      // Sundays and public holidays stay their own, separate run.
      const sunday = p.schedules.find((s) => s.id === 'sunday-afternoon');
      if (sunday) assert.equal(sunday.dayRule, 'Sundays and public holidays');
    }
  }
});

test('the 3–9 August Nikkaluoktaexpressen table is transcribed as published', () => {
  const period = timetablePeriodsFor(byId['nikkaluoktaexpressen-outbound']).find(
    (p) => p.id === 'nikkaluoktaexpressen-outbound-2026-08-03',
  );
  assert.equal(period.validityText, '3 – 9 August 2026');
  const afternoon = period.schedules.find((s) => s.id === 'afternoon');
  const timed = afternoon.calls.filter((c) => c.time);
  // The official PDF prints Kiruna Järnvägsstation and Kiruna Airport at the
  // same 15:25. Odd, but it is what the operator published — transcribed, not
  // corrected.
  assert.deepEqual(
    timed.map((c) => [c.place, c.time]),
    [
      ['Kiruna Stadshustorget', '15:05'],
      ['Kiruna Norrmalm', '15:15'],
      ['Kiruna railway station', '15:25'],
      ['Kiruna Airport', '15:25'],
      ['Nikkaluokta Fjällanläggning', '16:30'],
    ],
  );
  // Its connection notes quote its own times, not the later table's.
  assert.ok(period.connections.some((c) => /15:25 departure from Kiruna Airport/.test(c)));
  assert.ok(period.connections.some((c) => /land by 14:55/.test(c)));

  const back = timetablePeriodsFor(byId['nikkaluoktaexpressen']).find(
    (p) => p.id === 'nikkaluoktaexpressen-2026-08-03',
  );
  const backAfternoon = back.schedules.find((s) => s.id === 'afternoon');
  assert.deepEqual(
    backAfternoon.calls.filter((c) => c.time).map((c) => [c.place, c.time]),
    [
      ['Nikkaluokta Fjällanläggning', '16:40'],
      ['Kiruna railway station', '17:45'],
      ['Kiruna Airport', '18:00'],
      ['Kiruna Stadshustorget', '18:10'],
      ['Kiruna Norrmalm', '18:20'],
    ],
  );
  assert.ok(back.connections.some((c) => /no earlier than 18:45/.test(c)));
});

test('the 1 July – 16 August line 91 table is transcribed as published', () => {
  const out = timetablePeriodsFor(byId['line-91']).find((p) => p.id === 'line-91-2026-07-01');
  assert.equal(out.validityText, '1 July – 16 August 2026');
  assert.equal(out.operatingDays, 'Daily — the same two runs every day');
  assert.deepEqual(
    out.schedules.find((s) => s.id === 'morning').calls.map((c) => [c.place, c.time]),
    [
      ['Kiruna Sjukhus', '08:20'],
      ['Kiruna Stadshustorget', '08:25'],
      ['Abisko Östra', '09:35'],
      ['Abisko Turist E10', '09:40'],
    ],
  );
  const back = timetablePeriodsFor(byId['line-91-return']).find(
    (p) => p.id === 'line-91-return-2026-07-01',
  );
  assert.deepEqual(
    back.schedules.find((s) => s.id === 'evening').calls.map((c) => [c.place, c.time]),
    [
      ['Abisko Turist E10', '18:50'],
      ['Abisko Östra', '18:55'],
      ['Rensjön E10', '19:35'],
      ['Kiruna Stadshustorget', '20:05'],
      ['Kiruna Sjukhus', '20:10'],
    ],
  );
  // The morning run carries the airport; the evening one does not (a "|" in
  // the source), and that asymmetry must survive transcription.
  const morningPlaces = back.schedules
    .find((s) => s.id === 'morning')
    .calls.map((c) => c.place);
  assert.ok(morningPlaces.includes('Kiruna Airport'));
  assert.equal(
    back.schedules.find((s) => s.id === 'evening').calls.some((c) => c.place === 'Kiruna Airport'),
    false,
  );
});

// ---- 7. Nothing else moved --------------------------------------------------

test('the content version and dossier review date are untouched by this pass', async () => {
  const { TRAIL_CONTENT, trailDossierView } = await import('../src/data/trailMetadata.mjs');
  assert.equal(TRAIL_CONTENT.contentVersion, 1, 'the review cycle is still open');
  // Correcting four bus records is not a full dossier review, so this pass
  // must not start claiming one.
  assert.equal(TRAIL_CONTENT.lastFullyReviewedOn, undefined);
  assert.equal(trailDossierView(TRAIL_CONTENT).fullyReviewedOn, null);
});

test('Transport still reads the date from the calendar, and writes nothing', () => {
  const src = read('src/components/TransportView.tsx');
  // Planned-travel-day context does not exist to read yet — the deep link
  // carries no date — so Transport keeps the local calendar date and the
  // pure layer takes the date as an argument, ready for that integration.
  assert.match(src, /const today = useMemo\(\(\) => todayIso\(\), \[\]\)/);
  assert.equal(/localStorage|sessionStorage/.test(src), false, 'the view persists nothing');
  assert.equal(/fetch\(|XMLHttpRequest/.test(src), false, 'no runtime timetable fetch');
});
