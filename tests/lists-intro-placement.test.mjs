/**
 * Lists screen: the per-section description moved out of the page header and
 * under the Packing / Shops / Transport tab control, so its per-tab change
 * reads as an introduction to the SELECTED list rather than static page copy.
 *
 * Source-text contracts (same style as the other screen guard tests).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lists = readFileSync(join(root, 'src/screens/ListsScreen.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

test('the Lists header carries the title only — no description child', () => {
  // ScreenHeader is self-closing (no children), so LISTS_HEADER no longer
  // renders as page-title copy.
  assert.match(lists, /<ScreenHeader[^>]*title="Lists"[^>]*\/>/);
  assert.ok(
    !/<ScreenHeader[^>]*>\s*\{LISTS_HEADER\[mode\]\}/.test(lists),
    'LISTS_HEADER is not rendered inside the ScreenHeader anymore',
  );
});

test('the dynamic description renders below the tab control, keyed by the active tab', () => {
  assert.match(
    lists,
    /<p className="lists-intro">\{LISTS_HEADER\[mode\]\}<\/p>/,
    'intro paragraph renders the active-section copy',
  );
  const iSeg = lists.indexOf('seg seg--lists');
  const iIntro = lists.indexOf('lists-intro');
  assert.ok(iSeg > 0 && iIntro > iSeg, 'the intro appears after the tab control');
});

test('LISTS_HEADER stays per-section (the copy still changes per tab)', () => {
  assert.match(lists, /const LISTS_HEADER: Record<ListsSection, string>/);
  for (const key of ['packing:', 'shops:', 'transport:']) {
    assert.ok(lists.includes(key), `LISTS_HEADER keeps its ${key} entry`);
  }
});

test('.lists-intro pins the screen-header intro typography', () => {
  const idx = css.indexOf('.lists-intro {');
  assert.ok(idx !== -1, '.lists-intro rule exists');
  const block = css.slice(idx, css.indexOf('}', idx));
  assert.match(block, /font-size:\s*14px/, 'same 14px as .screen-head p');
  assert.match(block, /color:\s*var\(--ink-soft\)/, 'same ink-soft colour');
  assert.match(block, /line-height:\s*1\.45/, 'same 1.45 line-height');
});
