/**
 * Today stage-block redesign — metadata integrity and interaction contracts
 * (owner-approved direction:
 * docs/design-reviews/2026-07-v0.18-today-stage-block-direction.md).
 *
 * Data: the highlight taxonomy stays structured, deterministic and concise;
 * every stage's highlights trace to defined types; the display selector
 * sorts by the documented priority order and caps at four (a ceiling, not a
 * target — production data must include stages below the cap AND a stage
 * above it so prioritisation is really exercised).
 *
 * Screens: the repo has no DOM test runner, so the accessibility and
 * navigation requirements are pinned as source contracts — non-interactive
 * chip semantics on Today, the two follow-up actions and their payloads,
 * the Stages deep link, and the preserved in-session Map browse state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import {
  HIGHLIGHT_TYPES,
  MAX_STAGE_HIGHLIGHTS,
  REVERSE_STAGE_HIGHLIGHT_IDS,
  STAGE_HIGHLIGHT_IDS,
  highlightIdsFor,
  stageHighlights,
} from '../src/data/stageHighlights.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

// ---- Taxonomy integrity -----------------------------------------------------

test('every highlight type is complete, concise and one line', () => {
  for (const [id, t] of Object.entries(HIGHLIGHT_TYPES)) {
    assert.ok(typeof t.label === 'string' && t.label.trim().length > 0, `${id} label`);
    // One-line glanceable labels: the 17-character budget (measured at the
    // 320px viewport) is what keeps chips pairing two-per-row at the
    // smallest supported width without shrinking text.
    assert.ok(
      t.label.length <= 17,
      `${id} label "${t.label}" stays within the 17-character budget`,
    );
    assert.ok(!t.label.includes('\n'), `${id} label is one line`);
    assert.ok(typeof t.icon === 'string' && t.icon.length > 0, `${id} icon key`);
    assert.ok(Number.isInteger(t.priority), `${id} priority is an integer`);
  }
});

test('priorities are unique — selection is fully deterministic', () => {
  const priorities = Object.values(HIGHLIGHT_TYPES).map((t) => t.priority);
  assert.equal(new Set(priorities).size, priorities.length, 'no duplicate priorities');
});

test('the metadata is static — no GPS, network, clock or randomness', () => {
  const source = readFileSync(join(root, 'src/data/stageHighlights.mjs'), 'utf8');
  for (const forbidden of ['geolocation', 'navigator.', 'fetch(', 'Date.now', 'new Date', 'Math.random']) {
    assert.ok(!source.includes(forbidden), `stageHighlights.mjs must not use ${forbidden}`);
  }
});

// ---- Stage assignments ------------------------------------------------------

test('every GPX stage has highlight metadata, and none is orphaned', () => {
  const stageIds = route.stages.map((s) => s.id);
  assert.equal(stageIds.length, 7, 'route is seven stages');
  for (const id of stageIds) {
    assert.ok(STAGE_HIGHLIGHT_IDS[id], `stage ${id} has highlight metadata`);
  }
  for (const id of Object.keys(STAGE_HIGHLIGHT_IDS)) {
    assert.ok(stageIds.includes(id), `assignment ${id} matches a real stage`);
  }
});

test('every assigned highlight resolves to a defined type, without duplicates', () => {
  for (const [stageId, ids] of Object.entries(STAGE_HIGHLIGHT_IDS)) {
    assert.ok(ids.length > 0, `${stageId} assigns at least one highlight`);
    assert.equal(new Set(ids).size, ids.length, `${stageId} has no duplicate highlights`);
    for (const id of ids) {
      assert.ok(HIGHLIGHT_TYPES[id], `${stageId} highlight "${id}" is a defined type`);
    }
  }
});

test('every taxonomy type is genuinely used by at least one stage (either direction)', () => {
  // Direction-dependent types (steep-ascent, sustained-descent) only appear in
  // the reverse assignments, so usage is checked across BOTH directions.
  const used = new Set([
    ...Object.values(STAGE_HIGHLIGHT_IDS).flat(),
    ...Object.values(REVERSE_STAGE_HIGHLIGHT_IDS).flat(),
  ]);
  for (const id of Object.keys(HIGHLIGHT_TYPES)) {
    assert.ok(used.has(id), `type "${id}" earns its place in the taxonomy`);
  }
});

// ---- Direction-aware assignments -------------------------------------------

test('reverse assignments only override the direction-dependent climb/descent chips', () => {
  // Every reverse override targets a real stage and resolves to defined types.
  const stageIds = new Set(route.stages.map((s) => s.id));
  for (const [stageId, ids] of Object.entries(REVERSE_STAGE_HIGHLIGHT_IDS)) {
    assert.ok(stageIds.has(stageId), `reverse override ${stageId} is a real stage`);
    assert.equal(new Set(ids).size, ids.length, `${stageId} reverse has no duplicates`);
    for (const id of ids) {
      assert.ok(HIGHLIGHT_TYPES[id], `${stageId} reverse highlight "${id}" is defined`);
    }
  }
});

test('climb becomes descent (and vice versa) between directions on the same segment', () => {
  const fwdD2 = highlightIdsFor('d2', 'abisko-to-nikkaluokta');
  const revD2 = highlightIdsFor('d2', 'nikkaluokta-to-abisko');
  assert.ok(fwdD2.includes('sustained-climb'), 'd2 forward climbs out of the forest');
  assert.ok(revD2.includes('sustained-descent'), 'd2 reverse descends into the forest');
  assert.ok(!revD2.includes('sustained-climb'), 'd2 reverse is not a climb');

  const fwdD4 = highlightIdsFor('d4', 'abisko-to-nikkaluokta');
  const revD4 = highlightIdsFor('d4', 'nikkaluokta-to-abisko');
  assert.ok(fwdD4.includes('steep-descent'), 'd4 forward drops off the pass');
  assert.ok(revD4.includes('steep-ascent'), 'd4 reverse climbs to the pass');
});

test('direction-neutral segments reuse the forward assignment in reverse', () => {
  // d1/d5/d6/d7 have no directional climb chip, so both directions match.
  for (const id of ['d1', 'd5', 'd6', 'd7']) {
    assert.deepEqual(
      highlightIdsFor(id, 'nikkaluokta-to-abisko'),
      highlightIdsFor(id, 'abisko-to-nikkaluokta'),
      `${id} is direction-neutral`,
    );
  }
});

test('stageHighlights respects the direction argument, defaulting to forward', () => {
  assert.deepEqual(
    stageHighlights('d4').map((h) => h.id),
    stageHighlights('d4', undefined, 'abisko-to-nikkaluokta').map((h) => h.id),
    'default direction is forward',
  );
  assert.ok(
    stageHighlights('d4', undefined, 'nikkaluokta-to-abisko').some((h) => h.id === 'steep-ascent'),
    'reverse d4 surfaces the steep climb chip',
  );
});

// ---- Display selector: priority, cap, spread --------------------------------

test('stageHighlights returns at most four, sorted by priority', () => {
  assert.equal(MAX_STAGE_HIGHLIGHTS, 4);
  for (const stageId of Object.keys(STAGE_HIGHLIGHT_IDS)) {
    const shown = stageHighlights(stageId);
    assert.ok(shown.length <= MAX_STAGE_HIGHLIGHTS, `${stageId} shows ≤ 4`);
    for (let i = 1; i < shown.length; i++) {
      assert.ok(
        shown[i - 1].priority < shown[i].priority,
        `${stageId} chips are in priority order`,
      );
    }
    for (const h of shown) {
      assert.equal(h.label, HIGHLIGHT_TYPES[h.id].label, `${stageId} resolved label`);
      assert.equal(h.icon, HIGHLIGHT_TYPES[h.id].icon, `${stageId} resolved icon`);
    }
  }
});

test('prioritisation truncates over-assigned stages to the four most important', () => {
  const over = Object.entries(STAGE_HIGHLIGHT_IDS).filter(
    ([, ids]) => ids.length > MAX_STAGE_HIGHLIGHTS,
  );
  assert.ok(over.length >= 1, 'at least one stage exercises the cap in production data');
  for (const [stageId, ids] of over) {
    const shown = stageHighlights(stageId);
    assert.equal(shown.length, MAX_STAGE_HIGHLIGHTS, `${stageId} is capped at 4`);
    const expected = [...ids].sort(
      (a, b) => HIGHLIGHT_TYPES[a].priority - HIGHLIGHT_TYPES[b].priority,
    );
    assert.deepEqual(
      shown.map((h) => h.id),
      expected.slice(0, MAX_STAGE_HIGHLIGHTS),
      `${stageId} keeps the highest-priority four`,
    );
    // The dropped items are exactly the lowest-priority tail.
    for (const dropped of expected.slice(MAX_STAGE_HIGHLIGHTS)) {
      assert.ok(!shown.some((h) => h.id === dropped), `${stageId} drops ${dropped}`);
    }
  }
});

test('chip counts vary honestly (four is not a target to fill)', () => {
  const counts = new Set(
    Object.keys(STAGE_HIGHLIGHT_IDS).map((id) => stageHighlights(id).length),
  );
  assert.ok(counts.size >= 2, 'not every stage shows the same number of chips');
  assert.ok(Math.min(...counts) < MAX_STAGE_HIGHLIGHTS, 'some stage shows fewer than four');
});

test('zero-highlight stages render nothing: the selector returns []', () => {
  assert.deepEqual(stageHighlights('not-a-stage'), []);
  assert.deepEqual(stageHighlights(''), []);
  // And the render is guarded — no empty <ul> placeholder row.
  const today = readFileSync(join(root, 'src/screens/TodayScreen.tsx'), 'utf8');
  assert.match(today, /highlights\.length > 0 \? \(/, 'chip row only renders when non-empty');
});

test('0–4 displayed highlights are all reachable through the selector', () => {
  assert.equal(stageHighlights('not-a-stage').length, 0);
  const perStage = Object.keys(STAGE_HIGHLIGHT_IDS).map((id) => stageHighlights(id).length);
  for (const n of [2, 3, 4]) {
    assert.ok(perStage.includes(n), `some real stage displays exactly ${n} chips`);
  }
  const anyStage = Object.keys(STAGE_HIGHLIGHT_IDS)[0];
  assert.equal(stageHighlights(anyStage, 1).length, 1, 'an explicit max of 1 yields 1');
});

// ---- Today screen contract ---------------------------------------------------

const today = readFileSync(join(root, 'src/screens/TodayScreen.tsx'), 'utf8');

test('chips are semantically non-interactive metadata with a labelled list', () => {
  assert.match(today, /<ul className="hero-chips" aria-label="Stage characteristics">/);
  assert.match(today, /<li key=\{h\.id\} className="hero-chip">/);
  // Icons supplement the visible text label, never replace it.
  assert.match(today, /<HighlightIcon size=\{13\} strokeWidth=\{2\.2\} aria-hidden \/>/);
  assert.match(today, /\{h\.label\}/);
  // No interaction affordances anywhere in the chip markup.
  const chips = today.slice(today.indexOf('hero-chips'), today.indexOf('hero-actions'));
  assert.ok(!chips.includes('onClick'), 'chips have no click handler');
  assert.ok(!chips.includes('<button'), 'chips are not buttons');
  assert.ok(!chips.includes('tabIndex'), 'chips are not focusable');
  assert.ok(!chips.includes('role='), 'chips carry no interactive role');
});

test('every taxonomy icon key is mapped to a lucide component on Today', () => {
  for (const [id, t] of Object.entries(HIGHLIGHT_TYPES)) {
    const key = /^[a-z]+$/.test(t.icon) ? `${t.icon}:` : `'${t.icon}':`;
    assert.ok(
      today.includes(key),
      `icon key "${t.icon}" (type ${id}) is mapped in HIGHLIGHT_ICONS`,
    );
  }
});

test('Stage Guide opens the CURRENT stage’s guide on Stages', () => {
  assert.match(
    today,
    /onClick=\{\(\) => onNavigate\('stages', \{ guideStageId: currentStage\.id \}\)\}/,
  );
  assert.match(today, />\s*Stage Guide\s*</, 'visible Stage Guide label');
  // App.tsx forwards the one-shot payload into StagesScreen.
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.match(
    app,
    /initialGuideStageId=\{nav\.payload\?\.guideStageId \?\? null\}/,
  );
  // StagesScreen never leaves the user at a generic collapsed list: the
  // deep-linked guide opens and its card scrolls into view.
  const stages = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');
  assert.match(stages, /initialGuideStageId \? \[initialGuideStageId\] : \[\]/);
  assert.match(stages, /scrollIntoView/);
});

test('View Route focuses the Map on the current stage via the payload', () => {
  assert.match(
    today,
    /onClick=\{\(\) => onNavigate\('map', \{ mapStageId: currentStage\.id \}\)\}/,
  );
  assert.match(today, />\s*View Route\s*</, 'visible View Route label');
});

test('the remembered in-session Map context is only overwritten explicitly', () => {
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  // Only an explicit mapStageId payload (Today's View Route) touches the
  // browse state; plain tab navigation to #/map preserves it. Together with
  // tests/map-initial-view.test.mjs (fresh mount = full route) this fences
  // the whole remembered-context design.
  assert.match(app, /if \(tab === 'map' && 'mapStageId' in \(payload \?\? \{\}\)\) \{/);
  assert.match(app, /setMapViewStageId\(payload\?\.mapStageId \?\? null\);/);
});

test('the block keeps its fixed responsibility — no dashboard creep', () => {
  const hero = today.slice(today.indexOf('className="hero"'), today.indexOf('Journey progress'));
  // Exactly two actions inside the stage block.
  const actions = hero.match(/className="hero-action(?: |")/g) ?? [];
  assert.equal(actions.length, 2, 'exactly two follow-up actions');
  // No separate visible heading above the chips (deliberate review decision).
  assert.ok(!/Highlights</.test(hero), 'no "Highlights" heading');
  assert.ok(!/Stage Briefing/.test(hero), 'no "Stage Briefing" heading');
  // None of the explicitly excluded content classes appear in the block.
  for (const forbidden of [/[Ww]eather forecast/, /[Ll]ive progress/, /useGeolocation/]) {
    assert.ok(!forbidden.test(hero), `stage block must not gain ${forbidden}`);
  }
});
