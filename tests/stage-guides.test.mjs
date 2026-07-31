/**
 * Stage day-guide integrity (src/data/stageGuides.mjs) and the Stages screen
 * interaction contract.
 *
 * Content: every GPX stage has a guide; every guide is structured (overview,
 * terrain, 2–4 highlights), cites resolvable sources and carries a valid
 * lastVerified date — the guides stay auditable, hedged editorial content,
 * never a substitute for the GPX-derived statistics.
 *
 * Screen: the repo has no DOM test runner, so the accessibility/interaction
 * requirements are pinned as a source contract on StagesScreen.tsx — real
 * <button> disclosure with aria-expanded/aria-controls and stable panel ids,
 * a top-right "Set as current" pill, a non-interactive "Current" status
 * pill, and no whole-card click target.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { GUIDE_SOURCES, STAGE_GUIDES } from '../src/data/stageGuides.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test('every GPX stage has a day guide, and no guide is orphaned', () => {
  const stageIds = route.stages.map((s) => s.id);
  assert.equal(stageIds.length, 7, 'route is seven stages');
  for (const id of stageIds) {
    assert.ok(STAGE_GUIDES[id], `stage ${id} has a guide`);
  }
  for (const id of Object.keys(STAGE_GUIDES)) {
    assert.ok(stageIds.includes(id), `guide ${id} matches a real stage`);
  }
});

test('every guide is structured, compact and complete', () => {
  for (const [id, g] of Object.entries(STAGE_GUIDES)) {
    assert.ok(typeof g.overview === 'string' && g.overview.length > 40, `${id} overview`);
    assert.ok(typeof g.terrain === 'string' && g.terrain.length > 20, `${id} terrain`);
    // The day guide is narrative only — the Highlights list has moved to the
    // Highlights & detours layer, so a guide must NOT carry one.
    assert.equal(g.highlights, undefined, `${id} carries no guide Highlights list`);
    if (g.watchFor !== undefined) {
      assert.ok(Array.isArray(g.watchFor) && g.watchFor.length > 0, `${id} watchFor`);
      for (const w of g.watchFor) {
        assert.ok(typeof w === 'string' && w.trim().length > 0, `${id} watchFor entry`);
      }
    }
  }
});

test('every guide cites resolvable sources and a valid verification date', () => {
  for (const [id, g] of Object.entries(STAGE_GUIDES)) {
    assert.ok(Array.isArray(g.sourceIds) && g.sourceIds.length > 0, `${id} has sources`);
    for (const sid of g.sourceIds) {
      assert.ok(GUIDE_SOURCES[sid], `${id} source "${sid}" is defined`);
    }
    assert.match(g.lastVerified, ISO_DATE, `${id} lastVerified is an ISO date`);
    assert.ok(
      !Number.isNaN(new Date(`${g.lastVerified}T00:00:00Z`).getTime()),
      `${id} lastVerified parses`,
    );
  }
});

test('every registered source is used, labelled and linked over https', () => {
  const used = new Set(Object.values(STAGE_GUIDES).flatMap((g) => g.sourceIds));
  for (const [sid, src] of Object.entries(GUIDE_SOURCES)) {
    assert.ok(used.has(sid), `source "${sid}" is referenced by at least one guide`);
    assert.ok(typeof src.label === 'string' && src.label.length > 0, `${sid} label`);
    assert.match(src.url, /^https:\/\//, `${sid} url is https`);
  }
});

test('GPX statistics remain the only distance/elevation source for stages', () => {
  // The stages model must keep deriving statistics from the generated route
  // data — editorial modules must never carry their own figures for them.
  const stagesTs = readFileSync(join(root, 'src/data/stages.ts'), 'utf8');
  assert.match(stagesTs, /ROUTE\.stages\.map/, 'stages derive from generated route');
  assert.match(stagesTs, /s\.statistics\.distanceKm/, 'distance comes from GPX statistics');
  assert.match(stagesTs, /s\.statistics\.totalAscentM/, 'ascent comes from GPX statistics');
});

// ---- Stages screen interaction contract ------------------------------------

const screen = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');

test('the day guide is a semantic disclosure with wired ARIA state', () => {
  assert.match(screen, /className="stage-guide__toggle"/);
  // The toggle is a real button and never submits anything.
  assert.match(screen, /type="button"\s+className="stage-guide__toggle"/);
  assert.match(screen, /aria-expanded=\{guideOpen\}/);
  assert.match(screen, /aria-controls=\{guidePanelId\}/);
  // Stable unique panel id per stage.
  assert.match(screen, /`stage-guide-\$\{stage\.id\}`/);
  // Guides render collapsed by default; the ONLY exception is Today's
  // Stage Guide deep link, which seeds exactly that stage as open.
  assert.match(
    screen,
    /useState<ReadonlySet<string>>\(\s*\(\) => new Set<string>\(initialGuideStageId \? \[initialGuideStageId\] : \[\]\)/,
  );
});

test('set-current is a top-right pill; the current stage shows a status pill', () => {
  assert.match(screen, /className="stage-set-pill"/);
  assert.match(screen, />\s*Set as current\s*</);
  // Current stage: non-interactive status pill, not a disabled button.
  assert.match(screen, /<span className="pill pill-current">\s*<span className="dot" \/> Current/);
  assert.ok(!screen.includes('Set as current stage'), 'old bottom button label is gone');
  assert.ok(!screen.includes('disabled={isCurrent}'), 'no disabled button pretending to be actionable');
});

test('the two interactions stay independent — no whole-card click target', () => {
  // The card is an <article>; only the set-pill and the guide toggle handle
  // clicks, so expanding a guide can never set the stage or vice versa.
  assert.match(screen, /<article\s+className=\{`card stage-card/);
  const setHandlers = screen.match(/onClick=\{\(\) => requestSetCurrent\(stage\.id\)\}/g) ?? [];
  assert.equal(setHandlers.length, 1, 'exactly one set-as-current click target per card');
  const toggleHandlers = screen.match(/onClick=\{\(\) => toggleGuide\(stage\.id\)\}/g) ?? [];
  assert.equal(toggleHandlers.length, 1, 'exactly one guide toggle per card');
});

// ---- Set as current: planned occurrences ------------------------------------
//
// A v10 Day plan may walk one stage on several days (or twice on one).
// Selecting by stage id alone would then be a guess, so ambiguity opens a
// chooser and NO pointer moves until the user picks; zero or one occurrence
// goes straight through the store rule. The first occurrence is never
// assumed.

test('an ambiguous stage opens the occurrence chooser instead of selecting', () => {
  assert.match(screen, /const requestSetCurrent = \(stageId: string\) => \{/);
  assert.match(screen, /if \(occurrencesOf\(stageId\)\.length > 1\) \{/);
  assert.match(screen, /setChoosingStageId\(stageId\);\s*\n\s*return;/);
  assert.match(screen, /setCurrentStage\(stageId\);/, 'zero/one falls through to the store rule');
  // The chooser mounts only while a stage is being disambiguated.
  assert.match(screen, /\{choosingStage \? \(\s*\n\s*<OccurrenceChooserSheet/);
});

test('each occurrence option states day, date, oriented route, reverse and current', () => {
  const chooser = screen.slice(screen.indexOf('function OccurrenceChooserSheet('));
  assert.match(chooser, /Day \{day\.number\}/);
  assert.match(chooser, /formatDateFieldLabel\(day\.date\)/);
  assert.match(chooser, /leg\.stage\.fromHutId/);
  assert.match(chooser, /leg\.stage\.toHutId/);
  assert.match(chooser, /walks the section in reverse/);
  assert.match(chooser, /leg\.orientation !== natural/);
  assert.match(chooser, /aria-current=\{leg\.isCurrent \? 'true' : undefined\}/);
  assert.match(chooser, /Currently selected/);
});

test('choosing selects the occurrence atomically; cancelling changes nothing', () => {
  const chooser = screen.slice(screen.indexOf('function OccurrenceChooserSheet('));
  // The ONLY pointer write is the occurrence-specific store action.
  assert.match(chooser, /setCurrentLeg\(day\.id, leg\.id\);/);
  assert.ok(!/setCurrentStage\(/.test(chooser), 'the chooser never falls back to a stage-id write');
  // Cancel / backdrop / Escape only close the sheet.
  assert.match(chooser, /Cancel/);
  assert.match(chooser, /onClose=\{onClose\}/);
  assert.ok(!/setState|currentStageId/.test(chooser), 'no other write path exists');
});
