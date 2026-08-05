/**
 * Trail content metadata — publication identity of the curated dossier.
 *
 * The contract this fences: Fjällkompis keeps FIVE versioning concepts apart —
 * app version, state schema version, trail identity, trail content version and
 * offline asset version. None may be derived from another, none may be shown
 * as one number, and one event must not silently move two of them.
 *
 * `contentVersion` is the newest of the five. These tests pin that it exists
 * exactly once, means exactly one thing, stays out of personal state, and that
 * the interface never turns an edition number into a freshness claim.
 *
 * Behavioural tests run against the real modules. A few STRUCTURAL fences read
 * source text for the TypeScript boundaries (attribution.ts, CreditsSheet.tsx,
 * exportImport.ts) that `node --test` cannot import — the convention this repo
 * already uses (see trail-identity.test.mjs, day-plan-store.test.mjs).
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRAIL_CONTENT,
  isFullReviewDate,
  trailDossierView,
} from '../src/data/trailMetadata.mjs';
import { ACTIVE_TRAIL_ID } from '../src/data/trailIdentity.mjs';
import { SCHEMA_VERSION, defaultState } from '../src/utils/stateMigration.mjs';
import { ROUTE_DIRECTIONS } from '../src/route/direction.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (p) => readFileSync(join(ROOT, p), 'utf8');

const METADATA_FILE = 'src/data/trailMetadata.mjs';

/** Source with comments removed — what the module actually DOES. */
const code = (p) =>
  source(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every production source file (declaration files are types, not code). */
function productionFiles(dir = 'src', out = []) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) {
      productionFiles(rel, out);
    } else if (/\.(mjs|ts|tsx)$/.test(entry) && !entry.endsWith('.d.mts')) {
      out.push(rel);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The metadata authority
// ---------------------------------------------------------------------------

test('metadata uses the one trail identity — it never restates the id', () => {
  assert.equal(TRAIL_CONTENT.trailId, ACTIVE_TRAIL_ID);

  const src = source(METADATA_FILE);
  assert.match(src, /import \{ ACTIVE_TRAIL_ID \} from '\.\/trailIdentity\.mjs'/);
  assert.ok(
    !/ACTIVE_TRAIL_ID\s*=/.test(src),
    'the id is imported from its single authority, never re-declared',
  );
  assert.ok(
    !code(METADATA_FILE).includes(ACTIVE_TRAIL_ID),
    'the literal id does not appear in the code — only the import can supply it',
  );
});

test('the dossier has a human name that is not an id and not a direction', () => {
  const { name } = TRAIL_CONTENT;
  assert.equal(typeof name, 'string');
  assert.ok(name.trim() !== '', 'a backup context needs a readable name');
  assert.equal(name, name.trim());
  assert.notEqual(name, TRAIL_CONTENT.trailId);
  assert.ok(name.includes('Kungsleden'), 'existing terminology, not a new brand');
  assert.ok(
    !/→|->|\bto\b/i.test(name),
    'names the route span, so it reads the same walking either way',
  );
});

test('contentVersion is a positive integer, not a date and not a semver', () => {
  const { contentVersion } = TRAIL_CONTENT;
  assert.equal(typeof contentVersion, 'number');
  assert.ok(Number.isInteger(contentVersion), 'a monotonic integer, not 1.2');
  assert.ok(contentVersion > 0);
  assert.ok(!String(contentVersion).includes('.'));
  assert.ok(!/^\d{4}-\d{2}-\d{2}$/.test(String(contentVersion)));
});

test('walking direction changes neither the metadata nor any field in it', () => {
  const before = { ...TRAIL_CONTENT };
  for (const direction of ROUTE_DIRECTIONS) {
    // Nothing to invoke: the descriptor takes no direction argument at all —
    // which is the point. Direction cannot reach it.
    assert.deepEqual({ ...TRAIL_CONTENT }, before, `unchanged for ${direction}`);
    assert.deepEqual({ ...trailDossierView() }, { ...trailDossierView() });
  }
  assert.ok(
    !/direction|reverse|canonical/i.test(code(METADATA_FILE)),
    'the metadata module does not know the direction model exists',
  );
});

test('the descriptor is immutable — a publication identity is not editable', () => {
  assert.ok(Object.isFrozen(TRAIL_CONTENT));
  const version = TRAIL_CONTENT.contentVersion;
  try {
    TRAIL_CONTENT.contentVersion = 99;
  } catch {
    // Strict-mode modules throw; either way the value must not move.
  }
  assert.equal(TRAIL_CONTENT.contentVersion, version);
});

test('exactly one production definition of contentVersion exists', () => {
  const hits = productionFiles().filter((f) => /\bcontentVersion\s*[:=]/.test(source(f)));
  assert.deepEqual(hits, [METADATA_FILE], 'no second, drifting content version');

  // Inside that file the NUMBER is written down once; the view model derives
  // its display string from the descriptor instead of restating a literal.
  const literals = source(METADATA_FILE).match(/\bcontentVersion\s*[:=]\s*\d/g) ?? [];
  assert.equal(literals.length, 1, 'one literal, one authority');
  assert.match(
    source(METADATA_FILE),
    /contentVersion: String\(meta\.contentVersion\)/,
    'the presented value is derived, never a second constant',
  );
});

// ---------------------------------------------------------------------------
// Concept separation — five versions, five authorities
// ---------------------------------------------------------------------------

test('contentVersion is not derived from the app version', () => {
  const src = code(METADATA_FILE);
  assert.ok(!src.includes('APP_VERSION'), 'no app version import');
  assert.ok(!src.includes('__APP_VERSION__'), 'no injected build global');
  assert.ok(!/from '.*constants'/.test(src), 'no dependency on the app constants');
  assert.ok(!/package\.json/.test(src), 'the release does not publish content');
});

test('contentVersion is not derived from the state schema version', () => {
  const src = code(METADATA_FILE);
  assert.ok(!src.includes('SCHEMA_VERSION'), 'no schema import');
  assert.ok(!/stateMigration|storage\.(?:mjs|ts)/.test(src), 'no persistence dependency');
  assert.notEqual(
    TRAIL_CONTENT.contentVersion,
    SCHEMA_VERSION,
    'and they are separately maintained numbers',
  );
});

test('personal state carries no content version', () => {
  const keys = Object.keys(defaultState('d1'));
  assert.ok(!keys.includes('contentVersion'), 'content is not personal data');
  assert.ok(
    !/\bcontentVersion\b/.test(code('src/utils/stateMigration.mjs')),
    'no migration reads or writes it',
  );
  assert.ok(
    !/\bcontentVersion\b/.test(code('src/utils/storage.ts')),
    'nothing persists it',
  );
});

test('trail identity carries no content version, and vice versa', () => {
  assert.ok(
    !/\bcontentVersion\s*[:=]/.test(source('src/data/trailIdentity.mjs')),
    'the id is not a version',
  );
  assert.ok(
    !/\bschemaVersion\b/.test(code(METADATA_FILE)),
    'and the content version is not an envelope field',
  );
});

test('offline asset versions are not an authority for content version', () => {
  const src = code(METADATA_FILE);
  assert.ok(
    !/pmtiles|PMTiles|archive|cacheKey|cache/i.test(src),
    'a basemap rebuild publishes no trail content',
  );
  const mapFiles = productionFiles('src/map');
  for (const file of mapFiles) {
    assert.ok(
      !source(file).includes('trailMetadata'),
      `${file} does not key anything off the content version`,
    );
  }
});

test('import acceptance does not depend on content version', () => {
  const src = source('src/utils/exportImport.ts');
  assert.ok(!src.includes('trailMetadata'), 'the envelope is untouched by this PR');
  assert.ok(!/\bcontentVersion\b/.test(src));
  // An older backup of the SAME dossier stays importable: the only identity
  // check is trail-mismatch, unchanged from PR #98.
  assert.match(src, /reason: 'trail-mismatch'/);
  assert.match(src, /schemaVersion: SCHEMA_VERSION/);
});

// ---------------------------------------------------------------------------
// Honesty gate — the whole-dossier review date
// ---------------------------------------------------------------------------

test('no whole-dossier review date is claimed today', () => {
  assert.equal(
    TRAIL_CONTENT.lastFullyReviewedOn,
    undefined,
    'the repository holds no evidence of a whole-dossier review',
  );
  assert.equal(trailDossierView().fullyReviewedOn, null);
});

test('the review date is not silently derived from any single source date', () => {
  const src = code(METADATA_FILE);
  assert.ok(
    !/\d{4}-\d{2}-\d{2}/.test(src),
    'no date literal in the code — an invented date is the failure mode here',
  );
  for (const constant of [
    'FACTS_VERIFIED_ON',
    'SHOP_FACTS_VERIFIED_ON',
    'TRANSPORT_FACTS_VERIFIED_ON',
    'OFF_ROUTE_FACTS_VERIFIED_ON',
    'lastVerified',
  ]) {
    assert.ok(
      !src.includes(constant),
      `${constant} describes one source, never the whole dossier`,
    );
  }
});

test('a review date must be a real calendar day in YYYY-MM-DD', () => {
  assert.ok(isFullReviewDate('2026-08-05'));
  assert.ok(isFullReviewDate('2024-02-29'), 'leap day');
  for (const bad of [
    '2026-7-2',
    '2026-02-30',
    '2026-13-01',
    '5 August 2026',
    '2026-08-05T00:00:00Z',
    '',
    undefined,
    null,
    20260805,
    new Date('2026-08-05'),
  ]) {
    assert.equal(isFullReviewDate(bad), false, `rejected: ${String(bad)}`);
  }
});

test('the view surfaces a valid date verbatim and refuses a malformed one', () => {
  const reviewed = trailDossierView({
    ...TRAIL_CONTENT,
    lastFullyReviewedOn: '2026-08-01',
  });
  assert.equal(reviewed.fullyReviewedOn, '2026-08-01', 'ISO out; the caller formats');

  const malformed = trailDossierView({
    ...TRAIL_CONTENT,
    lastFullyReviewedOn: 'recently',
  });
  assert.equal(malformed.fullyReviewedOn, null, 'never a claim we cannot verify');
});

test('the view never claims the content is checked, current or up to date', () => {
  const view = trailDossierView();
  const text = Object.values(view).filter((v) => typeof v === 'string').join(' | ');
  assert.match(text, /Kungsleden/);
  assert.doesNotMatch(
    text,
    /checked|up to date|up-to-date|current|verified|latest|accurate/i,
    `an edition number is not a freshness guarantee — got: ${text}`,
  );
});

// ---------------------------------------------------------------------------
// Settings presentation (structural — TypeScript boundary)
// ---------------------------------------------------------------------------

test('the credits sheet shows the dossier name and content version', () => {
  const sheet = source('src/components/CreditsSheet.tsx');
  assert.match(sheet, /import \{ trailDossierView \} from '\.\.\/data\/trailMetadata\.mjs'/);
  assert.match(sheet, /\{dossier\.name\}/);
  assert.match(sheet, /\{dossier\.contentVersionLabel\}/);
  assert.match(sheet, /\{dossier\.contentVersion\}/);
  assert.match(sheet, /section-label">Trail dossier</);
});

test('the sheet distinguishes content version from app version', () => {
  const sheet = source('src/components/CreditsSheet.tsx');
  assert.match(sheet, /muted">App version<\/span>\s*\n\s*<span className="tnum">\{APP_VERSION\}/);
  assert.equal(trailDossierView().contentVersionLabel, 'Content version');
  assert.notEqual(trailDossierView().contentVersionLabel, 'App version');
  assert.ok(
    !trailDossierView().contentVersion.includes('.'),
    'the content version is never rendered as a semver',
  );
});

test('the raw trail id stays internal', () => {
  const sheet = source('src/components/CreditsSheet.tsx');
  assert.ok(!sheet.includes(ACTIVE_TRAIL_ID), 'no raw id literal');
  assert.ok(!sheet.includes('ACTIVE_TRAIL_ID'), 'and no import of it');
  assert.ok(!/dossier\.trailId|TRAIL_CONTENT\.trailId/.test(sheet));
});

test('the review row is conditional, and no fallback claims freshness', () => {
  const sheet = source('src/components/CreditsSheet.tsx');
  assert.match(
    sheet,
    /\{dossier\.fullyReviewedOn \? \(/,
    'rendered only when an honest date exists',
  );
  assert.match(sheet, /\) : null\}/, 'and nothing is substituted when it does not');
  // No "checked"/"up to date" copy anywhere in the sheet's own text.
  const copy = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(copy, /Trail data checked|up to date|up-to-date|Trailgegevens/i);
});

test('the sheet still lists every source, licence and link', () => {
  const sheet = source('src/components/CreditsSheet.tsx');
  for (const list of [
    'TRAIL_DATA_SOURCES',
    'TRIP_INFO_SOURCES',
    'APP_DATA_SOURCES',
    'SOFTWARE_CREDITS',
  ]) {
    assert.ok(sheet.includes(`{${list}.map(`), `${list} is still rendered`);
  }
  assert.match(sheet, /\{APP_VERSION\}/);
  assert.match(sheet, /href=\{REPOSITORY_URL\}/);
  // The shared entry keeps licence, modified notice and provider link.
  for (const field of ['licenseName', 'licenseUrl', 'modifiedNotice', 'sourceUrl']) {
    assert.ok(sheet.includes(`s.${field}`), `${field} still rendered`);
  }
});

test('trail sources and app credits partition the shipped sources', () => {
  const attribution = source('src/data/attribution.ts');
  const ids = attribution.match(/^\s{4}id: '/gm) ?? [];
  const scopes = attribution.match(/^\s{4}scope: '/gm) ?? [];
  assert.equal(ids.length, scopes.length, 'every source declares a scope');
  assert.ok(ids.length > 0);

  // Both groups derive from PRESENT_DATA_SOURCES by filter, so nothing can be
  // dropped when a source is added — the required `scope` field decides.
  assert.match(
    attribution,
    /TRAIL_DATA_SOURCES = PRESENT_DATA_SOURCES\.filter\(\s*\(s\) => s\.scope === 'trail',?\s*\)/,
  );
  assert.match(
    attribution,
    /APP_DATA_SOURCES = PRESENT_DATA_SOURCES\.filter\(\s*\(s\) => s\.scope === 'app',?\s*\)/,
  );
  assert.match(attribution, /scope: AttributionScope;/, 'required, not optional');
});
