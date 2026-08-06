/**
 * Source-link and citation integrity (content review PR-4).
 *
 * The 2026-08 dossier review found five STF source URLs that had died or
 * begun silently redirecting to generic hub pages — a working-looking link
 * that no longer supports its claim. This file pins the repairs:
 *
 *  - the legacy URLs may not return as active production sources
 *    (one KNOWN OPEN exception is pinned explicitly, see below);
 *  - each repaired consumer cites the page that was actually verified to
 *    carry its claim (d2 → Naturkartan BD26, d5 → BD38, d6 → BD40,
 *    d4 + the pass experiences → STF Signature Trail, Nallo → the STF Nallo
 *    cabin page, Tarfala → the Stockholm University research page);
 *  - the 1,150 m Tjäktjapasset figure is cited to STF, never to Wikipedia
 *    (whose article rounds the pass lower);
 *  - the Kebnekaise summit record carries a source for the climbing context
 *    AND a source for the measured elevation-change context;
 *  - the two optional boats are credited per operator (STF vs Enoks);
 *  - the Copernicus DEM licence link points at the official Data Space
 *    licence bundle and the mandatory modified-data notice is unchanged.
 *
 * External liveness is audited manually during content review — no test in
 * this file performs network I/O; TypeScript data files are checked as
 * source text (same pattern as trail-caveats.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GUIDE_SOURCES, STAGE_GUIDES } from '../src/data/stageGuides.mjs';
import { TRAIL_CAVEATS } from '../src/data/trailCaveats.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => readFileSync(join(root, rel), 'utf8');

const guides = source('src/data/stageGuides.mjs');
const experiences = source('src/data/routeExperiences.ts');
const attribution = source('src/data/attribution.ts');
const transport = source('src/data/transport.mjs');

/** The whole production content surface the five legacy URLs lived in. */
const PRODUCTION_SOURCES = { guides, experiences, attribution, transport };

/** Slice one curated record out of routeExperiences.ts by its id. */
function experienceRecord(id) {
  const ids = [...experiences.matchAll(/^    id: '([a-z0-9-]+)',$/gm)];
  const at = ids.findIndex((m) => m[1] === id);
  assert.ok(at >= 0, `experience ${id} exists`);
  const start = ids[at].index;
  const end = at + 1 < ids.length ? ids[at + 1].index : experiences.length;
  return experiences.slice(start, end);
}

// ---------------------------------------------------------------------------
// Legacy problem links
// ---------------------------------------------------------------------------

const LEGACY_URLS = [
  // Hard 404 — STF retired its trail-section pages.
  'https://www.swedishtouristassociation.com/trail-sections/tjaktja-salka/',
  // 200 but silently redirect to the generic /guides/trails/ hub.
  'https://www.swedishtouristassociation.com/guides/stages/stf-abiskojaure-stf-alesjaure/',
  'https://www.swedishtouristassociation.com/guides/stages/stf-salka-stf-singi/',
  'https://www.swedishtouristassociation.com/trail-sections/stf-singi-stf-kebnekaise/',
  // 200 but silently redirects to the generic /discover/?activities hub.
  'https://www.swedishtouristassociation.com/activities/kebnekaise-glacier-research-at-tarfala/',
];

test('four of the five legacy URLs are gone from every production source file', () => {
  for (const [name, text] of Object.entries(PRODUCTION_SOURCES)) {
    for (const url of LEGACY_URLS.slice(1)) {
      assert.ok(!text.includes(url), `${name} no longer cites ${url}`);
    }
  }
});

test('KNOWN OPEN: the dead Tjäktja–Sälka URL survives ONLY on tjaktja-moraine', () => {
  // No reachable authoritative page supports that record's moraine claim
  // (PR-4 checked STF Signature Trail, the STF Tjäktja cabin page, Wikipedia
  // Tjäktjapasset/Kungsleden and Swedish Wikipedia Tjäktjavagge). Rather
  // than fake support with a half-matching page, the record deliberately
  // keeps its dead citation until PR-7 re-sources or rewords it. This test
  // pins the exception to exactly one record so it cannot spread silently —
  // when PR-7 lands, drop this test and move the URL into the loop above.
  const dead = LEGACY_URLS[0];
  assert.ok(!guides.includes(dead), 'stage guides no longer cite the dead page');
  assert.ok(!attribution.includes(dead) && !transport.includes(dead));
  const uses = experiences.split(dead).length - 1;
  assert.equal(uses, 1, 'exactly one remaining use');
  assert.ok(
    experienceRecord('tjaktja-moraine').includes(dead),
    'and it is the documented tjaktja-moraine record',
  );
});

// ---------------------------------------------------------------------------
// Guide source resolution (d2 / d4 / d5 / d6)
// ---------------------------------------------------------------------------

test('every guide sourceId still resolves and no removed source id lingers', () => {
  for (const [id, g] of Object.entries(STAGE_GUIDES)) {
    for (const sid of g.sourceIds) {
      assert.ok(GUIDE_SOURCES[sid], `${id} source "${sid}" resolves`);
    }
  }
  for (const removed of [
    'stf-stage-abiskojaure-alesjaure',
    'stf-stage-tjaktja-salka',
    'stf-stage-salka-singi',
    'stf-stage-singi-kebnekaise',
  ]) {
    assert.equal(GUIDE_SOURCES[removed], undefined, `${removed} is deleted`);
    assert.ok(!guides.includes(`'${removed}'`), `nothing references ${removed}`);
  }
});

test('d2/d5/d6 cite their verified Naturkartan stage pages; d4 cites STF first', () => {
  assert.ok(STAGE_GUIDES.d2.sourceIds.includes('naturkartan-bd26'), 'd2 → BD26');
  assert.ok(STAGE_GUIDES.d5.sourceIds.includes('naturkartan-bd38'), 'd5 → BD38');
  assert.ok(STAGE_GUIDES.d6.sourceIds.includes('naturkartan-bd40'), 'd6 → BD40');
  for (const id of ['d2', 'd4', 'd5', 'd6']) {
    assert.ok(
      STAGE_GUIDES[id].sourceIds.includes('stf-kungsleden-abisko'),
      `${id} keeps STF's own day description (Signature Trail)`,
    );
  }
  // The 1,150 m / highest-point figure is STF's; Wikipedia rounds the pass
  // lower and must never be the leading source for that number.
  assert.equal(STAGE_GUIDES.d4.sourceIds[0], 'stf-kungsleden-abisko');
});

// ---------------------------------------------------------------------------
// Experience claim–citation contract
// ---------------------------------------------------------------------------

const BD26 = 'vandringsled-bd26-mellan-abiskojaure-och-alesjaure_e';
const BD38 = 'vandringsled-bd38-mellan-salka-och-singi';
const SIGNATURE = 'trails/signature-trail-kungsleden-abisko';

test('the repaired experiences cite the pages verified to carry their claims', () => {
  assert.ok(experienceRecord('treeline-transition').includes(BD26));
  assert.ok(experienceRecord('siellajohka-bridge').includes(BD26));
  assert.ok(experienceRecord('gaskkasjohka-bridges').includes(BD38));
  assert.ok(experienceRecord('tjaktja-pass-view').includes(SIGNATURE));
  assert.ok(experienceRecord('tjaktjavagge-descent').includes(SIGNATURE));
  assert.ok(
    experienceRecord('nallo-side-valley').includes(
      'facilities/stf-nallo-mountain-cabin',
    ),
    'Nallo cites the cabin operator page',
  );
});

test('the 1,150 m claim is cited to STF, not Wikipedia', () => {
  const record = experienceRecord('tjaktja-pass-view');
  assert.match(record, /according to STF/, 'the figure is attributed inline');
  assert.ok(record.includes(SIGNATURE), 'and sourced to the Signature Trail page');
  assert.ok(
    !record.includes('wikipedia.org'),
    'Wikipedia (which rounds the pass lower) is no longer cited for it',
  );
});

test('Tarfala research claims cite the research operator, not a tourism hub', () => {
  const record = experienceRecord('tarfala-valley');
  assert.ok(
    record.includes('https://www.su.se/english/divisions/tarfala-research-station/research'),
    'Stockholm University research page',
  );
  assert.ok(!record.includes('swedishtouristassociation.com'), 'no STF hub fallback');
});

test('Kebnekaise carries a climbing source AND an elevation-change source', () => {
  const record = experienceRecord('kebnekaise-summit-western');
  assert.ok(
    record.includes('guides/climbing-kebnekaise'),
    'STF climbing guide for ascent context',
  );
  assert.ok(record.includes('additionalSources'), 'a second source is declared');
  assert.ok(
    record.includes('https://en.wikipedia.org/wiki/Kebnekaise'),
    'a geographic/historical record for the measured change',
  );
  // The old wording overclaimed a fixed ranking; the honest version keeps
  // the seasonal/measurement variation the sources actually state.
  assert.ok(!record.includes('now the lower of the two'), 'no fixed-ranking overclaim');
  assert.match(record, /varies with season and snow/);
});

test('Nallo no longer claims a marked path the operator denies', () => {
  const record = experienceRecord('nallo-side-valley');
  assert.ok(!/well-marked/.test(record), 'the contradicted wording is gone');
  assert.match(record, /no marked trail/, 'the operator caveat is stated');
});

// ---------------------------------------------------------------------------
// Boat credit partition (TRIP_INFO_SOURCES)
// ---------------------------------------------------------------------------

test('the boat credit is split per operator and presented exactly once each', () => {
  assert.ok(!attribution.includes("name: 'Boats along the route'"), 'joint record gone');
  assert.ok(!attribution.includes('STF · Enoks'), 'no joint provider string');
  for (const name of ['Alesjaure–Abiskojaure boat', 'Láddjujávri boat']) {
    assert.equal(
      attribution.split(`name: '${name}'`).length - 1,
      1,
      `${name} is declared exactly once`,
    );
  }
  // Each record links its own operator.
  assert.ok(
    attribution.indexOf('guides/mountains/transport/boats') >
      attribution.indexOf("name: 'Alesjaure–Abiskojaure boat'"),
    'STF boat → STF boats page',
  );
  assert.ok(attribution.includes('https://www.enoks.se/en/boat-departures/'));
  // And the connectivity caveat still resolves both by exact name.
  assert.deepEqual(
    [...TRAIL_CAVEATS.connectivity.tripInfoSourceNames],
    ['Alesjaure–Abiskojaure boat', 'Láddjujávri boat'],
  );
});

// ---------------------------------------------------------------------------
// Copernicus DEM licence
// ---------------------------------------------------------------------------

test('the Copernicus licence link is the official Data Space bundle; the notice is intact', () => {
  assert.ok(
    !attribution.includes('spacedata.copernicus.eu'),
    'the unreachable spacedata host is gone',
  );
  assert.ok(
    attribution.includes(
      'https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf',
    ),
    'licence bundle linked from the official COP-DEM collection page',
  );
  // Article 6(b) of the GLO-30 licence mandates this exact notice — it must
  // never be shortened or lose DLR/Airbus/ESA.
  assert.ok(
    attribution.includes(
      'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
    ),
    'the mandatory modified-data notice is byte-identical',
  );
});
