import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const generator = fs.readFileSync(new URL('../scripts/generate-store-feature-graphics.mjs', import.meta.url), 'utf8');

test('feature graphic generator stays Store-only and defines Play-compliant candidates', () => {
  assert.match(generator, /width: 1024, height: 500/);
  assert.match(generator, /15_000_000/);
  assert.match(generator, /01-today-hero\.png/);
  assert.match(generator, /02-offline-maps\.png/);
  assert.match(generator, /03-companion-overview\.png/);
  assert.match(generator, /privacyFindings/);
  assert.doesNotMatch(generator, /src\/components|src\/styles|vite build/);
});
