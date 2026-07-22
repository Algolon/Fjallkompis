/**
 * Trip plan pure-model behaviour (src/trip/tripModel.mjs): normalisation,
 * validation helpers, canonical sorting (with `todayIso` injected — the
 * timetableStatus pattern), the status summary a future Today "Prepare" view
 * will read, and the verified-facts-only prefill builders behind
 * "Add to Trip" and "Track stay".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_STATUSES,
  TRIP_STAY_TYPES,
  TRIP_TRANSPORT_MODES,
  isStayDateOrderValid,
  isTripDate,
  isTripTime,
  newTripItemId,
  normalizeTripItem,
  normalizeTripItems,
  sortStayItems,
  sortTravelItems,
  stayPrefillFromStop,
  transportPrefillFromEntry,
  tripPlanSummary,
  tripStatusTitle,
} from '../src/trip/tripModel.mjs';
import { TRANSPORT_ENTRIES } from '../src/data/transport.mjs';

const TODAY = '2026-08-20';

// ---- Vocabulary -------------------------------------------------------------

test('exactly the three approved statuses exist, in progression order', () => {
  assert.deepEqual(
    TRIP_STATUSES.map((s) => s.id),
    ['needed', 'planned', 'confirmed'],
  );
  assert.deepEqual(
    TRIP_STATUSES.map((s) => s.title),
    ['Needed', 'Planned', 'Confirmed'],
  );
  // The first version deliberately has no completed/cancelled.
  assert.ok(!TRIP_STATUSES.some((s) => /completed|cancelled/i.test(s.id)));
});

test('transport modes and stay types match the approved sets', () => {
  assert.deepEqual(
    TRIP_TRANSPORT_MODES.map((m) => m.id),
    ['flight', 'train', 'bus', 'boat', 'taxi-shuttle', 'other'],
  );
  assert.deepEqual(
    TRIP_STAY_TYPES.map((t) => t.id),
    ['hotel-hostel', 'mountain-station', 'mountain-hut', 'other'],
  );
});

// ---- Field validation -------------------------------------------------------

test('date and time validators accept native-input shapes only', () => {
  assert.ok(isTripDate('2026-08-20'));
  assert.ok(!isTripDate('20/08/2026'));
  assert.ok(!isTripDate('2026-8-2'));
  assert.ok(!isTripDate(''));
  assert.ok(!isTripDate(20260820));
  assert.ok(isTripTime('09:05'));
  assert.ok(isTripTime('23:59'));
  assert.ok(!isTripTime('24:00'));
  assert.ok(!isTripTime('9:05'));
  assert.ok(!isTripTime('09:05:30'));
});

test('stay date ordering: one-night stays valid, reversed pair invalid, absent dates fine', () => {
  assert.ok(isStayDateOrderValid('2026-08-20', '2026-08-21'), 'one night');
  assert.ok(isStayDateOrderValid('2026-08-20', '2026-08-20'), 'equal pair tolerated');
  assert.ok(!isStayDateOrderValid('2026-08-21', '2026-08-20'), 'check-out before check-in');
  assert.ok(isStayDateOrderValid(undefined, '2026-08-20'));
  assert.ok(isStayDateOrderValid('2026-08-20', undefined));
  assert.ok(isStayDateOrderValid(undefined, undefined));
});

// ---- Normalisation ----------------------------------------------------------

test('a valid transport item normalises verbatim (idempotent)', () => {
  const raw = {
    id: 'trip_t1',
    kind: 'transport',
    title: 'Bus 91 to Abisko',
    status: 'confirmed',
    mode: 'bus',
    from: 'Kiruna',
    to: 'Abisko Turiststation',
    date: '2026-08-22',
    departureTime: '08:20',
    arrivalTime: '09:40',
    provider: 'Länstrafiken Norrbotten',
    bookingReference: 'LTN-778',
    notes: 'Buy on board',
    attachmentIds: ['doc_1', 'doc_2'],
    linkedTransportId: 'line-91',
    createdAt: 100,
    updatedAt: 200,
  };
  const item = normalizeTripItem(raw);
  assert.deepEqual(item, raw);
  assert.deepEqual(normalizeTripItem(item), item, 'idempotent');
});

test('a valid stay item normalises verbatim (idempotent)', () => {
  const raw = {
    id: 'trip_s1',
    kind: 'stay',
    title: 'Sälka hut',
    status: 'planned',
    stayType: 'mountain-hut',
    location: 'Tjäktjavagge',
    checkInDate: '2026-08-25',
    checkOutDate: '2026-08-26',
    bookingReference: 'STF-1',
    attachmentIds: [],
    linkedStopId: 'salka',
    createdAt: 100,
    updatedAt: 100,
  };
  const item = normalizeTripItem(raw);
  assert.deepEqual(item, raw);
  assert.deepEqual(normalizeTripItem(item), item, 'idempotent');
});

test('items without a usable id or a known kind are dropped', () => {
  assert.equal(normalizeTripItem(null), null);
  assert.equal(normalizeTripItem('x'), null);
  assert.equal(normalizeTripItem({ kind: 'transport', title: 'no id' }), null);
  assert.equal(normalizeTripItem({ id: '', kind: 'stay', title: 'empty id' }), null);
  assert.equal(normalizeTripItem({ id: 'trip_x', kind: 'teleport', title: 'x' }), null);
});

test('unknown status, mode and stay type fall back safely', () => {
  const t = normalizeTripItem({ id: 'a', kind: 'transport', title: 'x', status: 'BOOKED', mode: 'zeppelin' });
  assert.equal(t.status, 'needed');
  assert.equal(t.mode, 'other');
  const s = normalizeTripItem({ id: 'b', kind: 'stay', title: 'x', status: 42, stayType: 'igloo' });
  assert.equal(s.status, 'needed');
  assert.equal(s.stayType, 'other');
  assert.equal(tripStatusTitle('nope'), 'Needed');
});

test('titles are trimmed; an empty title heals to Untitled, never crashes', () => {
  assert.equal(normalizeTripItem({ id: 'a', kind: 'stay', title: '  Sälka  ' }).title, 'Sälka');
  assert.equal(normalizeTripItem({ id: 'a', kind: 'stay', title: '   ' }).title, 'Untitled');
  assert.equal(normalizeTripItem({ id: 'a', kind: 'stay' }).title, 'Untitled');
});

test('optional empty strings are removed, not persisted', () => {
  const t = normalizeTripItem({
    id: 'a',
    kind: 'transport',
    title: 'x',
    from: '  ',
    to: '',
    provider: '',
    notes: ' ',
    bookingReference: '',
    linkedStopId: '',
  });
  for (const key of ['from', 'to', 'provider', 'notes', 'bookingReference', 'linkedStopId']) {
    assert.ok(!(key in t), `${key} removed`);
  }
});

test('invalid dates and times are removed without crashing', () => {
  const t = normalizeTripItem({
    id: 'a',
    kind: 'transport',
    title: 'x',
    date: 'tomorrow',
    departureTime: '25:99',
    arrivalTime: 42,
  });
  assert.ok(!('date' in t) && !('departureTime' in t) && !('arrivalTime' in t));
});

test('a check-out before check-in drops the check-out, keeps the stay', () => {
  const s = normalizeTripItem({
    id: 'a',
    kind: 'stay',
    title: 'x',
    checkInDate: '2026-08-25',
    checkOutDate: '2026-08-20',
  });
  assert.equal(s.checkInDate, '2026-08-25');
  assert.ok(!('checkOutDate' in s));
});

test('attachmentIds are deduplicated, blob-free string ids only', () => {
  const t = normalizeTripItem({
    id: 'a',
    kind: 'stay',
    title: 'x',
    attachmentIds: ['doc_1', 'doc_1', '', 42, null, 'doc_2'],
  });
  assert.deepEqual(t.attachmentIds, ['doc_1', 'doc_2']);
  assert.deepEqual(normalizeTripItem({ id: 'a', kind: 'stay', title: 'x' }).attachmentIds, []);
});

test('linked source ids and timestamps are preserved; kind-foreign fields are stripped', () => {
  const t = normalizeTripItem({
    id: 'a',
    kind: 'transport',
    title: 'x',
    linkedTransportId: 'line-91',
    checkInDate: '2026-08-20', // stay-only field on a transport record
    createdAt: 500,
  });
  assert.equal(t.linkedTransportId, 'line-91');
  assert.equal(t.createdAt, 500);
  assert.equal(t.updatedAt, 500, 'updatedAt falls back to createdAt');
  assert.ok(!('checkInDate' in t));
});

test('unknown extra fields survive (future additive extensions)', () => {
  const t = normalizeTripItem({ id: 'a', kind: 'stay', title: 'x', futureField: 'kept' });
  assert.equal(t.futureField, 'kept');
});

test('normalizeTripItems drops malformed entries and duplicate ids', () => {
  const items = normalizeTripItems([
    null,
    { id: 'a', kind: 'stay', title: 'first' },
    { id: 'a', kind: 'stay', title: 'duplicate' },
    { id: 'b', kind: 'transport', title: 'ok' },
    'garbage',
  ]);
  assert.deepEqual(
    items.map((i) => i.id),
    ['a', 'b'],
  );
  assert.equal(items[0].title, 'first');
  assert.deepEqual(normalizeTripItems('nope'), []);
  assert.deepEqual(normalizeTripItems(items), items, 'idempotent');
});

test('generated ids are unique and trip-prefixed', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newTripItemId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^trip_/);
});

// ---- Sorting ----------------------------------------------------------------

const travel = (id, extra) => ({
  id,
  kind: 'transport',
  title: id,
  status: 'planned',
  mode: 'bus',
  attachmentIds: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

test('travel sorts: upcoming ascending, then undated, then past descending', () => {
  const items = [
    travel('past-old', { date: '2026-08-01' }),
    travel('undated'),
    travel('soon', { date: '2026-08-21' }),
    travel('today', { date: TODAY }),
    travel('later', { date: '2026-09-02' }),
    travel('past-recent', { date: '2026-08-19' }),
  ];
  const sorted = sortTravelItems(items, TODAY);
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['today', 'soon', 'later', 'undated', 'past-recent', 'past-old'],
  );
});

test('same-day travel sorts by departure time; untimed entries come last that day', () => {
  const items = [
    travel('no-time', { date: TODAY }),
    travel('evening', { date: TODAY, departureTime: '18:00' }),
    travel('morning', { date: TODAY, departureTime: '08:20' }),
  ];
  assert.deepEqual(
    sortTravelItems(items, TODAY).map((i) => i.id),
    ['morning', 'evening', 'no-time'],
  );
});

test('sorting never mutates the input array and is deterministic on ties', () => {
  const items = [travel('b'), travel('a')];
  const snapshot = items.map((i) => i.id);
  const sorted = sortTravelItems(items, TODAY);
  assert.deepEqual(
    items.map((i) => i.id),
    snapshot,
    'input untouched',
  );
  // Equal dates/updatedAt → title tie-break, deterministic.
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['a', 'b'],
  );
});

const stay = (id, extra) => ({
  id,
  kind: 'stay',
  title: id,
  status: 'planned',
  stayType: 'mountain-hut',
  attachmentIds: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

test('stays sort by check-in: upcoming ascending, undated, past descending', () => {
  const items = [
    stay('past', { checkInDate: '2026-08-10' }),
    stay('undated'),
    stay('next-week', { checkInDate: '2026-08-27' }),
    stay('tonight', { checkInDate: TODAY }),
  ];
  const sorted = sortStayItems(items, TODAY);
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['tonight', 'next-week', 'undated', 'past'],
  );
  assert.equal(items[0].id, 'past', 'input untouched');
});

// ---- Status summary ---------------------------------------------------------

test('the summary counts travel and stays by status; empty input is all zeros', () => {
  const summary = tripPlanSummary([
    travel('a', { status: 'needed' }),
    travel('b', { status: 'confirmed' }),
    stay('c', { status: 'planned' }),
    stay('d', { status: 'confirmed' }),
  ]);
  assert.deepEqual(summary, {
    total: 4,
    travelCount: 2,
    stayCount: 2,
    needed: 1,
    planned: 1,
    confirmed: 2,
  });
  assert.deepEqual(tripPlanSummary([]), {
    total: 0,
    travelCount: 0,
    stayCount: 0,
    needed: 0,
    planned: 0,
    confirmed: 0,
  });
});

test('standalone documents (or any non-item shapes) never enter the summary', () => {
  const summary = tripPlanSummary([
    travel('a'),
    { id: 'doc_1', kind: 'document', title: 'a PDF' },
    { id: 'x', title: 'no kind at all' },
  ]);
  assert.equal(summary.total, 1);
  assert.equal(summary.travelCount, 1);
  assert.equal(summary.stayCount, 0);
});

// ---- Transport prefill (Add to Trip) ----------------------------------------

test('Add to Trip copies only verified source facts — never timetable dates/times', () => {
  const line91 = TRANSPORT_ENTRIES.find((e) => e.id === 'line-91');
  const prefill = transportPrefillFromEntry(line91);
  assert.equal(prefill.kind, 'transport');
  assert.equal(prefill.mode, 'bus');
  assert.equal(prefill.title, line91.title);
  assert.equal(prefill.provider, line91.operator);
  assert.equal(prefill.linkedTransportId, 'line-91');
  assert.equal(prefill.status, 'planned');
  // Endpoints come from the entry's own direction string.
  assert.equal(prefill.from, 'Kiruna');
  assert.equal(prefill.to, 'Abisko Turiststation');
  // The personal fields the user must supply are NEVER prefilled.
  for (const key of ['date', 'departureTime', 'arrivalTime', 'bookingReference']) {
    assert.ok(!(key in prefill), `${key} is not invented`);
  }
});

test('every reference transport entry produces a valid prefill', () => {
  for (const entry of TRANSPORT_ENTRIES) {
    const prefill = transportPrefillFromEntry(entry);
    assert.equal(prefill.kind, 'transport');
    assert.ok(['flight', 'train', 'bus', 'boat', 'taxi-shuttle', 'other'].includes(prefill.mode));
    assert.equal(prefill.linkedTransportId, entry.id);
    assert.equal(prefill.status, 'planned');
    assert.ok(prefill.title.length > 0);
  }
});

test('a degenerate entry still prefills without crashing', () => {
  const prefill = transportPrefillFromEntry({});
  assert.equal(prefill.title, 'Transport');
  assert.equal(prefill.mode, 'other');
  assert.ok(!('linkedTransportId' in prefill));
});

// ---- Stay prefill (Track stay) ----------------------------------------------

test('Track stay maps verified stop facts to a linked planned stay', () => {
  const prefill = stayPrefillFromStop({
    id: 'salka',
    name: 'Sälka Mountain Cabin',
    type: 'mountain-cabin',
  });
  assert.deepEqual(prefill, {
    kind: 'stay',
    title: 'Sälka Mountain Cabin',
    stayType: 'mountain-hut',
    status: 'planned',
    linkedStopId: 'salka',
  });
  assert.equal(
    stayPrefillFromStop({ id: 'abisko', name: 'Abisko', type: 'mountain-station' }).stayType,
    'mountain-station',
  );
  assert.equal(
    stayPrefillFromStop({ id: 'nikkaluokta', name: 'Nikkaluokta', type: 'village' }).stayType,
    'other',
  );
});

test('the stay link uses the stable physical stop id — direction cannot corrupt it', () => {
  // The prefill takes the stop record itself; there is no day-number or
  // direction input at all, so reversing the route cannot change the link.
  const prefill = stayPrefillFromStop({ id: 'salka', name: 'Sälka', type: 'mountain-cabin' });
  assert.equal(prefill.linkedStopId, 'salka');
});
