/**
 * Settings hierarchy after integrating PR #53 (Trail-readiness foldout +
 * simplified beta feedback) with the route-direction feature.
 *
 * Source-text contracts (matching the repo's other Settings guard tests). They
 * pin the follow-up decisions: Route direction is the FIRST, default-open
 * section; the eyebrow/intro were rewritten; the old standalone foldout note
 * was removed; and the PR #53 behaviours (readiness foldout collapsed by
 * default, Google Forms button, diagnostics gone) are preserved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// The render body only (component definitions come earlier in the file).
const render = settings.slice(settings.indexOf('export function SettingsScreen'));

// ---- Route direction is first and the sole open section ---------------------

test('Route direction is the first configurable section, before Trail readiness', () => {
  const iDir = render.indexOf('id="direction"');
  const iReady = render.indexOf('<TrailReadinessCard');
  const iBeta = render.indexOf('<BetaFeedbackCard');
  const iGrid = render.indexOf('settings-grid--accordions');
  assert.ok(iDir > 0, 'Route direction accordion is rendered');
  assert.ok(iDir < iReady, 'Route direction renders before Trail readiness');
  assert.ok(iReady < iBeta, 'Trail readiness renders before Beta feedback');
  assert.ok(iBeta < iGrid, 'Beta feedback renders before the grouped foldouts');
});

test('Route direction lives in the accordion/card system and is not duplicated', () => {
  assert.match(render, /<SettingsAccordion\s+id="direction"/);
  assert.match(render, /title="Route direction"/);
  const dirAccordions = (settings.match(/id="direction"/g) ?? []).length;
  assert.equal(dirAccordions, 1, 'exactly one Route direction accordion');
  // It contains the accessible radio group control.
  assert.match(render, /<RouteDirectionCard \/>/);
});

test('exactly one section is open on load: Route direction', () => {
  assert.match(settings, /const \[directionOpen, setDirectionOpen\] = useState\(true\)/);
  assert.match(settings, /const \[readinessOpen, setReadinessOpen\] = useState\(false\)/);
  assert.match(
    settings,
    /const \[openSection, setOpenSection\] = useState<SettingsSection \| null>\(null\)/,
    'the grouped foldouts start collapsed so only Route direction is open',
  );
  assert.match(render, /open=\{directionOpen\}/);
});

test('accordion open states stay independent and predictable', () => {
  // Route direction and Trail readiness each own their boolean; the grid uses a
  // single-open group. Toggling one never implicitly opens another.
  assert.match(render, /onToggle=\{\(\) => setDirectionOpen\(\(current\) => !current\)\}/);
  assert.match(render, /onToggle=\{\(\) => setReadinessOpen\(\(current\) => !current\)\}/);
  assert.match(render, /onToggle=\{\(\) => toggleSection\('install'\)\}/);
});

// ---- Header eyebrow + introductory copy -------------------------------------

test('the eyebrow is exactly "Trail readiness" (renders TRAIL READINESS, uppercased)', () => {
  assert.match(settings, /eyebrow="Trail readiness"/);
  assert.ok(!/Beta trust/i.test(settings), 'the old "Beta trust" framing is gone');
});

test('the new introductory copy explains Settings and carries the interaction cue', () => {
  assert.match(
    settings,
    /Adjust app settings to tailor Fjällkompis to your trip and how you use\s+it\. Tap a section to expand its options\./,
  );
  // The old beta/offline-only intro is gone.
  assert.ok(
    !/Check whether this device is ready for offline testing/.test(settings),
    'old offline-testing intro removed',
  );
});

test('the interaction cue appears exactly once, in the header intro', () => {
  const cues = (settings.match(/section to expand its options/gi) ?? []).length;
  assert.equal(cues, 1, 'the "expand its options" cue is not repeated further down');
});

// ---- The intermediate explanatory block is removed --------------------------

test('the standalone foldout-note block and its orphaned CSS are gone', () => {
  assert.ok(!/settings-foldout-note/.test(settings), 'note element removed from the screen');
  assert.ok(!/settings-foldout-note/.test(css), 'orphaned .settings-foldout-note CSS removed');
  assert.ok(
    !/stay visible above/.test(settings),
    'no "readiness/feedback stay visible above" copy remains',
  );
});

// ---- Simplifications: Advanced block and readiness manual-note removed -------

test('the Advanced accordion and its version/manual-check block are gone', () => {
  assert.ok(!/id="advanced"/.test(settings), 'Advanced accordion removed');
  assert.ok(!/Advanced status/.test(settings), 'Advanced status heading removed');
  assert.ok(!/Manual checks/.test(settings), 'Manual checks row removed');
  assert.ok(
    !/Airplane mode · sunlight · gloves/.test(settings),
    'the manual-check value string is gone',
  );
  // 'advanced' is dropped from the section union (no dead section id).
  assert.ok(
    !/'advanced'/.test(settings),
    "the 'advanced' SettingsSection member is removed",
  );
  // The app version now appears only in the footer, not a second time.
  const versionUses = (settings.match(/\{APP_VERSION\}/g) ?? []).length;
  assert.equal(versionUses, 1, 'APP_VERSION rendered once (the footer only)');
});

test('the Trail-readiness manual-reminder note and its CSS are removed', () => {
  assert.ok(!/readiness-note/.test(settings), 'note element removed from the screen');
  assert.ok(!/\.readiness-note\s*\{/.test(css), 'orphaned .readiness-note CSS removed');
  assert.ok(
    !/still need a real device/.test(settings),
    'the manual-reminder copy is gone (the score conveys the status)',
  );
});

// ---- PR #53 behaviours preserved through the reorder ------------------------

test('Trail readiness stays a foldout: accordion, collapsed by default, score in header', () => {
  assert.match(settings, /<SettingsAccordion[\s\S]*?title="Trail readiness"[\s\S]*?aside=\{score\}/);
  assert.match(settings, /const \[readinessOpen, setReadinessOpen\] = useState\(false\)/);
  assert.match(settings, /const score = \(\s*<span className="readiness-score">/);
});

test('beta feedback keeps the Google Forms button and GitHub route, diagnostics gone', () => {
  assert.match(settings, /href=\{BETA_FORM_URL\}/);
  assert.match(settings, /docs\.google\.com\/forms/);
  assert.match(settings, /issues\/new\?template=beta-feedback\.yml/);
  assert.ok(!/Copy safe diagnostics/.test(settings), 'no Copy safe diagnostics control');
  assert.ok(!/Show safe diagnostics preview/.test(settings), 'no diagnostics preview control');
  assert.ok(!/navigator\.clipboard/.test(settings), 'no clipboard handler');
});
