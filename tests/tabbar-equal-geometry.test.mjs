/**
 * Bottom navigation: EQUAL GEOMETRY for all five destinations (Variant C).
 *
 * This file used to defend the opposite contract. Today rendered an extra
 * elevated 54px disc in the bottom bar, and these fences pinned its size and
 * protrusion. The owner selected Variant C after the Phase 1 audit measured
 * what that exception actually cost:
 *
 *   * the disc rendered whether or not Today was selected, so a bright circle
 *     out-shouted whichever destination WAS current — a navigation bar failing
 *     at the one thing it must say;
 *   * it pushed Today's label 10px below its four siblings: 1px of clearance
 *     at 375x812, 2px at 320x568, and under Samsung's 3-button navigation the
 *     label landed exactly on the seam between the app's bar and Android's;
 *   * a raised, shadowed circle protruding above a bottom bar is the FAB
 *     silhouette, which the component's own comments had to keep denying.
 *
 * Today keeps its primacy through centre position, default destination and
 * information architecture — not exceptional geometry.
 *
 * These tests therefore pin the ABSENCE of any per-destination exception, and
 * the presence of one shared layout contract. Rendered-DOM measurements for
 * every viewport and every selected state live in the PR evidence; the repo
 * has no DOM test environment, so what is machine-checkable here is the
 * source and CSS contract that produces them — plus the label-size expression,
 * which is evaluated numerically below rather than string-matched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const tabbar = read('src/components/TabBar.tsx');
const css = read('src/styles/global.css');
const barCss = read('src/styles/map-popup-polish.css');
const polishCss = read('src/styles/mobile-shell-plan-polish.css');
const allCss = css + barCss + polishCss;

const block = (source, selector) => {
  const idx = source.indexOf(`${selector} {`);
  assert.notEqual(idx, -1, `${selector} rule exists`);
  return source.slice(idx, source.indexOf('}', idx));
};

// ---- One rendering path, no per-destination branch --------------------------

test('every destination renders through the identical element tree', () => {
  // The map callback must not branch on which tab it is building. This is the
  // structural guarantee behind equal geometry: a future exception would have
  // to reintroduce a conditional here, and this test would fail.
  const body = tabbar.slice(tabbar.indexOf('TAB_ROUTES.map('), tabbar.indexOf('</nav>'));
  assert.match(body, /className="tab"/, 'the class is a constant, not a template');
  assert.ok(
    !/tab === '(today|map|guide|plan|settings)'/.test(body),
    'no per-destination conditional in the render path',
  );
  assert.ok(!/centred|centered/.test(tabbar), 'no centre-exception flag remains');
});

test('the retired raised-Today treatment is gone from markup and every stylesheet', () => {
  for (const [name, source] of [
    ['TabBar.tsx', tabbar],
    ['global.css', css],
    ['map-popup-polish.css', barCss],
    ['mobile-shell-plan-polish.css', polishCss],
  ]) {
    assert.ok(!/tab--center/.test(source), `${name} has no .tab--center rule or class`);
    assert.ok(!/tab-center-disc/.test(source), `${name} has no centre disc`);
  }
});

test('no tab carries elevation, protrusion or a shadow', () => {
  // The three ingredients of the old exception, each independently fenced:
  // a negative margin lifting one tab out of the row, a shadow implying a
  // floating control, and a circular silhouette.
  const navRules = allCss.split('}').filter((r) => /\.tab[\s.[:{]|\.tab-pill|\.tab-label/.test(r));
  for (const rule of navRules) {
    assert.ok(!/margin-top:\s*-/.test(rule), `no negative top margin in nav rule: ${rule.trim().slice(0, 80)}`);
    assert.ok(!/box-shadow:\s*(?!none)/.test(rule), `no shadow in nav rule: ${rule.trim().slice(0, 80)}`);
    assert.ok(!/border-radius:\s*50%/.test(rule), `no circular nav surface: ${rule.trim().slice(0, 80)}`);
  }
});

test('Today stays a navigation tab — same semantics as every destination', () => {
  assert.match(tabbar, /aria-current=\{active === tab \? 'page' : undefined\}/);
  assert.match(tabbar, /onClick=\{\(\) => onChange\(tab\)\}/);
  assert.match(tabbar, /<span className="tab-label">\{label\}<\/span>/);
  assert.ok(!/Plus|Play|Start|Add\b/.test(tabbar), 'no action-button glyph imports');
});

// ---- One selected treatment, for every destination --------------------------

test('the selected treatment is destination-agnostic', () => {
  // Keyed on aria-current alone — so it necessarily applies to all five.
  assert.match(css, /\.tab\[aria-current='page'\] \.tab-pill \{[^}]*background: var\(--spruce\)/s);
  assert.match(css, /\.tab\[aria-current='page'\] \.ic \{[^}]*stroke: #eef3ec/s);
  assert.match(css, /\.tab\[aria-current='page'\] \{[^}]*color: #eef3ec/s);
  const selectors = [...css.matchAll(/\.tab\[aria-current='page'\][^{,]*/g)].map((m) => m[0]);
  for (const sel of selectors) {
    assert.ok(!/today|center/i.test(sel), `selected rule "${sel}" is not destination-specific`);
  }
});

test('selecting a tab changes fill only — never the cell it sits in', () => {
  // Geometry lives on .tab / .tab-pill unconditionally; the aria-current
  // rules may not introduce size, position or spacing.
  const selectedRules = allCss
    .split('}')
    .filter((r) => /\[aria-current='page'\]/.test(r) && /\.tab/.test(r));
  assert.ok(selectedRules.length > 0, 'selected rules exist');
  for (const rule of selectedRules) {
    assert.ok(
      !/(^|[;{\s])(width|height|min-height|max-width|padding|margin|top|bottom|transform)\s*:/.test(rule),
      `selected state must not move geometry: ${rule.trim().slice(0, 90)}`,
    );
  }
});

test('the selected surface stays inside its cell rather than filling it', () => {
  // What keeps this a state inside a navigation cell instead of another loud
  // pill: the painted surface is capped below the cell's own box, so a margin
  // is always visible around it. --tabbar-h is 56 and the cell is ~55 tall.
  const pill = block(barCss, '.tabbar--bar .tab-pill');
  const maxW = Number(/max-width:\s*(\d+)px/.exec(pill)[1]);
  const minH = Number(/min-height:\s*(\d+)px/.exec(pill)[1]);
  const barH = Number(/--tabbar-h:\s*(\d+)px/.exec(css)[1]);
  assert.ok(maxW <= 64, `selected surface width ${maxW}px stays within the narrowest cell`);
  assert.ok(minH <= barH - 8, `selected surface height ${minH}px leaves margin inside the ${barH}px row`);
  assert.ok(minH >= 44, `selected surface height ${minH}px still reads as a ≥44px target`);
});

// ---- Label legibility -------------------------------------------------------

test('the label size expression is readable at every supported width', () => {
  // Evaluated, not string-matched: the previous expression looked reasonable
  // and resolved to 6.84px at 320px wide.
  const decl = /font-size:\s*clamp\(([^)]+)\);/.exec(css.slice(css.indexOf('.tab {')));
  assert.ok(decl, '.tab declares a clamped font-size');
  const [minRaw, prefRaw, maxRaw] = decl[1].split(',').map((s) => s.trim());
  const px = (v, width) => {
    const vw = /^([\d.]+)vw$/.exec(v);
    if (vw) return (Number(vw[1]) * width) / 100;
    return Number(/^([\d.]+)px$/.exec(v)[1]);
  };
  for (const width of [320, 375, 390, 430]) {
    const resolved = Math.min(
      Math.max(px(minRaw, width), px(prefRaw, width)),
      px(maxRaw, width),
    );
    assert.ok(
      resolved >= 9.5 && resolved <= 11,
      `label resolves to ${resolved}px at ${width}px — must stay within 9.5-11px`,
    );
  }
});

test('labels are never hidden to solve fit', () => {
  assert.ok(!/\.tab-label\s*\{[^}]*display:\s*none/s.test(allCss), 'labels are always rendered');
  const label = block(css, '.tab-label');
  assert.match(label, /text-overflow: ellipsis/, 'overflow degrades gracefully rather than clipping hard');
});

// ---- Touch targets and the safe-area boundary -------------------------------

test('the whole cell stays the touch target, not the painted surface', () => {
  const tab = block(css, '.tab');
  assert.match(tab, /flex: 1/, 'each cell takes an equal share of the bar width');
  // The bar's content row is the full --tabbar-h; nothing shrinks the cell.
  assert.ok(!/height:\s*\d/.test(tab), '.tab does not set its own reduced height');
});

test('the bar still owns the bottom inset, so content never runs under system navigation', () => {
  const bar = block(css, '.tabbar');
  assert.match(bar, /height: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\)\)/);
  assert.match(bar, /padding-bottom: var\(--safe-bottom\)/);
});

test('the toast region clears the navigation row', () => {
  const toast = block(css, '.pwa-toast-region');
  assert.match(toast, /bottom: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\)/);
});

test('focus remains visible, on the same element for every tab', () => {
  assert.match(css, /\.tab:focus-visible \.tab-pill \{[^}]*outline: 2px solid/s);
  // Scoped to NAVIGATION focus rules — `.today-screen …:focus-visible` and
  // friends are screen content, not the tab bar, and must not trip this.
  const navFocus = allCss
    .split('}')
    .filter((r) => /\.tab[\s.[:]/.test(r) && /:focus-visible/.test(r));
  assert.ok(navFocus.length > 0, 'the tab bar declares a focus ring');
  for (const rule of navFocus) {
    assert.ok(
      !/tab--center|tab-center-disc/.test(rule),
      `no destination-specific focus ring remains: ${rule.trim().slice(0, 80)}`,
    );
  }
});
