/**
 * "Copy diagnostic summary" — the mobile pilot's manual error-report helper.
 * The privacy contract is structural: the builder prints a fixed whitelist
 * of TECHNICAL fields and ignores everything else, so personal data has no
 * path into the copied text even if a caller passes it by mistake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDiagnosticSummary } from '../src/utils/diagnosticSummary.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the summary lists exactly the whitelisted technical fields', () => {
  const out = buildDiagnosticSummary({
    appVersion: '0.27.0',
    content: '1 (Kungsleden (Abisko–Nikkaluokta))',
    schemaVersion: 11,
    routeDirection: 'Abisko → Nikkaluokta',
    platform: 'TestAgent/1.0',
    displayMode: 'standalone',
    serviceWorker: 'active',
    storage: 'available',
    offlineBasemap: 'stored (5.6 MB)',
    terrain: 'not stored',
    satellite: 'not stored',
  });
  const lines = out.split('\n');
  assert.equal(lines[0], 'Fjallkompis diagnostic summary');
  assert.equal(lines.length, 12, 'header + 11 fields, nothing more');
  assert.ok(out.includes('App version: 0.27.0'));
  assert.ok(out.includes('Content version: 1 (Kungsleden (Abisko–Nikkaluokta))'));
  assert.ok(out.includes('Schema version: 11'));
  assert.ok(out.includes('Route direction: Abisko → Nikkaluokta'));
  assert.ok(out.includes('Offline basemap: stored (5.6 MB)'));
});

test('unknown keys are ignored — personal data has no path into the text', () => {
  const out = buildDiagnosticSummary({
    appVersion: '0.27.0',
    notes: 'SECRET-NOTE',
    trip: [{ booking: 'SECRET-BOOKING' }],
    documents: 'SECRET-DOC',
    location: { lat: 68.35, lon: 18.83 },
  });
  assert.ok(!out.includes('SECRET'), 'no unlisted value is printed');
  assert.ok(!out.includes('68.35'), 'no location data is printed');
  assert.ok(out.includes('Platform: unknown'), 'absent fields degrade honestly');
});

test('missing facts never throw and print as unknown', () => {
  const out = buildDiagnosticSummary();
  assert.ok(out.startsWith('Fjallkompis diagnostic summary'));
  assert.ok(out.includes('App version: unknown'));
});

test('Settings wires the helper to whitelisted technical sources only', () => {
  const settings = readFileSync(
    join(root, 'src/screens/SettingsScreen.tsx'),
    'utf8',
  );
  assert.ok(settings.includes('Copy diagnostic summary'));
  assert.match(settings, /buildDiagnosticSummary\(\{/);
  const call = settings.slice(
    settings.indexOf('buildDiagnosticSummary({'),
    settings.indexOf('});', settings.indexOf('buildDiagnosticSummary({')),
  );
  // Every argument is a version, schema, platform, direction or asset fact.
  for (const forbidden of [
    'state.trip',
    'state.packing',
    'notes',
    'journal',
    'wallet',
    'plannedDays',
    'geolocation',
  ]) {
    assert.ok(
      !call.includes(forbidden),
      `diagnostics never read personal source: ${forbidden}`,
    );
  }
});
