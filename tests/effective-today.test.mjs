import test from 'node:test';
import assert from 'node:assert/strict';
import { TODAY_SOURCES, resolveEffectiveToday } from '../src/plan/effectiveToday.mjs';
import { localIsoDate } from '../src/utils/dateTimeField.mjs';

const days = [
  { id: 'day_1', number: 1, date: '2026-09-03', kinds: ['travel'] },
  { id: 'day_2', number: 2, date: '2026-09-04', kinds: ['hiking'] },
  { id: 'day_3', number: 3, date: '2026-09-05', kinds: ['rest'] },
];

const resolve = ({
  preview = null,
  active = true,
  manual = null,
  today = '2026-09-04',
  stage = 'd4',
  planDays = days,
} = {}) => resolveEffectiveToday(planDays, preview, active, manual, today, stage);

test('the explicit decision sources are stable', () => {
  assert.deepEqual(TODAY_SOURCES, [
    'preview', 'manual', 'date', 'before-plan', 'after-plan', 'generic',
  ]);
});

test('no plan resolves the generic canonical stage', () => {
  assert.deepEqual(resolve({ planDays: [] }), {
    kind: 'generic', stageId: 'd4', day: null, source: 'generic',
  });
});

test('an inactive plan cannot affect Today, even with a valid pointer and date', () => {
  assert.deepEqual(resolve({ active: false, manual: 'day_3' }), {
    kind: 'generic', stageId: 'd4', day: null, source: 'generic',
  });
});

test('active personal Journey precedence is manual, date, before, after', () => {
  assert.equal(resolve({ manual: 'day_3' }).source, 'manual');
  assert.equal(resolve({ manual: 'day_3' }).dayId, 'day_3');
  assert.equal(resolve().source, 'date');
  assert.equal(resolve().dayId, 'day_2');
  assert.equal(resolve({ today: '2026-08-20' }).source, 'before-plan');
  assert.equal(resolve({ today: '2026-08-20' }).dayId, 'day_1');
  assert.equal(resolve({ today: '2026-10-20' }).source, 'after-plan');
  assert.equal(resolve({ today: '2026-10-20' }).dayId, 'day_3');
});

test('Preview has highest precedence whether personal Journey is active or inactive', () => {
  for (const active of [true, false]) {
    for (const today of ['2026-08-20', '2026-09-04', '2026-10-20']) {
      const result = resolve({ preview: 'day_1', active, manual: 'day_3', today });
      assert.equal(result.source, 'preview');
      assert.equal(result.dayId, 'day_1');
    }
  }
});

test('invalid Preview falls through safely', () => {
  assert.equal(resolve({ preview: 'missing', manual: 'day_3' }).source, 'manual');
  assert.equal(resolve({ preview: 'missing', active: false }).source, 'generic');
});

test('invalid manual id falls through to date and clamped resolution', () => {
  assert.equal(resolve({ manual: 'missing' }).source, 'date');
  assert.equal(resolve({ manual: 'missing', today: '2026-08-20' }).source, 'before-plan');
  assert.equal(resolve({ manual: 'missing', today: '2026-10-20' }).source, 'after-plan');
});

test('empty or malformed local dates never guess a planned day', () => {
  for (const today of [null, '', '2026-9-4', '2026-02-30', 'not-a-date']) {
    assert.equal(resolve({ today }).source, 'generic');
  }
});

test('malformed planned dates cannot be clamped', () => {
  const malformed = days.map((d) => ({ ...d, date: null }));
  assert.equal(resolve({ planDays: malformed, today: '2026-09-04' }).source, 'generic');
});

test('resolution is pure and never writes automatic pointers', () => {
  const input = structuredClone(days);
  const before = JSON.stringify(input);
  resolve({ planDays: input, today: '2026-08-20' });
  resolve({ planDays: input, today: '2026-09-04' });
  resolve({ planDays: input, today: '2026-10-20' });
  assert.equal(JSON.stringify(input), before);
});

test('local calendar dates stay local at timezone boundaries', () => {
  const instant = new Date('2026-09-04T00:30:00Z');
  const expected = {
    'Pacific/Honolulu': '2026-09-03',
    'Europe/Amsterdam': '2026-09-04',
    'Pacific/Kiritimati': '2026-09-04',
  };
  for (const [timeZone, iso] of Object.entries(expected)) {
    const previous = process.env.TZ;
    process.env.TZ = timeZone;
    const local = localIsoDate(instant);
    process.env.TZ = previous;
    assert.equal(local, iso, timeZone);
    assert.equal(resolve({ today: local }).dayId, iso === '2026-09-03' ? 'day_1' : 'day_2');
  }
});
