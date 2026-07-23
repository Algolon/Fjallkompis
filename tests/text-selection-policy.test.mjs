/**
 * Text-selection policy — one central rule, not scattered opt-outs.
 *
 * The app has been long-press-safe since 2026-07-12 (`html { user-select:
 * none }` + editable restore), but top-layer elements do NOT take the
 * propagated used `user-select` value from the document: inside a modal
 * <dialog>, `auto` resolves to `text` again (observed in Chromium). That
 * made every sheet, viewer and picker dialog selectable while the rest of
 * the app was not — the owner hit it in the new pickers, but it was
 * systemic to all dialog surfaces.
 *
 * The rules under test:
 *  - ONE central block covers the app and every dialog (`html, dialog`),
 *    with both standard and -webkit- properties and the touch-callout;
 *  - editable controls (input, textarea, [contenteditable]) explicitly
 *    restore selection AFTER the none-default, so typing, copying and
 *    Shift+Arrow selection keep working — including inside dialogs;
 *  - stored document/credential images keep the platform long-press
 *    callout (saving your own ticket is a feature);
 *  - no component reintroduces scattered user-select rules — the policy
 *    lives in exactly one place.
 *
 * Deliberate non-exceptions, audited 2026-07-23: trip notes and booking
 * references are displayed nowhere as static text — they are only visible
 * inside the edit sheet's inputs, which are selectable. No `.selectable`
 * utility is needed until static user-authored text actually exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

test('one central none-default covers the app AND all dialog top layers', () => {
  const block = css.match(/html,\ndialog \{[^}]*\}/s)?.[0];
  assert.ok(block, 'the policy selector is exactly html, dialog');
  assert.match(block, /-webkit-user-select: none/);
  assert.match(block, /(?<!-)user-select: none/);
  assert.match(block, /-webkit-touch-callout: none/);
});

test('editable controls restore selection, declared after the none-default', () => {
  const noneAt = css.indexOf('html,\ndialog {');
  const restore = css.match(/input,\ntextarea,\n\[contenteditable\] \{[^}]*\}/s)?.[0];
  assert.ok(restore, 'input/textarea/contenteditable restore block exists');
  assert.match(restore, /-webkit-user-select: text/);
  assert.match(restore, /(?<!-)user-select: text/);
  assert.match(restore, /-webkit-touch-callout: default/);
  assert.ok(
    css.indexOf(restore) > noneAt,
    'restore comes after the default so it wins at equal specificity',
  );
});

test('stored document images in dialogs keep the platform callout', () => {
  assert.match(css, /dialog img \{\n\s*-webkit-touch-callout: default;\n\}/);
});

test('the policy lives in one place — no scattered user-select rules', () => {
  // Every user-select mention must sit inside the policy region at the top
  // of the stylesheet (before the tap-highlight block that follows it).
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ''); // prose may mention the property
  const regionEnd = code.indexOf('-webkit-tap-highlight-color');
  assert.ok(regionEnd > 0);
  let idx = -1;
  let count = 0;
  while ((idx = code.indexOf('user-select', idx + 1)) !== -1) {
    count++;
    assert.ok(idx < regionEnd, `user-select declaration at ${idx} is outside the policy block`);
  }
  assert.equal(count, 4, 'two none declarations + two text declarations, nothing else');

  // And no component sets it inline either.
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  for (const f of walk(join(root, 'src'))) {
    if (!/\.(tsx?|mjs)$/.test(f)) continue;
    assert.ok(!readFileSync(f, 'utf8').includes('userSelect'), `${f} has no inline userSelect`);
  }
});
