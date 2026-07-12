/**
 * Design-system contracts from Design Review #1 (docs/design-reviews/
 * 2026-07-v0.18-pre-field-review.md, decisions D1 and D2). Structural
 * fences only — selectors and semantic token wiring, not visual prose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// ---- D1: dedicated journey-completion colour --------------------------------

test('journey completion has its own semantic token, separate from --good', () => {
  assert.match(css, /--journey-complete: #4c6b5c;/, 'token exists with the accepted J-1 value');
  // Completed journey dots use the dedicated token…
  const past = css.slice(css.indexOf('.journey-step.is-past .journey-dot'));
  const pastBlock = past.slice(0, past.indexOf('}'));
  assert.match(pastBlock, /var\(--journey-complete\)/, 'past dots use --journey-complete');
  assert.ok(!pastBlock.includes('var(--good)'), 'past dots no longer use --good');
});

test('--good remains the generic success token for packing, checks and meters', () => {
  for (const selector of ['.pack-status.is-packed', ".check[aria-pressed='true'] .box", '.meter-fill']) {
    const idx = css.indexOf(selector);
    assert.ok(idx !== -1, `${selector} exists`);
    const block = css.slice(idx, css.indexOf('}', idx));
    assert.match(block, /var\(--good\)/, `${selector} still uses --good`);
  }
  // And nothing outside the journey uses the journey token.
  const uses = css.match(/var\(--journey-complete\)/g) ?? [];
  const journeyBlock = css.slice(css.indexOf('.journey-step.is-past .journey-dot'));
  const journeyUses = (journeyBlock.slice(0, journeyBlock.indexOf('}')).match(/var\(--journey-complete\)/g) ?? []).length;
  assert.equal(uses.length, journeyUses, '--journey-complete is used only by completed journey dots');
});

// ---- D2: links are on-palette and recognisable ------------------------------

test('text links are styled on-palette with a non-colour affordance', () => {
  const idx = css.indexOf('a:not(.btn) {');
  assert.ok(idx !== -1, 'global link rule exists');
  const block = css.slice(idx, css.indexOf('}', idx));
  assert.match(block, /color: var\(--glacier-700\)/, 'links use the design-system link colour');
  assert.match(block, /text-decoration: underline/, 'links carry an underline, not colour alone');
  assert.match(css, /a:focus-visible \{/, 'links have a focus-visible state');
  assert.match(css, /a:not\(\.btn\):visited \{/, 'visited state pinned to the same palette');
});

test('button-anchors and MapLibre attribution keep their own treatments', () => {
  // .btn declares an explicit colour so <a class="btn"> never falls back to
  // browser blue…
  const btn = css.slice(css.indexOf('\n.btn {'), css.indexOf('}', css.indexOf('\n.btn {')));
  assert.match(btn, /color: var\(--ink\)/, '.btn sets explicit ink colour');
  assert.match(css, /a\.btn \{[^}]*text-decoration: none/, 'a.btn drops the underline');
  // …and attribution links are shielded from the global link styling.
  assert.match(
    css,
    /\.maplibregl-ctrl-attrib a \{[^}]*text-decoration: none/,
    'attribution anchors keep their compact treatment',
  );
});
