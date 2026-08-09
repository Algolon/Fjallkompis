/**
 * Day plan → Today activation: semantics and state communication.
 *
 * THE PRODUCT DECISION THIS DEFENDS. Creating a Day plan does NOT replace
 * generic Today. The standard route stays until the user explicitly asks for
 * their own days. That is deliberate, and the Phase 1 audit's finding was
 * NOT that the default was wrong — it was that the default was invisible: the
 * user built a plan, nothing changed on Today, and the control that would
 * have changed it sat below the editing row wearing an implementation-facing
 * label ("Use Day plan on Today") with one description that read identically
 * whether the plan was on or off.
 *
 * So this file pins two separate things:
 *   1. the SEMANTICS are untouched — creation leaves a plan inactive, the
 *      flag is persisted, and it cannot outlive the plan it belongs to;
 *   2. the COMMUNICATION is unambiguous — the control says what it does, and
 *      the supporting sentence says what is true right now.
 *
 * A future change that "helpfully" auto-activates a new plan will fail here,
 * and should: it would be a product reversal, not a bug fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const dayPlan = read('src/plan/dayPlan.mjs');
const store = read('src/store/AppStore.tsx');
const card = read('src/components/DayPlanCard.tsx');
const onRoute = read('src/components/TodayOnRoute.tsx');
const effective = read('src/plan/effectiveToday.mjs');

// ---- 1. Semantics: unchanged, and deliberately so -------------------------

test('a newly created plan is inactive', () => {
  const build = dayPlan.slice(dayPlan.indexOf('journeyActive: false'));
  assert.ok(build.length > 0, 'creation sets journeyActive: false');
  assert.ok(
    !/journeyActive: true/.test(dayPlan),
    'nothing in the plan builder ever creates an already-active plan',
  );
});

test('generic Today is what an inactive plan falls back to', () => {
  // The single gate. If this stops being an early return, the default
  // changed.
  assert.match(effective, /if \(journeyActive !== true\) return generic;/);
});

test('the active flag is persisted, and defaults OFF when absent or malformed', () => {
  // Hydration must not treat a stray pointer, or an older payload, as consent
  // to replace Today.
  assert.match(dayPlan, /journeyActive: source\.journeyActive === true/);
});

test('the flag lives inside the plan, so it cannot be orphaned', () => {
  // Removing the plan nulls the whole object; there is no separate
  // "activation" key that could survive it. Same for a direction change,
  // which also discards the plan.
  assert.match(store, /setState\(\(s\) => \(s\.dayPlan \? \{ \.\.\.s, dayPlan: null \} : s\)\)/);
  assert.match(store, /dayPlan: null \};/, 'a direction change discards the plan too');
  assert.ok(
    !/journeyActive/.test(read('src/types/index.ts').replace(/[\s\S]*interface DayPlan[^}]*}/, '')),
    'journeyActive is declared on DayPlan and nowhere else in the state shape',
  );
});

test('toggling is a pure flag flip — it moves nothing else', () => {
  const setter = store.slice(store.indexOf('if (!s.dayPlan || s.dayPlan.journeyActive === active)'));
  const body = setter.slice(0, setter.indexOf('}, []'));
  assert.match(body, /journeyActive: active/);
  assert.ok(!/currentStageId/.test(body), 'route progress is untouched');
  assert.ok(!/days:/.test(body), 'the planned days are untouched');
});

test('preview is independent of activation', () => {
  // Previewing a day works whether or not the plan is active, and previewing
  // must never activate it.
  assert.match(card, /previewPlannedDay\(/);
  const preview = store.slice(store.indexOf('previewPlannedDay'));
  assert.ok(
    !/journeyActive: true/.test(preview.slice(0, 600)),
    'previewing never sets the plan active',
  );
});

// ---- 2. Communication ------------------------------------------------------

test('the control names the plan and Today, not the screen', () => {
  assert.match(card, /<strong>Use this plan on Today<\/strong>/);
  assert.match(card, /aria-label="Use this plan on Today"/);
});

test('the state sentence answers "what is Today showing right now?"', () => {
  assert.match(card, /'Today is using this plan\.'/);
  assert.match(card, /'Today is showing the standard route\.'/);
});

test('no internal state vocabulary reaches the user', () => {
  // journeyActive is the flag's name in code; it must never be a label.
  const copy = card.match(/>[^<>{}]*[a-z][^<>{}]*</g) ?? [];
  for (const fragment of copy) {
    assert.ok(!/journeyActive/i.test(fragment), 'no internal flag name in copy');
    assert.ok(!/seven-stage/i.test(fragment), 'no data-model description in copy');
  }
});

test('Today says whose day it is showing, not how it resolved it', () => {
  // "Following dates" described the resolution mechanism. The other contexts
  // are specific situations and are unchanged — 'Preview' in particular must
  // stay distinct, because previewing works while the plan is inactive.
  assert.match(onRoute, /: 'Your plan';/);
  assert.ok(!/'Following dates'/.test(onRoute), 'the mechanism wording is gone');
  for (const kept of ["'Preview'", "'Selected'", "'Up next'", "'Plan ended'"]) {
    assert.ok(onRoute.includes(kept), `${kept} is still a distinct state`);
  }
});

test('the Today indicator stays a one-line label in the existing slot', () => {
  // It shares the Journey card's header row with the title. Growing it into
  // its own block would cost hero/route height on a 375x667 screen.
  assert.match(
    onRoute,
    /\{context\} · Day \{day\.number\} of \{plannedDays\.length\}/,
    'still one compact line, unchanged in structure',
  );
});
