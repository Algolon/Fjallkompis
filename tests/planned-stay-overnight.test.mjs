import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannedDays } from '../src/plan/plannedDays.mjs';

const STAGE = {
  id: 'abisko-abiskojaure',
  fromHutId: 'abisko',
  toHutId: 'abiskojaure',
  distanceKm: 13.8,
  totalAscentM: 137,
  totalDescentM: 36,
  minimumElevationM: 380,
  maximumElevationM: 490,
  estimatedHours: 5,
  elevationProfile: [],
  points: [],
};
const ORIENTED = { canonical: {}, opposite: {} };
const ORIENTED_WITH_STAGE = {
  canonical: { [STAGE.id]: STAGE },
  opposite: {},
};
const travelDay = (id = 'day_1', overnight) => ({
  id,
  activities: [{ kind: 'travel' }],
  ...(overnight ? { overnight } : {}),
});
const hikingDay = (id = 'day_2') => ({
  id,
  activities: [
    {
      kind: 'hiking',
      legs: [
        {
          id: `${id}_leg_1`,
          stageId: STAGE.id,
          orientation: 'canonical',
        },
      ],
    },
  ],
});
const plan = (days) => ({
  direction: 'abisko-to-nikkaluokta',
  startDate: '2026-09-03',
  currentDayId: null,
  currentLegId: null,
  days,
});
const stay = (id, checkInDate, checkOutDate, linkedPlaceId) => ({
  id,
  kind: 'stay',
  title: id,
  status: 'confirmed',
  stayType: 'mountain-station',
  ...(checkInDate ? { checkInDate } : {}),
  ...(checkOutDate ? { checkOutDate } : {}),
  ...(linkedPlaceId ? { linkedPlaceId } : {}),
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

test('a travel-only arrival day uses one undated Stay linked to the next Hiking start', () => {
  const days = buildPlannedDays(
    ORIENTED_WITH_STAGE,
    plan([travelDay(), hikingDay()]),
    [stay('stay_abisko', undefined, undefined, 'abisko')],
  );
  assert.deepEqual(days[0].overnight, {
    kind: 'stay',
    tripItemId: 'stay_abisko',
    source: 'trip-stay',
  });
  assert.equal(days[1].fromStopId, 'abisko');
});

test('linked arrival fallback refuses multiple or explicitly dated candidates', () => {
  const several = buildPlannedDays(
    ORIENTED_WITH_STAGE,
    plan([travelDay(), hikingDay()]),
    [
      stay('first', undefined, undefined, 'abisko'),
      stay('second', undefined, undefined, 'abisko'),
    ],
  );
  assert.deepEqual(several[0].overnight, { kind: 'none', source: 'derived' });

  const mismatchedDate = buildPlannedDays(
    ORIENTED_WITH_STAGE,
    plan([travelDay(), hikingDay()]),
    [stay('dated_elsewhere', '2026-09-04', '2026-09-05', 'abisko')],
  );
  assert.deepEqual(mismatchedDate[0].overnight, { kind: 'none', source: 'derived' });
});

test('free-text or differently linked stays are never inferred for arrival', () => {
  const days = buildPlannedDays(
    ORIENTED_WITH_STAGE,
    plan([travelDay(), hikingDay()]),
    [
      stay('free_text_only'),
      stay('linked_elsewhere', undefined, undefined, 'stf-kiruna'),
    ],
  );
  assert.deepEqual(days[0].overnight, { kind: 'none', source: 'derived' });
});
