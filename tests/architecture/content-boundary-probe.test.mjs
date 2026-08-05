/**
 * SECOND-ROUTE ARCHITECTURE PROBE — personal core, direction, content access
 * and persistence (hypotheses H3, H6, H7, H8).
 *
 * Companion to second-route-probe.test.mjs. Same rules: no production file was
 * changed to make any of this pass, and tests whose names start with "BROKE:"
 * characterise behaviour that is wrong for a multi-trail world rather than
 * behaviour that should be preserved.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KUNGSLEDEN_TOPOLOGY,
  buildProbeRoute,
  probeTopology,
} from '../helpers/secondRouteFixture.mjs';

import {
  DEFAULT_DIRECTION,
  ROUTE_DIRECTIONS,
  isRouteDirection,
  isReversed,
  normalizeDirection,
} from '../../src/route/direction.mjs';
import { createDayPlan } from '../../src/plan/dayPlan.mjs';
import { dayPlanCoverageDiagnostics } from '../../src/plan/coverageDiagnostics.mjs';
import { SCHEMA_VERSION, defaultState, normalizeState } from '../../src/utils/stateMigration.mjs';
import {
  TRIP_STAY_TYPES,
  TRIP_TRANSPORT_MODES,
  normalizeTripItem,
  normalizeTripItems,
  tripPlanSummary,
} from '../../src/trip/tripModel.mjs';
import {
  WALLET_CATEGORIES,
  normalizeWalletDocument,
  sortWalletDocuments,
} from '../../src/wallet/walletModel.mjs';
import { packingSummary } from '../../src/utils/packingModel.mjs';
import { PACKING_CATEGORIES } from '../../src/data/packingSeed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROBE = buildProbeRoute();
const PROBE_TOPOLOGY = probeTopology(PROBE.data);

// ---------------------------------------------------------------------------
// H3 — Is the personal core really trail-agnostic?
// ---------------------------------------------------------------------------

test('H3 HELD: src/plan/* needs no change — topology is injected everywhere', () => {
  // Already exercised in depth by second-route-probe.test.mjs; asserted here
  // as the H3 verdict itself: a full plan lifecycle on a foreign trail.
  const plan = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY);
  assert.ok(plan && plan.days.length === 3);
  const diagnostics = dayPlanCoverageDiagnostics(
    plan.days,
    'abisko-to-nikkaluokta',
    PROBE_TOPOLOGY,
  );
  assert.deepEqual(diagnostics.missingStageIds, []);
});

test('H3 HELD: src/trip/* is trail-agnostic and preserves foreign place links', () => {
  const transport = normalizeTripItem({
    id: 'trip_probe_1',
    kind: 'transport',
    title: 'Train to Delft',
    mode: 'train',
    date: '2026-08-09',
    status: 'confirmed',
  });
  assert.equal(transport.mode, 'train');

  // A Stay linked to a place id that exists ONLY on the probe trail.
  const stay = normalizeTripItem({
    id: 'trip_probe_2',
    kind: 'stay',
    title: 'Hostel Delft',
    stayType: 'hotel-hostel',
    checkInDate: '2026-08-10',
    checkOutDate: '2026-08-11',
    linkedPlaceId: 'via-1',
    status: 'confirmed',
  });
  assert.equal(stay.linkedPlaceId, 'via-1', 'a foreign place id survives verbatim');

  const items = normalizeTripItems([transport, stay]);
  assert.equal(items.length, 2);
  assert.deepEqual(tripPlanSummary(items), {
    total: 2,
    travelCount: 1,
    stayCount: 1,
    needed: 0,
    planned: 0,
    confirmed: 2,
  });
});

test('H3 HELD: src/wallet/* has no route coupling at all', () => {
  const doc = normalizeWalletDocument({
    id: 'doc_probe_1',
    title: 'NS ticket',
    category: 'route-reference',
    fileName: 'ticket.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    addedAt: 1,
  });
  assert.ok(doc);
  assert.equal(sortWalletDocuments([doc]).length, 1);
  // No wallet API takes a route, stage, stop or trail argument.
  assert.equal('trailId' in doc, false);
});

test('H3 HELD: packing is category-driven, not route-driven', () => {
  const summary = packingSummary([
    { id: 'p1', name: 'Tent', categoryId: 'sleep', status: 'packed', quantity: 1 },
    { id: 'p2', name: 'Map', categoryId: 'navigation-safety', status: 'todo', quantity: 1 },
  ]);
  assert.ok(summary.total >= 2);
  assert.ok(PACKING_CATEGORIES.length > 0);
});

test('H3 KNOWN LIMITATION: STF vocabulary leaks, but always with an escape hatch', () => {
  // Kungsleden/STF-shaped taxonomies exist in personal data…
  assert.ok(TRIP_STAY_TYPES.some((t) => t.id === 'mountain-hut'));
  assert.ok(TRIP_STAY_TYPES.some((t) => t.id === 'mountain-station'));
  assert.ok(WALLET_CATEGORIES.some((c) => c.id === 'route-reference'));

  // …but an unknown value degrades to 'other' rather than being rejected, so
  // a second trail is not BLOCKED by the vocabulary — only described poorly.
  const stay = normalizeTripItem({
    id: 'trip_probe_3',
    kind: 'stay',
    title: 'Campsite',
    stayType: 'campsite',
    checkInDate: '2026-08-10',
  });
  assert.equal(stay.stayType, 'other', 'unknown stay types degrade, never fail');
  assert.ok(TRIP_TRANSPORT_MODES.some((m) => m.id === 'other'));
});

test('H3 BROKE: the personal blob has no trail identity — a foreign plan is silently adopted', () => {
  // Build a plan on the probe trail and persist it in the normal v10 shape.
  const probePlan = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY);
  const stored = { ...defaultState('d1'), dayPlan: probePlan };

  // Normalising against ITS OWN topology works — that is H3's positive half.
  const own = normalizeState(stored, 'd1', PROBE_TOPOLOGY);
  assert.equal(own.dayPlan.days.length, 3);

  // Normalising the SAME blob against KUNGSLEDEN topology also "works": every
  // leg survives and now means a different physical segment on another trail.
  const swapped = normalizeState(stored, 'd1', KUNGSLEDEN_TOPOLOGY);
  assert.equal(swapped.dayPlan.days.length, 3, 'the foreign plan is fully adopted');
  assert.deepEqual(
    swapped.dayPlan.days.flatMap((d) => d.activities.flatMap((a) => a.legs ?? [])).map((l) => l.stageId),
    ['d1', 'd2', 'd3'],
    'and its legs now point at Kungsleden d1/d2/d3',
  );

  // There is no field anywhere in the persisted shape that could detect this.
  assert.equal('trailId' in stored, false);
  assert.equal('contentVersion' in stored, false);
  assert.equal(SCHEMA_VERSION, 10);

  // src/utils/stateMigration.mjs itself needs NO change to PROCESS the probe
  // trail; what is missing is an identity to check BEFORE applying topology.
});

// ---------------------------------------------------------------------------
// H6 — Direction is config, not a universal core concept
// ---------------------------------------------------------------------------

test('H6 KNOWN LIMITATION: the direction enum is Kungsleden endpoints (not re-litigated)', () => {
  assert.deepEqual(ROUTE_DIRECTIONS, ['abisko-to-nikkaluokta', 'nikkaluokta-to-abisko']);
  assert.equal(DEFAULT_DIRECTION, 'abisko-to-nikkaluokta');
});

test('H6 BROKE: a foreign direction value is silently coerced, never rejected', () => {
  // This is the NEW finding — not that the literals are Kungsleden-specific
  // (already known), but that the normaliser cannot signal a mismatch. A
  // second trail's own vocabulary is swallowed and reinterpreted as forward.
  for (const foreign of ['start-to-finish', 'delft-probe-forward', 'south-to-north', '']) {
    assert.equal(isRouteDirection(foreign), false);
    assert.equal(normalizeDirection(foreign), DEFAULT_DIRECTION, `${foreign} coerced`);
    assert.equal(isReversed(foreign), false, `${foreign} silently treated as forward`);
  }
  // The fallback is correct and deliberate for Kungsleden (a corrupt blob must
  // load), but it means direction cannot carry per-trail meaning without a
  // change to src/route/direction.mjs.
});

test('H6 HELD: planning modules only need ORDERING, and treat direction opaquely', () => {
  // dayPlan/coverage consume direction solely through isReversed() — they
  // never compare it to a literal. Both directions produce coherent plans on
  // the probe trail, which is what "only ordering is needed" means.
  const forward = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY);
  const reverse = createDayPlan('nikkaluokta-to-abisko', '2026-08-10', PROBE_TOPOLOGY);

  const forwardLegs = forward.days.flatMap((d) =>
    d.activities.flatMap((a) => a.legs ?? []),
  );
  const reverseLegs = reverse.days.flatMap((d) =>
    d.activities.flatMap((a) => a.legs ?? []),
  );
  assert.deepEqual(forwardLegs.map((l) => l.stageId), ['d1', 'd2', 'd3']);
  assert.deepEqual(reverseLegs.map((l) => l.stageId), ['d3', 'd2', 'd1']);
  assert.ok(reverseLegs.every((l) => l.orientation === 'opposite'));

  // A minimal future boundary therefore needs only: an ordered pair of
  // endpoints per trail + a reversed flag. NOT a generic direction model.
  const diagnostics = dayPlanCoverageDiagnostics(
    reverse.days,
    'nikkaluokta-to-abisko',
    PROBE_TOPOLOGY,
  );
  assert.deepEqual(diagnostics.missingStageIds, []);
});

// ---------------------------------------------------------------------------
// H7 — Content access could take one boundary
// ---------------------------------------------------------------------------

/** Every source file under src/, with its import specifiers. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (/\.(ts|tsx|mjs)$/.test(abs) && !/\.d\.mts$/.test(abs)) out.push(abs);
    }
  };
  walk(join(ROOT, 'src'));
  return out.map((abs) => ({
    path: relative(ROOT, abs),
    text: readFileSync(abs, 'utf8'),
  }));
}

/** Modules that ARE the trail dossier — the content a second trail replaces. */
const CONTENT_MODULES = [
  'src/route/routeData',
  'src/route/waypointStops',
  'src/data/stages',
  'src/data/stops',
  'src/data/stageGuides',
  'src/data/stageHighlights',
  'src/data/stageEditorial',
  'src/data/shops',
  'src/data/transport',
  'src/data/journeyPlaces',
  'src/data/attribution',
  'src/data/routeExperiences',
  'src/data/experienceRoutes',
];

test('H7 FINDING: trail content is reached by direct compile-time import, from many files', () => {
  const files = sourceFiles();
  const importers = new Map();

  for (const file of files) {
    for (const specifier of file.text.matchAll(/from\s+'([^']+)'/g)) {
      const target = specifier[1];
      const hit = CONTENT_MODULES.find((m) => target.endsWith(m.replace(/^src\//, '')) ||
        target.endsWith(m.split('/').pop()));
      if (!hit) continue;
      if (file.path.startsWith('src/data/') || file.path === `${hit}.ts`) continue;
      if (!importers.has(file.path)) importers.set(file.path, new Set());
      importers.get(file.path).add(hit);
    }
  }

  // The concrete size of the boundary problem. This is an inventory, not a
  // target: it is asserted loosely so it documents rather than freezes.
  assert.ok(importers.size >= 10, `expected a broad import surface, found ${importers.size}`);

  // And there is no single access point today: nothing named like a content
  // registry / trail content module exists.
  const hasRegistry = files.some((f) =>
    /src\/(content|trail)\//.test(f.path) ||
    /export\s+(const|function)\s+(trailContent|contentFor|loadTrail)/.test(f.text),
  );
  assert.equal(hasRegistry, false, 'there is no content access boundary today');
});

test('H7 HELD: both trails fit the SAME minimal content categories', () => {
  // A test-only register: what a minimal boundary would have to carry, filled
  // for both trails. Kungsleden fills every category; the probe trail fills
  // the structural ones and legitimately has none of the editorial ones.
  const kungsleden = JSON.parse(
    readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
  );

  const describe = (generated, places, editorial, logistics) => ({
    descriptor: { name: generated.name },
    topology: generated.stages.map((s) => s.id),
    places,
    editorial,
    logistics,
    source: { file: generated.sourceFile, sha256: generated.sourceSha256 },
    assets: { pmtiles: null },
  });

  const register = {
    kungsleden: describe(kungsleden, kungsleden.waypoints.length, true, true),
    'delft-probe': describe(PROBE.data, PROBE.data.waypoints.length, false, false),
  };

  for (const entry of Object.values(register)) {
    assert.ok(entry.descriptor.name);
    assert.ok(entry.topology.length > 0);
    assert.ok(entry.places > 0);
    assert.ok(entry.source.file && entry.source.sha256);
  }

  // The useful distinction the probe surfaces: editorial content should be an
  // OPTIONAL CAPABILITY, not empty data. A trail without guides is not a trail
  // with zero guides — the UI must be able to omit the section entirely.
  assert.equal(register.kungsleden.editorial, true);
  assert.equal(register['delft-probe'].editorial, false);
});

test('H7 FINDING: hydration is already generic, but lives in TypeScript', () => {
  // src/route/hydrate.ts is trail-agnostic by construction — its own docstring
  // says it is shared by the Kungsleden dataset AND the Delft pilot dataset,
  // and it still carries the MissingRouteStub type for optional routes.
  const hydrate = readFileSync(join(ROOT, 'src/route/hydrate.ts'), 'utf8');
  assert.match(hydrate, /Delft pilot dataset/);
  assert.match(hydrate, /MissingRouteStub/);
  assert.match(hydrate, /isMissingRouteStub/);

  // It is .ts, so the pure `node --test` layer every other core module is
  // tested at cannot reach it. That is why this probe needs a small shape
  // adapter — a structural gap in the test boundary, not a coupling.
  assert.equal(hydrate.includes('WAYPOINT_TO_HUT'), false, 'no Kungsleden coupling in hydration');
});

// ---------------------------------------------------------------------------
// H8 — Persistence is NOT validated by this probe
// ---------------------------------------------------------------------------

test('H8 INCONCLUSIVE BY DESIGN: this probe proves nothing about multi-trail persistence', () => {
  // Stated as an executable admission so it cannot be quietly forgotten.
  const notProven = [
    'migration of existing v10 data to any trail-scoped schema',
    'backward compatibility of exported files across app versions',
    'wallet document scoping (documents are trail-less today)',
    'switching the active trail with personal data already present',
    'holding more than one saved trip at a time',
    'behaviour when a trail pack is missing or partially downloaded',
    'contentVersion migrations when curated trail content changes',
  ];
  assert.equal(notProven.length, 7);

  // What the probe DID establish about persistence is only this: the current
  // blob has no trail identity, and normalizeState cannot detect a mismatch
  // (see the H3 BROKE test above). Everything else stays an open question for
  // the trailId foundation.
  const stored = defaultState('d1');
  assert.equal('trailId' in stored, false);
  assert.equal('contentVersion' in stored, false);
  assert.equal(stored.schemaVersion, SCHEMA_VERSION);
});

test('H8: the probe is inert — it imports no persistence layer and writes nothing', () => {
  // Guard the artifact structurally, by its IMPORT GRAPH rather than by raw
  // text (a text scan would match this test's own guard strings).
  const probeFiles = [
    'tests/architecture/second-route-probe.test.mjs',
    'tests/architecture/content-boundary-probe.test.mjs',
    'tests/helpers/secondRouteFixture.mjs',
  ];

  const forbidden = ['storage', 'walletStore', 'exportImport', 'fake-indexeddb'];
  for (const path of probeFiles) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.ok(
        !forbidden.some((f) => specifier.includes(f)),
        `${path} must not import ${specifier}`,
      );
    }
    // Only node:fs READ helpers are used; nothing in the probe writes a file.
    const fsImports = specifiers.filter((s) => s === 'node:fs');
    if (fsImports.length) {
      const named = text.match(/import\s+\{([^}]+)\}\s+from\s+'node:fs'/);
      for (const fn of named[1].split(',').map((s) => s.trim())) {
        assert.ok(/^(read|stat)/.test(fn), `${path} uses only read APIs, found ${fn}`);
      }
    }
  }
});
