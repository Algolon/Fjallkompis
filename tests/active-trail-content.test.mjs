/**
 * The active trail content boundary — one way into the curated dossier.
 *
 * The contract these tests fence: application code (screens, components,
 * stores, hooks, navigation and the app entry points) reads curated trail
 * content through src/trail/activeTrailContent.ts and nowhere else. Content
 * keeps living in the modules that define it; the boundary only says which
 * dossier is active and what it consists of.
 *
 * Why this is worth a test and not just a convention: before this boundary,
 * ~20 application files imported ~14 different content modules directly. That
 * is exactly the shape that makes a Guide screen expensive to build and a
 * content change expensive to reason about. A convention would erode on the
 * first hurried import; a test fails.
 *
 * TWO KINDS OF ASSERTION, ON PURPOSE
 * ----------------------------------
 * The boundary is TypeScript — it must be, because half the content it
 * aggregates (stops.ts, stages.ts, routeData.ts, routeExperiences.ts,
 * experienceGeometry.ts, attribution.ts) is TypeScript that `node --test`
 * cannot import. So:
 *
 *  - BEHAVIOURAL assertions run against the real .mjs authorities the boundary
 *    aggregates (metadata, places, guides, highlights, shops, transport), and
 *  - STRUCTURAL assertions read source text for the TypeScript half and for
 *    the import graph itself.
 *
 * This is the convention the repo already uses for TypeScript boundaries — see
 * trail-content-metadata.test.mjs and trail-identity.test.mjs.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRAIL_CONTENT } from '../src/data/trailMetadata.mjs';
import { ACTIVE_TRAIL_ID } from '../src/data/trailIdentity.mjs';
import { OFF_ROUTE_PLACES } from '../src/data/journeyPlaces.mjs';
import { STAGE_GUIDES } from '../src/data/stageGuides.mjs';
import { STAGE_EDITORIAL } from '../src/data/stageEditorial.mjs';
import { HIGHLIGHT_TYPES, STAGE_HIGHLIGHT_IDS } from '../src/data/stageHighlights.mjs';
import { SHOP_LOCATIONS } from '../src/data/shops.mjs';
import { TRANSPORT_ENTRIES } from '../src/data/transport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Source with comments removed — what the module actually DOES. */
const code = (p) =>
  source(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const BOUNDARY = 'src/trail/activeTrailContent.ts';

// ---------------------------------------------------------------------------
// The guarded content surface
//
// Keys are paths under src/, exactly as an import specifier resolves to them.
// Everything listed here is CURATED TRAIL CONTENT: what a hiker trusts about
// the route, independent of their own trip. Personal data, app credits, map
// archives and the packing seed are deliberately NOT here — see the exclusion
// tests at the bottom of this file.
// ---------------------------------------------------------------------------
const GUARDED = new Map([
  ['route/routeData', 'canonical route geometry, stages and waypoints'],
  ['route/waypointStops.mjs', 'waypoint ↔ stop identity'],
  ['data/stages', 'stage records and stage topology'],
  ['data/stops', 'curated route stops'],
  ['data/journeyPlaces.mjs', 'curated off-route places'],
  ['data/stageGuides.mjs', 'day guides'],
  ['data/trailCaveats.mjs', 'standing operational caveats'],
  ['data/stageEditorial.mjs', 'stage notes and time estimates'],
  ['data/stageHighlights.mjs', 'stage highlights'],
  ['data/routeExperiences', 'highlights and detours'],
  ['data/experienceGeometry', 'experience geometry'],
  ['data/experienceRoutes', 'experience route assets'],
  ['data/shops.mjs', 'resupply reference data'],
  ['data/transport.mjs', 'transport reference data'],
  ['data/trailMetadata.mjs', 'dossier publication identity'],
]);

/**
 * Trail-scoped names inside the MIXED attribution registry.
 *
 * src/data/attribution.ts holds both trail sources (what the dossier is built
 * on) and app sources (what the software renders with). Only the trail half
 * belongs to the dossier, so the module is guarded per NAME rather than as a
 * whole — the map and the credits sheet legitimately read the app half.
 */
const ATTRIBUTION = 'data/attribution';
const TRAIL_SCOPED_ATTRIBUTION = ['TRAIL_DATA_SOURCES', 'TRIP_INFO_SOURCES'];

/**
 * Directories whose files are APPLICATION CONSUMERS: they present content or
 * navigate to it. They must reach the dossier through the boundary.
 *
 * Not enforced, and why:
 *  - src/data, src/route — the content definitions and the route derivation
 *    the boundary is built FROM; guarding them would be a cycle.
 *  - src/plan, src/trip, src/wallet — personal data; they touch no trail
 *    content at all (confirmed by the probe in draft PR #97 and re-asserted
 *    below), so there is nothing to guard.
 *  - src/utils, src/map — infrastructure BELOW the boundary (persistence,
 *    migration, map style). See the allowlist reasons below.
 */
const CONSUMER_DIRS = ['src/screens', 'src/components', 'src/store', 'src/hooks', 'src/navigation'];
/** The app entry points live at the src root and are consumers too. */
const CONSUMER_ROOT_FILES = ['src/App.tsx', 'src/main.tsx'];

/**
 * Application consumers that may still import a guarded module directly.
 *
 * Every entry needs a reason that is about DEPENDENCY, not convenience. This
 * list is meant to stay tiny; a stale entry fails its own test below.
 */
const ALLOWLIST = [
  {
    file: 'src/main.tsx',
    specifier: './route/routeData',
    reason:
      'DEV-only generator diagnostics behind import.meta.env.DEV. It reads ROUTE_DIAGNOSTICS — a build artefact of the GPX pipeline, not dossier content — and ships in no production bundle.',
  },
];

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/** Every production source file (declaration files are types, not code). */
function productionFiles(dir = 'src', out = []) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = posix.join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) {
      productionFiles(rel, out);
    } else if (/\.(mjs|ts|tsx)$/.test(entry) && !entry.endsWith('.d.mts')) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * The module specifiers a file imports, with the names it takes from each.
 *
 * Deliberately statement-level and anchored at line start: it reads import and
 * re-export statements only, never JSX, never a whole source block, so
 * reformatting a component cannot make this test lie.
 */
function importsOf(file) {
  const src = code(file);
  const found = [];
  const add = (clause, specifier) => {
    const names = (clause.match(/\{([\s\S]*?)\}/)?.[1] ?? '')
      .split(',')
      .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    found.push({ specifier, names, statement: `${clause} from '${specifier}'` });
  };
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s*from\s*'([^']+)';/gm)) add(m[1], m[2]);
  for (const m of src.matchAll(/^export\s+((?:type\s+)?\{[\s\S]*?\})\s*from\s*'([^']+)';/gm)) {
    add(m[1], m[2]);
  }
  for (const m of src.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)) add('', m[1]);
  return found;
}

/** An import specifier as a path under src/, or null when it leaves src/. */
function resolveUnderSrc(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = posix.normalize(posix.join(posix.dirname(file), specifier));
  if (!resolved.startsWith('src/')) return null;
  return resolved.slice('src/'.length);
}

/** Files under the enforced application-consumer scope. */
function consumerFiles() {
  const out = [...CONSUMER_ROOT_FILES];
  for (const dir of CONSUMER_DIRS) out.push(...productionFiles(dir));
  return out;
}

const isAllowed = (file, specifier) =>
  ALLOWLIST.some((a) => a.file === file && a.specifier === specifier);

// ---------------------------------------------------------------------------
// The boundary is the authority — it names content, it does not restate it
// ---------------------------------------------------------------------------

test('the boundary imports the metadata authority instead of restating it', () => {
  const src = source(BOUNDARY);
  assert.match(src, /import \{[^}]*TRAIL_CONTENT[^}]*\} from '\.\.\/data\/trailMetadata\.mjs'/);
  assert.match(src, /metadata: TRAIL_CONTENT,/, 'the descriptor points at the authority');

  // The three identity facts exist nowhere in this file as literals: they can
  // only arrive through that import.
  const body = code(BOUNDARY);
  assert.ok(!body.includes(ACTIVE_TRAIL_ID), 'the trail id is not restated');
  assert.ok(!body.includes(TRAIL_CONTENT.name), 'the dossier name is not restated');
  assert.ok(!/\bcontentVersion\s*[:=]/.test(body), 'the content version is not restated');
  assert.ok(
    !/ACTIVE_TRAIL_ID|trailId\s*[:=]/.test(body),
    'identity reaches the boundary only as part of the metadata object',
  );
});

test('the boundary defines no content of its own — only references', () => {
  const body = code(BOUNDARY);

  // Every string literal in this file is an import specifier. No id, no name,
  // no label, no URL, no date can be introduced here.
  const strings = body.match(/'[^']*'/g) ?? [];
  const nonSpecifiers = strings.filter((s) => !s.startsWith("'../"));
  assert.deepEqual(nonSpecifiers, [], 'a boundary that writes content is a second source of truth');

  // And no numbers: a distance, a version or a count would be a copy.
  assert.ok(!/[:=]\s*-?\d/.test(body), 'no numeric literals — nothing is measured here');
});

test('the boundary re-exports by reference — it wraps, reshapes and filters nothing', () => {
  const body = code(BOUNDARY);
  assert.ok(!/=>/.test(body), 'no arrow functions: nothing is adapted on the way through');
  assert.ok(!/\bfunction\b/.test(body), 'no function declarations');
  assert.ok(!/\.(map|filter|slice|concat|reduce|sort)\(/.test(body), 'no derived collections');
  assert.ok(!/\bstructuredClone\b|\.\.\./.test(body), 'nothing is copied or spread');
});

test('the top-level descriptor and its categories are frozen', () => {
  const body = code(BOUNDARY);
  assert.match(body, /export const ACTIVE_TRAIL_CONTENT = Object\.freeze\(\{/);

  // Each category is frozen too, so a category cannot be swapped at runtime.
  // `metadata` is the exception: it IS the already-frozen authority object,
  // which the behavioural assertion below proves rather than assumes.
  const categories = [...body.matchAll(/^ {2}(\w+): (Object\.freeze\(\{|TRAIL_CONTENT,)/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    categories,
    ['metadata', 'route', 'places', 'editorial', 'logistics', 'sources'],
    'the dossier is grouped by the question each category answers',
  );
  assert.ok(Object.isFrozen(TRAIL_CONTENT), 'the metadata category is a frozen authority');
});

test('the boundary knows nothing about walking direction or personal state', () => {
  const body = code(BOUNDARY);
  for (const forbidden of [
    'direction',
    'itinerary',
    'PersistentState',
    'dayPlan',
    'tripItem',
    'wallet',
    'packing',
    'journal',
    'localStorage',
    'SCHEMA_VERSION',
    'APP_VERSION',
    'pmtiles',
  ]) {
    assert.ok(
      !new RegExp(forbidden, 'i').test(body),
      `${forbidden} is a different owner's concern and must not reach the dossier`,
    );
  }
});

// ---------------------------------------------------------------------------
// Completeness — the categories a Guide will need are actually reachable
//
// Pinned as CATEGORIES sourced from the right authority, not as serialised
// objects: the point is that Guide never has to bypass the boundary, not that
// today's records never change.
// ---------------------------------------------------------------------------

test('every curated content category is reachable through the boundary', () => {
  const imported = new Set(
    importsOf(BOUNDARY)
      .map((i) => resolveUnderSrc(BOUNDARY, i.specifier))
      .filter(Boolean),
  );

  for (const [module, what] of GUARDED) {
    // experienceRoutes and waypointStops are reached through the modules that
    // own them (routeExperiences, routeData) — a boundary that imported them
    // twice would create a second path to the same data.
    if (module === 'data/experienceRoutes' || module === 'route/waypointStops.mjs') continue;
    assert.ok(imported.has(module), `${what} (${module}) is not reachable through the boundary`);
  }
  assert.ok(imported.has(ATTRIBUTION), 'trail-scoped sources are reachable');
});

test('the descriptor exposes route, places, editorial, logistics and sources', () => {
  const body = code(BOUNDARY);
  const required = {
    route: ['canonical', 'statistics', 'stages', 'stagesById', 'topology', 'waypoints'],
    places: ['stops', 'stopsById', 'offRoute'],
    editorial: ['stageGuides', 'stageEditorial', 'stageHighlightIds', 'experiences'],
    logistics: ['shops', 'transport'],
    sources: ['data', 'tripInfo'],
  };
  for (const [category, fields] of Object.entries(required)) {
    const block = body.match(new RegExp(`${category}: Object\\.freeze\\(\\{([\\s\\S]*?)\\n {2}\\}\\)`));
    assert.ok(block, `the ${category} category exists`);
    for (const field of fields) {
      assert.match(block[1], new RegExp(`\\b${field}:`), `${category}.${field} is exposed`);
    }
  }
});

test('the aggregated .mjs content is real, non-empty and internally consistent', () => {
  // The half node can execute. Not a duplicate of the per-module suites — this
  // asserts the boundary aggregates POPULATED categories, so "reachable" is
  // not satisfied by an empty collection.
  const collections = {
    'off-route places': OFF_ROUTE_PLACES,
    'stage guides': Object.values(STAGE_GUIDES),
    'stage editorial': Object.values(STAGE_EDITORIAL),
    'highlight types': Object.values(HIGHLIGHT_TYPES),
    shops: SHOP_LOCATIONS,
    transport: TRANSPORT_ENTRIES,
  };
  for (const [what, items] of Object.entries(collections)) {
    assert.ok(Array.isArray(items) && items.length > 0, `${what} is a non-empty collection`);
  }

  const ids = OFF_ROUTE_PLACES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'off-route place ids are unique');
  const transportIds = TRANSPORT_ENTRIES.map((e) => e.id);
  assert.equal(new Set(transportIds).size, transportIds.length, 'transport ids are unique');

  // Editorial and highlights are keyed by the same stage ids — a Guide reading
  // both through the boundary gets matching keys.
  const editorialStages = Object.keys(STAGE_EDITORIAL).sort();
  const highlightStages = Object.keys(STAGE_HIGHLIGHT_IDS).sort();
  assert.deepEqual(highlightStages, editorialStages, 'stage keys match across categories');
});

// ---------------------------------------------------------------------------
// Enforcement — application consumers cannot bypass the boundary
// ---------------------------------------------------------------------------

test('no application consumer imports a guarded content module directly', () => {
  const violations = [];
  for (const file of consumerFiles()) {
    if (file === BOUNDARY) continue;
    for (const { specifier } of importsOf(file)) {
      const target = resolveUnderSrc(file, specifier);
      if (!target || !GUARDED.has(target)) continue;
      if (isAllowed(file, specifier)) continue;
      violations.push(`${file} imports '${specifier}' (${GUARDED.get(target)})`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `use src/trail/activeTrailContent.ts instead:\n  ${violations.join('\n  ')}`,
  );
});

test('no application consumer reads trail-scoped sources from the mixed registry', () => {
  const violations = [];
  for (const file of consumerFiles()) {
    for (const { specifier, names } of importsOf(file)) {
      if (resolveUnderSrc(file, specifier) !== ATTRIBUTION) continue;
      for (const name of names) {
        if (TRAIL_SCOPED_ATTRIBUTION.includes(name)) violations.push(`${file} imports ${name}`);
      }
    }
  }
  assert.deepEqual(violations, [], 'trail sources belong to the dossier, not to app credits');
});

test('a new direct import would fail this test — the rule is not decorative', () => {
  // Proves the detector actually fires, using a file that does not exist so
  // nothing on disk has to be broken to prove the fence works.
  const pretend = (specifier) =>
    GUARDED.has(resolveUnderSrc('src/screens/Pretend.tsx', specifier));
  assert.ok(pretend('../data/stops'), 'a plain content import is caught');
  assert.ok(pretend('../data/shops.mjs'), 'an .mjs content import is caught');
  assert.ok(pretend('../route/routeData'), 'a route import is caught');
  assert.ok(!pretend('../trail/activeTrailContent'), 'the boundary itself is allowed');
  assert.ok(!pretend('../utils/format'), 'unrelated modules are untouched');
});

test('every allowlisted exception is real, single-file and explained', () => {
  for (const { file, specifier, reason } of ALLOWLIST) {
    assert.ok(
      importsOf(file).some((i) => i.specifier === specifier),
      `stale allowlist entry: ${file} no longer imports '${specifier}'`,
    );
    assert.ok(reason.length > 40, `${file} needs a dependency reason, not a note`);
  }
  assert.ok(ALLOWLIST.length <= 3, 'the allowlist is an exception list, not a second boundary');
});

// ---------------------------------------------------------------------------
// One boundary, one direction
// ---------------------------------------------------------------------------

test('nothing below the boundary imports it — the dependency direction holds', () => {
  const below = productionFiles().filter((f) =>
    /^src\/(data|route|plan|trip|wallet|utils|map|types)\//.test(f),
  );
  for (const file of below) {
    for (const { specifier } of importsOf(file)) {
      assert.notEqual(
        resolveUnderSrc(file, specifier),
        'trail/activeTrailContent',
        `${file} imports the boundary — content and derivation sit BELOW it`,
      );
    }
  }
});

test('there is exactly one application-facing content aggregator', () => {
  // Anything outside the content/derivation layers that pulls together two or
  // more guarded modules is a competing boundary.
  const aggregators = [];
  for (const file of productionFiles()) {
    if (/^src\/(data|route)\//.test(file)) continue;
    const guarded = new Set(
      importsOf(file)
        .map((i) => resolveUnderSrc(file, i.specifier))
        .filter((t) => t && GUARDED.has(t)),
    );
    if (guarded.size >= 2) aggregators.push(file);
  }
  assert.deepEqual(aggregators, [BOUNDARY], 'one file is the public application boundary');

  assert.deepEqual(
    readdirSync(join(ROOT, 'src/trail')),
    ['activeTrailContent.ts'],
    'src/trail holds the boundary and nothing else',
  );
});

test('the boundary is one active trail, not a trail platform', () => {
  const body = code(BOUNDARY);
  for (const shape of [
    'registry',
    'catalog',
    'trailPack',
    'loadTrail',
    'selectTrail',
    'setActiveTrail',
    'TRAILS',
    'async',
    'await',
    'fetch',
  ]) {
    assert.ok(!new RegExp(`\\b${shape}\\b`, 'i').test(body), `no ${shape}: one compile-time trail`);
  }
  // A second trail would show up as a second route dataset in the bundle.
  const generated = readdirSync(join(ROOT, 'src/generated')).filter((f) => f.endsWith('.json'));
  assert.deepEqual(
    generated.sort(),
    ['experience-geometry.json', 'kungsleden-route.json'],
    'one route dataset ships',
  );
});

// ---------------------------------------------------------------------------
// Deliberate exclusions — what the dossier is NOT
// ---------------------------------------------------------------------------

test('the packing seed stays outside the boundary, and that is documented', () => {
  const body = code(BOUNDARY);
  assert.ok(!body.includes('packingSeed'), 'the seed is not aggregated');
  assert.match(
    source(BOUNDARY),
    /PACKING SEED[\s\S]*?stays out/,
    'the exclusion is explained where a reader would look for the category',
  );
  // It mixes generic gear with trail-specific items; separating those is
  // editorial work, so Lists keeps reading it directly for now.
  assert.ok(
    importsOf('src/screens/ListsScreen.tsx').some((i) => i.specifier.includes('packingSeed')),
    'and the current consumer is unchanged by this boundary',
  );
});

test('app-scoped credits stay app-scoped', () => {
  const body = code(BOUNDARY);
  for (const appScoped of [
    'SOFTWARE_CREDITS',
    'APP_DATA_SOURCES',
    'BASEMAP_SOURCE_INFO',
    'SATELLITE_SOURCE_INFO',
    'TERRAIN_SOURCE_INFO',
    'REPOSITORY_URL',
  ]) {
    assert.ok(!body.includes(appScoped), `${appScoped} answers a question about the software`);
  }
  // The map style reads them straight from the registry, as it should.
  assert.ok(
    importsOf('src/map/mapStyle.ts').some((i) => i.specifier.includes('attribution')),
    'the map keeps its own credit path',
  );
});

test('personal-data modules still touch no trail content', () => {
  // The second-route probe (draft PR #97) found src/plan, src/trip and
  // src/wallet needed no change. This keeps that separation true.
  const personal = productionFiles().filter((f) => /^src\/(plan|trip|wallet)\//.test(f));
  assert.ok(personal.length > 0, 'the personal core exists');
  for (const file of personal) {
    for (const { specifier } of importsOf(file)) {
      const target = resolveUnderSrc(file, specifier);
      assert.ok(
        !target || !GUARDED.has(target),
        `${file} imports trail content '${specifier}' — personal data must stay independent`,
      );
    }
  }
});

test('persistence and migration keep their narrow, direct dependencies', () => {
  // Deliberately NOT routed through the boundary: storage builds default
  // personal state from stage topology, and stateMigration.mjs checks the
  // trail id on the state envelope. Both sit below an application-facing
  // boundary, and stateMigration.mjs is plain .mjs that could not import a
  // TypeScript module at all.
  assert.ok(
    importsOf('src/utils/storage.ts').some((i) => i.specifier === '../data/stages'),
    'storage reads the stage topology it needs, and nothing more',
  );
  assert.ok(
    importsOf('src/utils/stateMigration.mjs').some((i) => i.specifier === '../data/trailIdentity.mjs'),
    'migration reads identity, which is not dossier content',
  );
  assert.ok(
    !code('src/utils/stateMigration.mjs').includes('activeTrailContent'),
    'and neither reaches for the dossier',
  );
});

// ---------------------------------------------------------------------------
// Behaviour neutrality
// ---------------------------------------------------------------------------

test('this boundary changed imports only — no consumer gained or lost a name', () => {
  // Every name a consumer takes from the boundary must be a name the boundary
  // actually exports; a typo or a quietly renamed symbol fails here as well as
  // in the type checker.
  const exported = new Set();
  const body = code(BOUNDARY);
  for (const block of body.matchAll(/^export (?:type )?\{([\s\S]*?)\}/gm)) {
    for (const name of block[1].split(',')) {
      const clean = name.trim().replace(/^type\s+/, '');
      if (clean) exported.add(clean);
    }
  }
  exported.add('ACTIVE_TRAIL_CONTENT');
  exported.add('ActiveTrailContent');

  const missing = [];
  for (const file of consumerFiles()) {
    for (const { specifier, names } of importsOf(file)) {
      if (resolveUnderSrc(file, specifier) !== 'trail/activeTrailContent') continue;
      for (const name of names) if (!exported.has(name)) missing.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], 'every consumed name is exported by the boundary');
});
