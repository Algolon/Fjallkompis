/**
 * Settings screen: the surfaces that have been RETIRED from it, and the ones
 * that replaced them.
 *
 * Source-text contracts (matching the repo's other guard tests). Three
 * generations of removal are pinned here, oldest first, because each was a
 * deliberate product decision and each could plausibly creep back:
 *
 *   1. the beta-feedback phase (the "Report beta feedback" card, its Google
 *      Forms URL, the old diagnostics preview) — finished;
 *   2. the Trail readiness foldout and its N/4 score — removed in the v1
 *      UX finishing pass, NOT shrunk. It mixed delivery-mechanism
 *      diagnostics ("App installed", "App shell: Browser tab") into what
 *      read as trail preparation, it counted 4 checks under a list of 7, one
 *      row could never be satisfied ("GPS: Manual field test"), and on the
 *      Android build its basemap row could render "Included in app" and
 *      "Needs attention" at the same time. That implementation stays retired;
 *      the restored section below uses hiker facts from the same archive
 *      authority while Offline maps remains the single control surface;
 *   3. the Install foldout — meaningless in the Play-installed app, and
 *      duplicated by the Today install prompt.
 *
 * The diagnostic CAPABILITY was deliberately kept (a bug report needs it) but
 * de-emphasised: it lives inside Data sources as a non-full-width control,
 * not as a primary action under every setting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// ---- The accordion itself is unchanged and still accessible -----------------

test('the Settings accordion uses button + aria-expanded + aria-controls + a labelled region', () => {
  const accordion = settings.slice(settings.indexOf('function SettingsAccordion'));
  assert.match(accordion, /type="button"/);
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(accordion, /role="region"/);
  assert.match(accordion, /aria-labelledby=\{buttonId\}/);
});

// ---- Hiker-facing Trail Readiness restored ----------------------------------

test('Trail Readiness returns as preparation facts, not software diagnostics', () => {
  assert.match(settings, /title="Trail Readiness"/);
  assert.match(settings, /Default basemap/);
  assert.match(settings, /Terrain relief/);
  assert.match(settings, /Satellite/);
  assert.match(settings, /packingSummary\(state\.packing\)/);
});

test('the misleading readiness score and its rows stay gone', () => {
  assert.ok(!/readiness-score/.test(settings), 'the N/4 badge is removed');
  assert.ok(!/\{passed\}\/\{required\}/.test(settings), 'nothing renders a passed/required score');
  for (const row of ['App installed', 'App shell', 'Manual field test', 'Offline basemap']) {
    assert.ok(!settings.includes(row), `the "${row}" readiness row is gone`);
  }
});

test('its dead styling is removed with it', () => {
  for (const rule of ['.readiness-card', '.readiness-list', '.readiness-row', '.readiness-score']) {
    assert.ok(!css.includes(`${rule} {`), `${rule} is gone from the stylesheet`);
  }
});

test('the readiness deep link is removed end to end, not left dangling', () => {
  // It existed only to open the Trail readiness panel from a Today card that
  // no longer exists. Leaving the plumbing would be dead implementation
  // surface in the navigation payload type.
  assert.ok(!/SettingsDeepLinkSection/.test(settings), 'the deep-link type is gone');
  assert.ok(!/initialSection/.test(settings), 'and its prop with it');
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /return <SettingsScreen \/>;/, 'App renders Settings with no payload');
  const today = readFileSync(join(root, 'src/screens/TodayScreen.tsx'), 'utf8');
  assert.ok(
    !/settings\?: \{ section/.test(today),
    'NavPayload no longer carries a settings deep link',
  );
});

test('readiness reuses Offline maps state and links to its controls', () => {
  assert.match(settings, /title="Offline maps"/, 'the panel is still there');
  assert.match(settings, /mapReadinessStatus\(diagnostics\.basemap\)/);
  assert.match(settings, /mapReadinessStatus\(diagnostics\.terrain, true\)/);
  assert.match(settings, /mapReadinessStatus\(diagnostics\.satellite, true\)/);
  assert.match(settings, /Open Offline maps/);
  // One vocabulary for one state: the readiness rows used to say "Not stored"
  // for exactly what the Offline maps cards call "Not downloaded".
  assert.ok(!/Not stored/.test(settings), 'the competing "Not stored" wording is gone');
});

// ---- Install foldout retired ------------------------------------------------

test('the Install foldout is gone from Settings', () => {
  assert.ok(!/InstallCard/.test(settings), 'the embedded card is removed');
  assert.ok(!/title="Install"/.test(settings), 'no Install accordion remains');
  assert.ok(!/'install'/.test(settings), 'and its section id is gone from the union');
});

test('install guidance survives where it is still true: the Today prompt', () => {
  // Removing the Settings entry must not remove the ability to install a PWA;
  // PwaLifecycle owns that nudge and is untouched.
  const lifecycle = readFileSync(join(root, 'src/components/PwaLifecycle.tsx'), 'utf8');
  // Whitespace-tolerant: the copy is wrapped across source lines.
  assert.match(lifecycle, /Add to Home\s+Screen/, 'the browser-install guidance still exists');
});

// ---- Implementation vocabulary stays out of the user-facing screen ----------

test('delivery-mechanism vocabulary is not shown to users', () => {
  for (const phrase of ['App shell', 'Browser tab', 'beta testing', 'prototype']) {
    assert.ok(!settings.includes(phrase), `"${phrase}" is not in the Settings UI`);
  }
});

test('the version footer names the app and its version, nothing else', () => {
  assert.match(settings, /Fjallkompis · v\{APP_VERSION\}/, 'no "prototype" qualifier');
});

// ---- Beta feedback retired --------------------------------------------------

test('the "Report beta feedback" entry is gone from Settings', () => {
  assert.ok(!/Report beta feedback/.test(settings), 'no feedback button label');
  assert.ok(!/BetaFeedbackCard/.test(settings), 'the card component is removed, not hidden');
  assert.ok(!/Beta testing/.test(settings), 'no orphaned "Beta testing" heading');
});

test('the external form URL and its constant are fully removed', () => {
  assert.ok(!/BETA_FORM_URL/.test(settings), 'dead constant removed');
  assert.ok(!/docs\.google\.com\/forms/.test(settings), 'no Google Forms URL anywhere in Settings');
});

test('no empty section or dead styling remains after the removals', () => {
  assert.ok(!/\.beta-card\s*\{/.test(css), 'the .beta-card rule is gone');
  assert.ok(!/ExternalLink/.test(settings), 'the icon existed only for the feedback link');
  // Route direction now hands over directly to the accordion grid.
  assert.match(
    settings,
    /<\/SettingsAccordion>\s*<div className="settings-grid settings-grid--accordions">/,
    'Route direction is immediately followed by the accordion grid',
  );
});

// ---- Diagnostics: kept, but de-emphasised -----------------------------------

test('the retired "Copy safe diagnostics" control stays absent as such', () => {
  // The BETA-era control (and its prop plumbing) stays gone. The vNext
  // mobile pilot later added a deliberately minimal whitelisted-fields
  // helper — guarded by tests/diagnostic-summary.test.mjs — whose clipboard
  // write is the ONLY one Settings may make.
  assert.ok(!/Copy safe diagnostics/.test(settings));
  assert.ok(!/onCopyDiagnostics/.test(settings), 'no diagnostics-copy prop remains');
  const clipboardUses = settings.match(/navigator\.clipboard/g) ?? [];
  assert.equal(clipboardUses.length, 1, 'exactly the pilot summary copy');
  assert.match(settings, /buildDiagnosticSummary\(/, 'and it uses the whitelisted builder');
});

test('the diagnostics control is a low-prominence action inside Data sources', () => {
  const sources = settings.slice(
    settings.indexOf('title="Data sources"'),
    settings.indexOf('title="Privacy"'),
  );
  assert.match(sources, /doCopyDiagnostics/, 'it lives in the Data sources panel');
  assert.ok(
    !/btn-ghost btn-block/.test(settings),
    'it is no longer a full-width action under every setting',
  );
  // It must also not have become a primary action in its new home.
  assert.ok(
    !/btn-primary[^>]*doCopyDiagnostics/.test(sources),
    'and it is not the panel primary',
  );
});

test('the diagnostics summary still reports the offline asset states', () => {
  // De-emphasising the control must not quietly narrow what a bug report
  // carries. The hook that feeds it reads the same archive statuses the
  // Offline maps cards render.
  const hook = readFileSync(join(root, 'src/hooks/useOfflineDiagnostics.ts'), 'utf8');
  for (const call of [
    'useServiceWorkerControlled()',
    'useCombinedArchiveStatus([VECTOR_ARCHIVE])',
  ]) {
    assert.ok(hook.includes(call), `diagnostics still reads ${call}`);
  }
  for (const field of ['offlineBasemap', 'terrain', 'satellite', 'serviceWorker', 'storage']) {
    assert.ok(settings.includes(`${field}:`), `the summary still reports ${field}`);
  }
});

test('the "Show safe diagnostics preview" control is absent', () => {
  assert.ok(!/Show safe diagnostics preview/.test(settings));
  assert.ok(!/diagnostics-preview/.test(settings), 'preview markup removed');
  assert.ok(!/diagnostics-preview/.test(css), 'preview styles removed');
});

test('diagnostics generation logic and its dead imports are removed', () => {
  assert.ok(!/beta diagnostics/i.test(settings), 'no diagnostics string builder');
  assert.ok(!/\bClipboard\b/.test(settings), 'unused Clipboard icon import removed');
  assert.ok(!/useOnlineStatus/.test(settings), 'unused online hook removed');
  assert.ok(!/\buseMemo\b/.test(settings), 'unused useMemo import removed');
});
