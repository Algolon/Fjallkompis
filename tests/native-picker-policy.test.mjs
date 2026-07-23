/**
 * Native date/time picker policy (owner decision, 2026-07-23).
 *
 * The Android popup overflow Omar photographed (the time dialog's
 * Wissen | Annuleren | Instellen action row running past the screen edge)
 * happens INSIDE the OS/browser-rendered dialog. Page CSS, viewport meta
 * and wrappers cannot reach that layout — it is a Samsung/Chrome UI bug
 * with long localized labels at large display/font scale, and the dialog
 * offers its own keyboard-entry fallback. The app therefore:
 *
 *   1. keeps the date/time fields NATIVE — no custom picker, no wrapper
 *      library; reliability and OS accessibility outrank cosmetics;
 *   2. declares `color-scheme: light` (page + meta) — the one
 *      standards-based lever a page has over those dialogs: browsers that
 *      honour it render the picker in its light theme so it stops
 *      appearing as a dark OS panel over the light app;
 *   3. styles only what the page owns: the closed field (.input) and the
 *      surrounding sheet.
 *
 * These tests fence that policy so a future "quick restyle" doesn't
 * silently replace the native controls or drop the color-scheme hint.
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

test('date and time fields stay native inputs with the shared field skin', () => {
  // Trip editor: one date + two times (transport), two dates (stay).
  assert.equal((tripSheet.match(/type="date"/g) ?? []).length, 3, 'trip sheet date inputs');
  assert.equal((tripSheet.match(/type="time"/g) ?? []).length, 2, 'trip sheet time inputs');
  assert.match(walletSheet, /type="date"/, 'wallet expiry input stays native');
  for (const source of [tripSheet, walletSheet]) {
    assert.ok(!/react-datepicker|react-day-picker|flatpickr|Datepicker|TimePicker/i.test(source),
      'no custom picker library or component');
  }
});

test('the page never tries to restyle the popup internals', () => {
  // ::-webkit-datetime-* / ::-webkit-calendar-picker-indicator hacks are the
  // classic "half-themed" trap: fragile across Android browsers and often
  // the cause of clipped popup layouts. The closed field is styled via
  // .input only.
  assert.ok(!css.includes('-webkit-datetime'), 'no shadow-part datetime styling');
  assert.ok(!css.includes('calendar-picker-indicator'), 'no indicator hacks');
});
