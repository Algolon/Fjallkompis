/**
 * Focused mobile-shell + Plan dashboard polish.
 *
 * The pass is deliberately presentation-only: no route/state/schema changes.
 * The compact tab bar keeps its light surface while installed-PWA brand
 * chrome stays spruce; the Android system navigation bar is OS-owned rather
 * than represented as a second web-manifest colour. The remaining tests pin
 * the Today press-state, Packing warning placement and Pack/Worn cues.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = join(root, 'src/styles/mobile-shell-plan-polish.css');
const css = readFileSync(cssPath, 'utf8');
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');

test('the focused stylesheet is loaded after the established polish layers', () => {
  const today = main.indexOf("./styles/today-polish.css");
  const focused = main.indexOf("./styles/mobile-shell-plan-polish.css");
  assert.ok(today >= 0 && focused > today, 'focused overrides load last');
});

test('the tab bar stays light while installed-PWA brand chrome stays spruce', () => {
  assert.match(css, /--tabbar-surface-opaque:\s*#d4ded1/);
  assert.match(html, /name="theme-color" content="#2f4a3d"/);
  assert.match(vite, /theme_color:\s*'#2f4a3d'/);
  assert.doesNotMatch(html, /name="theme-color" content="#d4ded1"/);
  assert.doesNotMatch(vite, /theme_color:\s*'#d4ded1'/);
});

test('Today never flashes the retired rectangular pressed container', () => {
  assert.match(
    css,
    /\.tab--center:active \.tab-pill,[\s\S]*?\.tab--center\[aria-current='page'\]:active \.tab-pill\s*\{\s*background:\s*none;/,
  );
});

test('Packing places the warning opposite its label and keeps content full-width', () => {
  assert.match(css, /\.plan-card--packing\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /grid-template-areas:\s*\n\s*'label warning'\s*\n\s*'content content'/);
  assert.match(css, /\.plan-card--packing > \.plan-card__warn\s*\{[\s\S]*?grid-area:\s*warning/);
  assert.match(css, /\.plan-card--packing > \.plan-packing__cols,[\s\S]*?grid-area:\s*content/);
});

test('Pack and Worn weight rows use distinct decorative object masks', () => {
  assert.match(css, /\.plan-packing__col:nth-child\(2\) \.plan-count::before/);
  assert.match(
    css,
    /\.plan-packing__col:nth-child\(2\) \.plan-count:nth-child\(1\)::before\s*\{[\s\S]*?mask-image:/,
  );
  assert.match(
    css,
    /\.plan-packing__col:nth-child\(2\) \.plan-count:nth-child\(2\)::before\s*\{[\s\S]*?mask-image:/,
  );
  assert.ok((css.match(/mask-image:/g) ?? []).length >= 4, 'prefixed and standard masks exist');
});
