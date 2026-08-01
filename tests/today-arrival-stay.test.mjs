import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodayArrivalStay } from '../src/plan/todayArrivalStay.mjs';

const travelDay = {
  id: 'day_1',
  activities: [{ kind: 'travel' }],
  stages: [],
  overnight: { kind: 'none', source: 'derived' },
  derivedOvernight: { kind: 'none', source: 'derived' },
};
const hikingDay = {
  id: 'day_2',
  activities: [{ kind: 'hiking' }],
  stages: [{ fromHutId: 'abisko', toHutId: 'abiskojaure' }],
  overnight: { kind: 'stop', stopId: 'abiskojaure', source: 'hiking' },
};
const stay = (id, extra = {}) => ({
  id,
  kind: 'stay',
  linkedPlaceId: 'abisko',
  title: 'STF Abisko Turiststation',
  ...extra,
});

test('Today resolves exactly one linked arrival Stay even when it carries dates', () => {
  const result = resolveTodayArrivalStay(
    travelDay,
    [travelDay, hikingDay],
    [stay('stay_abisko', { checkInDate: '2026-09-02', checkOutDate: '2026-09-03' })],
  );
  assert.notEqual(result, travelDay);
  assert.deepEqual(result.overnight, {
    kind: 'stay',
    tripItemId: 'stay_abisko',
    source: 'trip-stay',
  });
  assert.deepEqual(result.derivedOvernight, result.overnight);
});

test('existing overnight resolution remains authoritative', () => {
  const dated = {
    ...travelDay,
    overnight: { kind: 'stay', tripItemId: 'dated', source: 'trip-stay' },
  };
  assert.equal(
    resolveTodayArrivalStay(dated, [dated, hikingDay], [stay('other')]),
    dated,
  );
});

test('several linked stays remain ambiguous', () => {
  assert.equal(
    resolveTodayArrivalStay(
      travelDay,
      [travelDay, hikingDay],
      [stay('first'), stay('second')],
    ),
    travelDay,
  );
});

test('the fallback is limited to travel-only days and the next Hiking start', () => {
  const mixed = { ...travelDay, activities: [{ kind: 'travel' }, { kind: 'rest' }] };
  assert.equal(resolveTodayArrivalStay(mixed, [mixed, hikingDay], [stay('one')]), mixed);

  const wrongPlace = stay('wrong', { linkedPlaceId: 'kiruna' });
  assert.equal(
    resolveTodayArrivalStay(travelDay, [travelDay, hikingDay], [wrongPlace]),
    travelDay,
  );
});
