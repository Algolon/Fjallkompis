/**
 * The centred Today destination (vNext experience pass).
 *
 * Today is the bottom bar's CENTRE item with a subtly elevated disc — and
 * it stays an ordinary navigation TAB: same button semantics, same
 * aria-current model, always-visible label, geometry identical in both
 * states (fill/shadow change only), navigation-only behaviour. These
 * fences pin the "destination, not action button" contract and the
 * restrained measurements.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tabbar = readFileSync(join(root, 'src/components/TabBar.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const block = (selector) => {
  const idx = css.indexOf(`${selector} {`);
  assert.notEqual(idx, -1, `${selector} rule exists`);
  return css.slice(idx, css.indexOf('}', idx));
};

test('the centre treatment applies to Today in the bottom bar only', () => {
  assert.match(tabbar, /const centred = tab === 'today' && variant === 'bar';/);
  // The rail keeps a uniform column — no centre disc there.
  assert.match(tabbar, /tab--center/);
});

test('Today stays a navigation tab — same semantics as every destination', () => {
  // One shared button rendering path: aria-current, onChange(tab), a
  // visible label. No separate action-button markup, no add/start glyphs.
  assert.match(tabbar, /aria-current=\{active === tab \? 'page' : undefined\}/);
  assert.match(tabbar, /onClick=\{\(\) => onChange\(tab\)\}/);
  assert.match(tabbar, /<span className="tab-label">\{label\}<\/span>/);
  assert.ok(!/Plus|Play|Start|Add\b/.test(tabbar), 'no action-button glyph imports');
});

test('the disc is restrained: 54px, ~9px elevation, stable geometry', () => {
  const disc = block('.tab-center-disc');
  assert.match(disc, /width: 54px/);
  assert.match(disc, /height: 54px/);
  assert.match(disc, /margin-top: -12px/);
  assert.match(disc, /border-radius: 50%/);
  // Active state changes fill/shadow ONLY — no width/height/margin.
  const active = block(".tab--center[aria-current='page'] .tab-center-disc");
  assert.match(active, /background: var\(--spruce\)/);
  assert.ok(!/width:|height:|margin/.test(active), 'no geometry jump between states');
});

test('the toast region clears the disc protrusion', () => {
  const toast = block('.pwa-toast-region');
  assert.match(toast, /bottom: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\) \+ 24px\)/);
});

test('the centre disc keeps an explicit focus ring', () => {
  assert.ok(css.includes('.tab--center:focus-visible .tab-center-disc'));
});
