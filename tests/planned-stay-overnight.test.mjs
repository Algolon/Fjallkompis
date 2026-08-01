import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannedDays } from '../src/plan/plannedDays.mjs';

const ORIENTED = { canonical: {}, opposite: {} };
const travelDay = (id = 'day_1', overnight) => ({
  id,
  activities: [{ kind: 'travel' }],
  ...(overnight ? { overnight } : {}),
});
const plan = (days) => ({
  direction: 'abisko-to-nikkaluokta',
  startDate: '2026-09-03',
  currentDayId: null,
  currentLegId: null,
  days,
});
const stay = (id, checkInDate, checkOutDate) => ({
  id,
  kind: 'stay',
  title: id,
  status: 'confirmed',
  stayType: 'mountain-station',
  checkInDate,
  ...(checkOutDate ? { checkOutDate } : {}),
  attachmentIds: [],
  createdAt: 1,
  updatedAt: 1,
});

test('a single dated Trip Stay supplies Tonight on a travel-only day', () => {
  const [day] = buildPlannedDays(
    ORIENTED,
    plan([travelDay()]),
    [stay('stay_abisko', '2026-09-03', '2026-09-04')],
  );
  assert.deepEqual(day.overnight, {
    kind: 'stay',
    tripItemId: 'stay_abisko',
    source: 'trip-stay',
  });
  assert.deepEqual(day.derivedOvernight, day.overnight);
});

test('stay check-out is exclusive and an undated duration is never invented', () => {
  const dated = buildPlannedDays(
    ORIENTED,
    plan([travelDay('day_1'), travelDay('day_2')]),
    [stay('one_night', '2026-09-03', '2026-09-04')],
  );
  assert.equal(dated[0].overnight.tripItemId, 'one_night');
  assert.equal(dated[1].overnight.kind, 'none');

  const openEnded = buildPlannedDays(
    ORIENTED,
    plan([travelDay('day_1'), travelDay('day_2')]),
    [stay('check_in_only', '2026-09-03')],
  );
  assert.equal(openEnded[0].overnight.tripItemId, 'check_in_only');
  assert.equal(openEnded[1].overnight.kind, 'none');
});

test('an explicit Day-plan overnight remains authoritative', () => {
  const [day] = buildPlannedDays(
    ORIENTED,
    plan([travelDay('day_1', { kind: 'stop', stopId: 'abisko' })]),
    [stay('stay_abisko', '2026-09-03', '2026-09-04')],
  );
  assert.deepEqual(day.overnight, {
    kind: 'stop',
    stopId: 'abisko',
    source: 'explicit',
  });
  assert.equal(day.derivedOvernight.tripItemId, 'stay_abisko');
});

test('several stays covering one night are left ambiguous', () => {
  const [day] = buildPlannedDays(
    ORIENTED,
    plan([travelDay()]),
    [
      stay('first', '2026-09-03', '2026-09-04'),
      stay('second', '2026-09-03', '2026-09-05'),
    ],
  );
  assert.deepEqual(day.overnight, { kind: 'none', source: 'derived' });
});
