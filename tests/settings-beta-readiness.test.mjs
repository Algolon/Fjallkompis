/**
 * Settings screen: Trail-readiness foldout + simplified beta feedback.
 *
 * Source-text contracts (matching the repo's other guard tests). They pin:
 *   - Trail readiness is an accessible accordion, collapsed by default, with a
 *     live score in the collapsed header;
 *   - the beta section exposes only the Google Forms button and the GitHub
 *     button, and the diagnostics feature is gone (not merely hidden);
 *   - the readiness rows sit symmetrically inside the card (no leaked
 *     left-indent from the old Today `.readiness-list` collision).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const BETA_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdKmFYZ4uRrfcqc5dPlF1VgxFcggMjtFVl8WQyLtebGokUllg/viewform';

// ---- Trail readiness foldout ------------------------------------------------

test('Trail readiness renders through the accordion, not a plain always-open card', () => {
  const trail = settings.slice(settings.indexOf('function TrailReadinessCard'));
  assert.match(
    trail,
    /<SettingsAccordion[\s\S]*title="Trail readiness"/,
    'Trail readiness is built on SettingsAccordion',
  );
});

test('the readiness accordion uses button + aria-expanded + aria-controls + a labelled region', () => {
  const accordion = settings.slice(settings.indexOf('function SettingsAccordion'));
  assert.match(accordion, /type="button"/);
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(accordion, /role="region"/);
  assert.match(accordion, /aria-labelledby=\{buttonId\}/);
});

test('Trail readiness is collapsed by default (unless deep-linked)', () => {
  // Plain tab navigation carries no payload (initialSection defaults to
  // null), so the accordion still starts collapsed; only the one-shot
  // Today-Prepare deep link opens it on arrival.
  assert.match(
    settings,
    /const \[readinessOpen, setReadinessOpen\] = useState\(initialSection === 'readiness'\)/,
    'readiness open state derives only from the one-shot deep link',
  );
  assert.match(
    settings,
    /initialSection = null/,
    'without a payload the deep-link target defaults to null (collapsed)',
  );
  assert.match(
    settings,
    /<TrailReadinessCard[\s\S]*?open=\{readinessOpen\}/,
    'the card open state is bound to readinessOpen',
  );
});

test('the readiness score sits in the collapsed header, so it stays visible while collapsed', () => {
  const trail = settings.slice(
    settings.indexOf('function TrailReadinessCard'),
    settings.indexOf('function SettingsAccordion'),
  );
  // The score node is computed from the live checks and handed to the header
  // via `aside` — outside the accordion's children (which only render when open).
  assert.match(trail, /const score = \(\s*<span className="readiness-score">/);
  assert.match(trail, /<strong>\{passed\}\/\{required\}<\/strong>/);
  assert.match(trail, /aside=\{score\}/);
  // and the score markup is NOT duplicated inside the panel body.
  const asideIdx = trail.indexOf('aside={score}');
  assert.equal(
    trail.slice(asideIdx).indexOf('readiness-score'),
    -1,
    'the score class appears once (header only), not duplicated in the panel',
  );
});

test('live readiness checks are preserved (shared hook, one aggregate)', () => {
  // The criteria/scoring moved to the shared useTrailReadiness hook so the
  // Today Prepare card and Settings can never disagree; the card must read
  // that hook, and the hook must still run the live checks.
  const trail = settings.slice(settings.indexOf('function TrailReadinessCard'));
  assert.ok(trail.includes('useTrailReadiness()'), 'the card reads the shared aggregate');
  const hookSource = readFileSync(
    join(root, 'src/hooks/useTrailReadiness.ts'),
    'utf8',
  );
  for (const hook of [
    'useInstallPrompt()',
    'useServiceWorkerControlled()',
    'useCombinedArchiveStatus([VECTOR_ARCHIVE])',
  ]) {
    assert.ok(hookSource.includes(hook), `readiness still runs ${hook}`);
  }
  assert.match(hookSource, /const passed = requiredChecks\.filter\(Boolean\)\.length/);
});

test('page copy no longer claims Trail readiness stays visible/expanded', () => {
  assert.ok(
    !/Trail readiness and beta feedback stay visible/.test(settings),
    'old "stay visible" copy is gone',
  );
});

// ---- Readiness-row symmetric spacing ---------------------------------------

test('the leaked Today `.readiness-list` rule (padding-left: 20px) is gone', () => {
  const rules = css.match(/\.readiness-list\s*\{/g) ?? [];
  assert.equal(rules.length, 1, 'exactly one .readiness-list rule remains');
  assert.ok(
    !/\.readiness-list\s*\{[^}]*padding-left:\s*20px/.test(css),
    'no .readiness-list rule injects a left-only indent',
  );
});

test('the Settings readiness list carries no asymmetric horizontal indent', () => {
  const block = css.slice(css.indexOf('.readiness-list {'), css.indexOf('}', css.indexOf('.readiness-list {')));
  assert.ok(!/padding-left/.test(block), 'no one-sided left padding');
  assert.match(block, /padding:\s*0/, 'list padding is reset to zero on both sides');
});

// ---- Google Forms feedback button ------------------------------------------

test('BETA_FORM_URL is the exact requested Google Forms URL', () => {
  assert.ok(
    settings.includes(`'${BETA_FORM_URL}'`),
    'BETA_FORM_URL constant holds the exact form URL',
  );
});

test('the primary beta button is a full-width new-tab link to the form', () => {
  const beta = settings.slice(settings.indexOf('function BetaFeedbackCard'));
  assert.match(
    beta,
    /className="btn btn-primary btn-block"[\s\S]*?href=\{BETA_FORM_URL\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"[\s\S]*?Report beta feedback/,
    'full-width primary button opens the form safely in a new tab',
  );
});

test('the placeholder "waiting on the final Google Forms URL" warning is gone', () => {
  assert.ok(!/waiting on the final Google Forms URL/.test(settings));
  assert.ok(!/beta-card__pending/.test(settings), 'placeholder warning markup removed');
  assert.ok(!/beta-card__pending/.test(css), 'placeholder warning style removed');
});

test('the GitHub feedback route is retired — the form is the only entry point', () => {
  const beta = settings.slice(settings.indexOf('function BetaFeedbackCard'));
  assert.ok(!/issues\/new\?template=beta-feedback\.yml/.test(beta), 'no GitHub issue link');
  assert.ok(!/GitHub feedback/.test(beta), 'no GitHub feedback button');
  // Exactly one feedback link remains in the card (the no-login form).
  const links = (beta.match(/<a\b/g) ?? []).length;
  assert.equal(links, 1, 'a single feedback entry point in Beta testing');
});

// ---- Diagnostics removed (not hidden) --------------------------------------

test('the "Copy safe diagnostics" control is absent', () => {
  assert.ok(!/Copy safe diagnostics/.test(settings));
  assert.ok(!/onCopyDiagnostics/.test(settings), 'no diagnostics-copy prop remains');
  assert.ok(!/navigator\.clipboard/.test(settings), 'clipboard handler removed');
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

test('the beta description no longer claims safe diagnostics are included', () => {
  const beta = settings.slice(settings.indexOf('function BetaFeedbackCard'), settings.indexOf('function SettingsScreen'));
  assert.ok(!/diagnostics/i.test(beta), 'description drops the diagnostics claim');
  assert.match(beta, /no-login feedback form opens in your browser/);
});
