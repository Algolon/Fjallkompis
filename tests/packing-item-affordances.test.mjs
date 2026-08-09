/**
 * Packing rows: what a status means, and what is tappable.
 *
 * Two v1 finishing defects are pinned here.
 *
 * 1. ESSENTIAL WAS A TOOLTIP. The marker was `<span title="Essential">●</span>`
 *    — a bare bullet whose meaning existed only in a `title` attribute. On a
 *    phone there is no hover, so on the app's primary platform the meaning was
 *    unreachable; it was also carried by colour and shape alone, which the
 *    Visual Design Authority forbids. It is now the word.
 *
 * 2. THE STATUS CONTROL READ AS A LABEL. `.pack-status` is a real button that
 *    cycles needed → ready → packed, repeated on every row, but it used
 *    --ink-faint (the metadata ink) and had no pressed feedback. It now
 *    matches `.chip`, the app's own calm-control exemplar, and reinforces
 *    interactivity through pressed and focus-visible states rather than
 *    colour.
 *
 * Plus the filter row, which raised a horizontal scrollbar for ~47px of
 * overflow at 375 and ~102px at 320 — clipping the last filter for less than
 * one chip's width.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(join(root, 'src/components/PackingView.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const block = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at > -1, `${selector} exists`);
  return css.slice(at, css.indexOf('}', at));
};

// ---- 1. Essential is readable, not hoverable --------------------------------

test('essential is stated as a word, not a bare bullet', () => {
  assert.match(view, /<span className="pack-essential">Essential<\/span>/);
  assert.ok(!/title="Essential"/.test(view), 'no tooltip-only meaning');
  assert.ok(!/pack-essential[^>]*>\s*●/.test(view), 'the bullet glyph is gone');
});

test('essential does not rest on colour alone', () => {
  const dot = block('.pack-essential');
  // Colour remains as a SECOND, redundant cue — the word carries the meaning,
  // so the row still reads with no colour perception at all.
  assert.match(dot, /color: var\(--cloudberry\)/);
  assert.match(dot, /text-transform: uppercase/, 'rendered as a micro-label');
});

test('essential sits on the metadata line, so it costs no row height', () => {
  // Appended to the item NAME it pushed longer names onto a second line,
  // growing every row of a 74-item list.
  const label = view.slice(view.indexOf('{item.label}'), view.indexOf('</span>', view.indexOf('pack-sub')));
  const subAt = label.indexOf('pack-sub');
  const essAt = label.indexOf('pack-essential');
  assert.ok(essAt > subAt, 'the marker renders inside the pack-sub line');
});

// ---- 2. The status control reads as interactive -----------------------------

test('the row status is a real button with an accessible name and a verb', () => {
  assert.match(view, /className=\{`pack-status is-\$\{state\}`\}/);
  assert.match(view, /onClick=\{\(\) => cycleStatus\(item\)\}/);
  assert.match(view, /Tap to change status\./, 'the name says it is actionable');
});

test('its idle treatment matches the app’s calm-control exemplar, not metadata', () => {
  const status = block('.pack-status');
  assert.match(status, /color: var\(--ink-soft\)/, 'control ink, not --ink-faint');
  assert.ok(!/--ink-faint/.test(status), 'the metadata ink does not return');
  // Interactivity is reinforced by state, not colour.
  assert.match(css, /\.pack-status:active \{[^}]*transform: scale/s);
  assert.match(css, /\.pack-status:focus-visible \{[^}]*outline: 2px solid var\(--glacier-700\)/s);
});

// ---- 3. The filter row wraps instead of scrolling ---------------------------

test('the packing filters wrap rather than raise a horizontal scroller', () => {
  assert.match(view, /className="stage-chips stage-chips--wrap"/);
  const wrap = block('.stage-chips--wrap');
  assert.match(wrap, /flex-wrap: wrap/);
  assert.match(wrap, /overflow-x: visible/);
});

test('the shared chip row keeps its scroller for open-ended lists', () => {
  // The wrap is a MODIFIER: a stage's highlight chips are open-ended and
  // still scroll. Only the small, fixed filter set wraps.
  const base = block('.stage-chips');
  assert.match(base, /overflow-x: auto/);
});
