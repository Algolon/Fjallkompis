/**
 * Settings hierarchy.
 *
 * Source-text contracts (matching the repo's other Settings guard tests).
 * They pin: Route direction is the FIRST section and, like every other, is
 * collapsed on load; the header eyebrow and intro; and that the retired
 * beta-era surfaces stay retired.
 *
 * The Trail-readiness and Install foldouts that used to sit here were removed
 * in the v1 UX finishing pass — tests/settings-beta-readiness.test.mjs owns
 * the contracts for their removal.
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

test('Route direction is the first configurable section', () => {
  const iDir = render.indexOf('id="direction"');
  const iGrid = render.indexOf('settings-grid--accordions');
  assert.ok(iDir > 0, 'Route direction accordion is rendered');
  // Trail readiness and Beta feedback used to sit between the two; Route
  // direction now hands over directly to the grouped foldouts.
  assert.ok(iDir < iGrid, 'Route direction renders before the grouped foldouts');
});

test('Route direction lives in the accordion/card system and is not duplicated', () => {
  assert.match(render, /<SettingsAccordion\s+id="direction"/);
  assert.match(render, /title="Route direction"/);
  const dirAccordions = (settings.match(/id="direction"/g) ?? []).length;
  assert.equal(dirAccordions, 1, 'exactly one Route direction accordion');
  // It contains the accessible radio group control.
  assert.match(render, /<RouteDirectionCard \/>/);
});

test('every section starts collapsed on load, Route direction included', () => {
  // Route direction is collapsed by default like the rest — no default-open,
  // visually dominant section.
  assert.match(settings, /const \[directionOpen, setDirectionOpen\] = useState\(false\)/);
  assert.match(
    settings,
    /const \[openSection, setOpenSection\] = useState<SettingsSection \| null>\(null\)/,
    'the grouped foldouts start collapsed too',
  );
  assert.match(render, /open=\{directionOpen\}/);
});

test('the collapsed Route direction summary shows the current direction', () => {
  // Its selected direction stays visible without expanding, via the shared
  // accordion summary (no special-case accordion logic).
  assert.match(
    render,
    /summary=\{`Walking \$\{directionLabel\(routeDirection\)\}`\}/,
    'summary renders the active direction label',
  );
  // The screen destructures the active direction from the store (the Day
  // plan summary moved to Plan with the plan itself — vNext).
  assert.match(settings, /routeDirection \} = useStore\(\)/);
});

test('accordion open states stay independent and predictable', () => {
  // Route direction owns its own boolean; the grid uses a single-open group.
  // Toggling one never implicitly opens another.
  assert.match(render, /onToggle=\{\(\) => setDirectionOpen\(\(current\) => !current\)\}/);
  assert.match(render, /onToggle=\{\(\) => toggleSection\('maps'\)\}/);
});

// ---- Header eyebrow + introductory copy -------------------------------------

test('the eyebrow names what the screen is about, not one of its sections', () => {
  // It used to read "Trail readiness" — the name of a section BELOW it, which
  // also made the screen look like a readiness dashboard. Every other tab's
  // eyebrow names the tab's subject; Settings' subject is this device.
  assert.match(settings, /eyebrow="This device"/);
  assert.ok(!/Beta trust/i.test(settings), 'the old "Beta trust" framing is gone');
});

test('the introductory copy says what is in Settings, without teaching the UI', () => {
  assert.match(
    settings,
    /Route direction, offline maps, backups and what Fjallkompis stores on\s+this device\./,
  );
  // The old beta/offline-only intro is gone.
  assert.ok(
    !/Check whether this device is ready for offline testing/.test(settings),
    'old offline-testing intro removed',
  );
  // "Tap a section to expand its options" instructed the user in how to
  // operate a visible, chevroned accordion.
  assert.ok(
    !/section to expand its options/i.test(settings),
    'the interaction cue is gone — the chevrons carry it',
  );
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

test('the beta feedback entry is retired entirely — no form or GitHub route', () => {
  assert.ok(!/BETA_FORM_URL/.test(settings), 'form URL constant removed');
  assert.ok(!/docs\.google\.com\/forms/.test(settings), 'no Google Forms URL');
  assert.ok(!/issues\/new\?template=beta-feedback\.yml/.test(settings), 'GitHub feedback link removed');
  assert.ok(!/GitHub feedback/.test(settings), 'GitHub feedback label removed');
  assert.ok(!/REPOSITORY_URL/.test(settings), 'now-unused REPOSITORY_URL import removed');
  assert.ok(!/Copy safe diagnostics/.test(settings), 'no Copy safe diagnostics control');
  assert.ok(!/Show safe diagnostics preview/.test(settings), 'no diagnostics preview control');
  // The vNext pilot's minimal "Copy diagnostic summary" is a separate,
  // deliberate helper (tests/diagnostic-summary.test.mjs pins its privacy
  // contract); the beta-era preview/report machinery stays gone.
  const clipboardUses = settings.match(/navigator\.clipboard/g) ?? [];
  assert.equal(clipboardUses.length, 1, 'only the pilot summary copies');
});
