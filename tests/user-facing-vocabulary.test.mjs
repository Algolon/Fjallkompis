/**
 * Implementation vocabulary must not reach the user-facing UI.
 *
 * The v1 UX finishing pass removed a set of strings that described how the
 * app is BUILT rather than what the trail is like: a footer calling the
 * product a prototype, a Settings panel describing itself as checks "for beta
 * testing", rows reading "App shell: Browser tab", a Guide footer stamping
 * "Content version 1", a day-plan toggle explaining "the generic seven-stage
 * journey", a sheet heading announcing "Route legs — walked in this exact
 * order", and a Stages intro that both named a file format and taught the
 * user to "use the pill in a stage's corner".
 *
 * Each of those had a legitimate origin, and each would be easy to
 * reintroduce by copying a neighbouring line. This is the fence.
 *
 * SCOPE. Screens and components only — the surfaces a hiker reads. It
 * deliberately does NOT cover:
 *   - code comments (removed before matching), which SHOULD explain history;
 *   - docs/, ROADMAP, CHANGELOG;
 *   - diagnostic and source surfaces, where technical facts are the point:
 *     utils/diagnosticSummary.mjs still prints a Content version line, and
 *     the credits sheet still names its sources. Nothing here removes real
 *     technical information from the places built to carry it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every screen + component source, with comments stripped. */
function userFacingSources() {
  const dirs = ['src/screens', 'src/components'];
  const out = [];
  for (const dir of dirs) {
    for (const name of readdirSync(join(root, dir))) {
      if (!name.endsWith('.tsx')) continue;
      const raw = readFileSync(join(root, dir, name), 'utf8');
      const code = raw
        // Block comments (including the {/* … */} JSX form) and line comments.
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      out.push([`${dir}/${name}`, code]);
    }
  }
  return out;
}

const SOURCES = userFacingSources();

/** Phrases that must never appear in a screen or component's rendered copy. */
const BANNED = [
  ['prototype', 'the product does not describe itself as a prototype'],
  ['beta testing', 'the beta programme is not a user-facing concept'],
  ['App shell', 'delivery mechanism, not trail readiness'],
  ['Browser tab', 'delivery mechanism, not a status a hiker acts on'],
  ['Manual field test', 'a check that could never be satisfied'],
  ['Content version', 'edition metadata belongs in Data sources'],
  ['generic seven-stage journey', 'the app’s data model, described to the user'],
  ['walked in this exact order', 'a numbered list does not need this asserted'],
  ['Not stored', 'one vocabulary for one state: "Not downloaded"'],
];

test('no implementation vocabulary reaches a screen or component', () => {
  const found = [];
  for (const [file, code] of SOURCES) {
    for (const [phrase, why] of BANNED) {
      if (code.includes(phrase)) found.push(`${file}: "${phrase}" — ${why}`);
    }
  }
  assert.deepEqual(found, [], `implementation vocabulary in user-facing copy:\n${found.join('\n')}`);
});

test('the UI does not instruct the user in its own design-system nouns', () => {
  // "Use the pill in a stage's corner to set the stage you're walking."
  // If a control needs a paragraph above the fold to be findable, the fix is
  // the control. (The word "pill" is fine in class names and comments — this
  // matches only prose telling the user to use one.)
  for (const [file, code] of SOURCES) {
    assert.ok(
      !/(the|a) pill (in|on|at|beside)/i.test(code),
      `${file} explains a UI primitive to the user`,
    );
  }
});

test('technical facts survive where they belong', () => {
  // The counterpart to the fence: this pass de-emphasised diagnostics, it did
  // not delete them. If these ever fail, information was lost rather than
  // relocated.
  const diagnostics = readFileSync(join(root, 'src/utils/diagnosticSummary.mjs'), 'utf8');
  assert.match(diagnostics, /\['content', 'Content version'\]/);
  assert.match(diagnostics, /\['serviceWorker', 'Service worker'\]/);
  const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  assert.match(settings, /doCopyDiagnostics/, 'the report can still be copied');
  assert.match(settings, /View sources and licences/, 'sources are still reachable');
});
