/**
 * Date/time picker policy (owner decision, 2026-07-23 — supersedes the
 * 2026-07-23 morning keep-native policy from PR #68).
 *
 * PR #68 root-caused the Android popup overflow (the time dialog's
 * Wissen | Annuleren | Instellen action row running past the screen edge)
 * as an OS/browser-dialog layout bug that page CSS cannot reach, and shipped
 * `color-scheme: light` as the only safe lever while keeping the fields
 * native. This branch is the deliberate next step the owner commissioned:
 * an APP-OWNED picker system (DateField calendar dialog + TimeField digital
 * 24-hour dialog) piloted on the transport fields — the ones the broken
 * popup hit hardest. The new policy:
 *
 *   1. transport date/departure/arrival use the app-owned DateField and
 *      TimeField dialogs — self-rendered, so the broken OS action row is
 *      out of the loop entirely;
 *   2. stay check-in/check-out and the Documents date stay NATIVE until the
 *      pilot passes the owner's real-device check (the native path also
 *      remains the proven fallback shape in code);
 *   3. `color-scheme: light` (page + meta) stays — it still governs the
 *      remaining native pickers and every other UA surface;
 *   4. still no third-party picker library, and no styling of native popup
 *      internals — the custom dialogs are fully page-rendered instead;
 *   5. stored values remain exactly 'YYYY-MM-DD' / 'HH:mm' — no schema
 *      change rides this feature.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const tripSheet = readFileSync(join(root, 'src/components/TripItemSheet.tsx'), 'utf8');
const walletSheet = readFileSync(join(root, 'src/components/WalletEditorSheet.tsx'), 'utf8');

test('the app declares a light color-scheme for UA surfaces (meta + CSS)', () => {
  assert.match(indexHtml, /<meta name="color-scheme" content="light" \/>/);
  assert.match(css, /:root \{[^}]*color-scheme: light/, ':root carries the same declaration');
});

test('transport fields use the app-owned pickers; stay and wallet stay native', () => {
  assert.match(tripSheet, /<DateField\b/, 'transport date uses DateField');
  assert.equal((tripSheet.match(/<TimeField\b/g) ?? []).length, 2, 'departure + arrival use TimeField');
  // Native inputs remaining: exactly the two stay dates, zero time inputs.
  assert.equal((tripSheet.match(/type="date"/g) ?? []).length, 2, 'stay check-in/check-out stay native for now');
  assert.equal((tripSheet.match(/type="time"/g) ?? []).length, 0, 'no native time inputs remain');
  assert.match(walletSheet, /type="date"/, 'wallet document date stays native for now');
});

test('no third-party picker library — the pickers are app-owned components', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const d of deps) {
    assert.ok(!/datepicker|day-picker|flatpickr|timepicker/i.test(d), `no picker dependency (${d})`);
  }
});

test('the page never tries to restyle native popup internals', () => {
  // ::-webkit-datetime-* / ::-webkit-calendar-picker-indicator hacks are the
  // classic "half-themed" trap: fragile across Android browsers and often
  // the cause of clipped popup layouts. The remaining native fields keep
  // the .input skin only; the custom dialogs render their own internals.
  assert.ok(!css.includes('-webkit-datetime'), 'no shadow-part datetime styling');
  assert.ok(!css.includes('calendar-picker-indicator'), 'no indicator hacks');
});
