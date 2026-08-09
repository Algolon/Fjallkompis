/**
 * Card containers that own their own rhythm must neutralise the stacked-card
 * sibling margin.
 *
 * THE BUG THIS EXISTS FOR. `.card + .card { margin-top: 14px }` is the base
 * rule for cards stacked in normal flow. Inside a container that already
 * spaces its children with a flex/grid `gap`, that margin is applied a second
 * time — and in a GRID it does not merely add space, it breaks alignment: the
 * second child starts 14px lower than its neighbour and, because the grid row
 * height is already resolved, ends 14px shorter. Two tiles then sit
 * bottom-aligned with ragged tops, which reads as a rendering fault.
 *
 * Measured on Plan home at 375×812 before the fix:
 *     Travel & stays  y=458  h=143
 *     Wallet          y=472  h=129   ← 14px lower, 14px shorter
 * and after: both y=412 h=129.
 *
 * The leak had already been fixed three times (.stack, .wallet-list,
 * .guide-grid, and the ≥900px grid media) and missed once, so this pins the
 * whole class rather than the single instance. A NEW container that lays out
 * `.card` children with a gap must be added to CONTAINERS below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

/** Containers that space `.card` children themselves, and so must reset. */
const CONTAINERS = ['.stack', '.wallet-list', '.guide-grid', '.plan-stack', '.plan-tiles'];

test('the stacked-card sibling margin still exists as the flow default', () => {
  // If this ever goes away the resets below become dead weight — and the
  // reason for this whole test disappears with it.
  assert.match(css, /\.card \+ \.card \{\s*margin-top: 14px;\s*\}/);
});

test('every gap-owning card container neutralises the sibling margin', () => {
  for (const container of CONTAINERS) {
    const reset = new RegExp(
      `\\${container} > \\.card[^{]*\\{[^}]*margin-top: 0`,
      's',
    );
    assert.match(
      css,
      reset,
      `${container} lays out cards with a gap, so it must zero .card + .card`,
    );
  }
});

test('.plan-tiles is a two-column grid whose children can no longer drift', () => {
  const block = css.slice(css.indexOf('.plan-tiles {'), css.indexOf('}', css.indexOf('.plan-tiles {')));
  assert.match(block, /display: grid/);
  assert.match(block, /grid-template-columns: 1fr 1fr/);
  assert.match(block, /gap: 12px/);
  assert.match(css, /\.plan-tiles > \.card \+ \.card \{\s*margin-top: 0;\s*\}/);
});
