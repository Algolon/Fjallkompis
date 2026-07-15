/**
 * Source-contract fence for the Highlights & detours redesign
 * (docs/proposals/highlights-and-detours.md). The repo has no DOM test runner
 * and the curated data is TypeScript, so these guarantees are pinned as string
 * contracts on the source files — complementing the pure-logic tests in
 * experience-model.test.mjs.
 *
 * Guards: the day guide no longer renders a Highlights list; the disclosure is
 * the combined "Highlights & detours"; detours expand inline (no pushed detail
 * page, no modal); the migrated Highlight records exist; the two Day-1 detours
 * keep their verified map geometry; the route-wide birch Highlight offers no map
 * action; and no internal provenance terminology reaches the render layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const stagesScreen = read('src/screens/StagesScreen.tsx');
const component = read('src/components/StageExperiences.tsx');
const data = read('src/data/routeExperiences.ts');
const guides = read('src/data/stageGuides.mjs');

// ── The day guide no longer carries a Highlights list ────────────────────────

test('the day guide renders no Highlights list', () => {
  assert.ok(!stagesScreen.includes('guide.highlights'), 'no guide.highlights render');
  assert.ok(
    !/stage-guide__label">\s*Highlights/.test(stagesScreen),
    'no "Highlights" label inside the day guide panel',
  );
  // And the data field is gone from the guides module entirely.
  assert.ok(!/\n\s*highlights:\s*\[/.test(guides), 'stageGuides carries no highlights field');
});

// ── The combined "Highlights & detours" disclosure ───────────────────────────

test('the disclosure is the combined "Highlights & detours" (not "Along the way")', () => {
  assert.ok(stagesScreen.includes('Highlights &amp; detours'), 'combined disclosure label');
  assert.ok(!stagesScreen.includes('Along the way'), 'old "Along the way" label is gone');
  // The count on the trigger is the combined experience count.
  assert.ok(stagesScreen.includes('· {experienceCount}'), 'combined count on the trigger');
});

// ── Detours expand inline — no pushed detail page, no modal ───────────────────

test('detours expand inline — no separate detail page or modal', () => {
  assert.ok(stagesScreen.includes('HighlightsAndDetours'), 'uses the inline section component');
  assert.ok(!stagesScreen.includes('ExperienceDetail'), 'no pushed detail view imported/used');
  assert.ok(!stagesScreen.includes('selectedExperience'), 'no detail selection state');
  assert.ok(!stagesScreen.includes('onOpenDetail'), 'no open-detail handler');
  assert.ok(!component.includes('ExperienceDetail'), 'component exports no detail view');
  assert.ok(!component.includes('role="dialog"'), 'no modal/dialog surface');
  // Inline disclosure wiring on both row kinds.
  assert.ok(component.includes('aria-expanded={open}'), 'inline aria-expanded disclosure');
});

// ── The migrated Highlight records exist ─────────────────────────────────────

test('Day guide Highlights were migrated into Highlight records', () => {
  for (const id of [
    'abisko-limestone-bluff',
    'abiskojaure-lakeshore',
    'siellajohka-bridge',
    'upper-valley-braiding',
    'alpine-vegetation-transition',
    'tjaktja-approach-view',
    'gaskkasjohka-bridges',
    'duolbagorni',
    'kebnekaise-massif-lookback',
    'abisko-birch-return',
  ]) {
    assert.ok(data.includes(`id: '${id}'`), `${id} migrated into routeExperiences`);
  }
});

// ── The two Day-1 detours keep their verified map geometry ───────────────────

test('Day-1 detours keep their owner GPX map action and decision facts', () => {
  for (const id of ['abiskojakka-canyon', 'lake-njakajaure-lapporten']) {
    assert.ok(data.includes(`gpxAssetId: '${id}.detour'`), `${id} keeps its GPX asset link`);
  }
  assert.ok(data.includes("mapAvailability: 'verified-route'"), 'a verified-route map action remains');
  // Collapsed decision facts need a difficulty for the two detours.
  const canyon = data.slice(data.indexOf("id: 'abiskojakka-canyon'"));
  assert.ok(/difficulty: 'easy'/.test(canyon.slice(0, 400)), 'canyon detour has a difficulty');
  const lake = data.slice(data.indexOf("id: 'lake-njakajaure-lapporten'"));
  assert.ok(/difficulty: 'easy'/.test(lake.slice(0, 400)), 'lake detour has a difficulty');
});

// ── The route-wide birch Highlight offers no map action ──────────────────────

test('the route-wide birch Highlight has no View-on-map target', () => {
  const birch = data.slice(data.indexOf("id: 'abisko-birch-birdlife'"), data.indexOf("id: 'abisko-limestone-bluff'"));
  assert.ok(birch.includes("access: 'on-trail'"), 'still on-trail (a Highlight)');
  assert.ok(birch.includes("mapAvailability: 'unavailable'"), 'no map availability');
  assert.ok(!birch.includes('full-stage'), 'not a full-stage map target');
  assert.ok(!birch.includes('mapNote'), 'no leftover route-wide map note');
});

// ── Detour decision facts render as compact pills (Detours only) ─────────────

test('Detour decision facts are compact pills, built from available metadata', () => {
  // Pills exist for Detour cards…
  assert.ok(component.includes('className="dt-pill"'), 'detour cards render dt-pill chips');
  assert.ok(component.includes('className="dt-pills"'), 'a wrapping pill group');
  // …built only from factual decision metadata, each guarded so an unavailable
  // value is omitted (no empty placeholder pill).
  assert.ok(/if \(experience\.difficulty\) pills\.push/.test(component), 'difficulty pill is guarded');
  assert.ok(/experience\.roundTripKm != null/.test(component), 'distance pill is guarded');
  assert.ok(/experience\.detourDistanceKm != null/.test(component), 'detour-distance pill is guarded');
  assert.ok(/if \(experience\.addedTimeText\)/.test(component), 'time pill is guarded');
  assert.ok(component.includes('PLANNING_SHORT[experience.planningFit]'), 'commitment pill from planning fit');
  // The obsolete flat text line + dot separators are gone.
  assert.ok(!component.includes('dt-meta'), 'no obsolete dt-meta text line');
  assert.ok(!component.includes('dt-dot'), 'no obsolete dot separators');
  assert.ok(!component.includes('dt-diff'), 'no obsolete inline difficulty span');
});

test('Highlights stay pill-free and light', () => {
  // The Highlight row component must not adopt the Detour pill treatment.
  const start = component.indexOf('function HighlightRow');
  const end = component.indexOf('// ── Detours');
  assert.ok(start > -1 && end > start, 'HighlightRow region located');
  const highlightRow = component.slice(start, end);
  assert.ok(!highlightRow.includes('dt-pill'), 'HighlightRow renders no pills');
  assert.ok(!/pill/i.test(highlightRow), 'HighlightRow stays pill-free');
});

// ── No internal provenance terminology reaches the render layer ──────────────

const BANNED = [
  'owner-provided',
  'owner-researched',
  'source-verified',
  'spatially complete',
  'awaiting input',
  'awaiting-input',
  'map availability',
  'Map availability',
];

test('no internal provenance terminology in the render layer', () => {
  for (const phrase of BANNED) {
    assert.ok(!component.includes(phrase), `StageExperiences.tsx must not contain "${phrase}"`);
  }
  // The one copy leak that had reached a user-facing description field is gone.
  assert.ok(!data.includes('owner-researched'), 'no "owner-researched" in curated copy');
});
