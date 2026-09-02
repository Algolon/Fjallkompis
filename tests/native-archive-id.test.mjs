/**
 * Native archive-id grammar + status-probe resilience — the 2700017 hotfix
 * contract.
 *
 * What happened: the Satellite HD assets shipped with camelCase wire ids
 * (`satelliteHdNorth`), MapArchivePlugin.safeId() rejected them (its
 * [a-z0-9-]{1,32} grammar is a deliberate path-traversal fence, and
 * loosening it was the wrong fix), the rejected status probe was uncaught,
 * and the Settings card sat on "Checking…" forever with its button
 * disabled. These tests pin both halves of the fix: every id that can reach
 * the plugin satisfies THE GRAMMAR READ OUT OF THE JAVA SOURCE, and a
 * rejected probe can never strand a card in the checking phase again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAP_ASSETS, MAP_ASSET_IDS, NATIVE_OPTIONAL_MAP_ASSETS } from '../src/map/mapCatalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** The grammar as the PLUGIN declares it — extracted, not transcribed. */
function nativeSafeIdRegex() {
  const java = read('android/app/src/main/java/com/algolon/fjallkompis/MapArchivePlugin.java');
  const match = java.match(/!id\.matches\("([^"]+)"\)/);
  assert.ok(match, 'MapArchivePlugin.safeId() declares its grammar with id.matches(...)');
  return new RegExp(`^(?:${match[1]})$`);
}

test('every catalog wire id satisfies the native safeId grammar from the Java source', () => {
  const grammar = nativeSafeIdRegex();
  for (const key of MAP_ASSET_IDS) {
    const asset = MAP_ASSETS[key];
    assert.match(asset.id, grammar, `${key} → '${asset.id}' must be accepted by MapArchivePlugin.safeId()`);
  }
  // The regression case by name: both HD shards, downloadable ONLY through
  // the native plugin, must be accepted — a native-only asset the plugin
  // rejects is an asset no platform can ever obtain.
  assert.equal(MAP_ASSETS.satelliteHdNorth.id, 'satellite-hd-north');
  assert.equal(MAP_ASSETS.satelliteHdSouth.id, 'satellite-hd-south');
  for (const key of NATIVE_OPTIONAL_MAP_ASSETS) {
    assert.match(MAP_ASSETS[key].id, grammar, `${key} is native-downloadable, so its id must pass safeId`);
  }
});

test('every native plugin call is addressed by the catalog wire id', () => {
  const store = read('src/map/nativeArchiveStore.ts');
  // Each call site hands the plugin `asset.id` — the value the grammar test
  // above just certified — never the catalog key or any other string.
  for (const call of ['status', 'download', 'cancel', 'remove']) {
    assert.match(store, new RegExp(`MapArchive\\.${call}\\(\\{\\s*\\n?\\s*id: asset\\.id`),
      `MapArchive.${call} is called with asset.id`);
  }
});

test('a rejected status probe can never strand an ArchiveCard on "Checking…"', () => {
  const card = read('src/components/OfflineMapCard.tsx');
  // The refresh wraps the probe and lands in a TERMINAL phase on rejection…
  const refreshStart = card.indexOf('const refresh = async');
  const refresh = card.slice(refreshStart, card.indexOf('useEffect', refreshStart));
  assert.match(refresh, /try \{/, 'refresh guards the probe');
  assert.match(refresh, /catch \(e\)/, '…and handles rejection');
  assert.match(refresh, /kind: 'probe-failed'/, 'rejection leaves the checking phase');
  assert.match(refresh, /Could not check what this device holds/, 'the failure is named for diagnosis');
  // …which renders a real state: an Unknown status, the error text, and a
  // retry action — not a disabled download button behind a spinner.
  assert.match(card, /'probe-failed'\s*\n?\s*\? 'Unknown'/, 'probe failure reads as Unknown, not Not downloaded');
  assert.match(card, /Check again/, 'the user can retry the probe');
  // The availability hook (map layer menu) resolves its checking flag on
  // rejection too, instead of reporting "checking" forever.
  const hook = card.slice(card.indexOf('export function useCombinedArchiveStatus'), card.indexOf('function ArchiveCard'));
  assert.match(hook, /checking: false, supported: false/, 'the hook terminates checking on a rejected probe');
});

test('the wire-id rename changed no release identity and no stored bytes', () => {
  // Filenames, tags, byte lengths and digests are exactly the published
  // satellite-hd-data-v1 assets; only the plugin-facing id moved to the
  // grammar the plugin always required. (Nothing was ever stored under the
  // camelCase ids — safeId rejected them before any file operation — so no
  // migration path is needed or wanted.)
  const north = MAP_ASSETS.satelliteHdNorth;
  const south = MAP_ASSETS.satelliteHdSouth;
  assert.equal(north.file, 'kungsleden-satellite-hd-north.pmtiles');
  assert.equal(south.file, 'kungsleden-satellite-hd-south.pmtiles');
  assert.equal(north.release.tag, 'satellite-hd-data-v1');
  assert.equal(south.release.tag, 'satellite-hd-data-v1');
  assert.equal(north.revision.bytes, 1_018_195_695);
  assert.equal(south.revision.bytes, 1_169_960_140);
  assert.equal(north.revision.sha256, '5a1e0ecf223fa19d72eaa046a7d83c479077bed165496d49ac39003a0c592705');
  assert.equal(south.revision.sha256, 'de09f27a4786f443eacc1bb366c12bdc509987a850c2e4755b5c09660a8cd564');
});
