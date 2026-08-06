/**
 * Standing operational trail caveats — navigation and connectivity.
 *
 * The contract these tests fence, from content review findings #1 and #32:
 *
 *  #1  Fjällkompis shows an offline topographic map, a GPS position, Locate
 *      me, live tracking and on/off-route feedback, and said nowhere that it
 *      is not a navigator. It must say so where the map is actually used to
 *      find the way — not only in credits, behind a source link, in a
 *      one-time onboarding or in a tooltip.
 *  #32 Several transport flows depend on a working phone (operator numbers,
 *      payment, booking, a live planner, "check the official source"), and
 *      STF's own boat page warns that mountain coverage can be limited. The
 *      caveat must reach the surface those flows live on.
 *
 * Both statements are TRAIL CONTENT: one authority defines them, the
 * application-facing boundary exposes them, and no component writes safety
 * copy of its own. Personal state is not involved at all — there is nothing
 * to store, migrate or dismiss.
 *
 * BEHAVIOURAL where node can execute the module (the caveats themselves, the
 * guide-source registry, personal state); STRUCTURAL where it cannot (the
 * TypeScript boundary, the four .tsx surfaces, attribution.ts). That split is
 * the convention this repo already uses — see trail-content-metadata.test.mjs
 * and active-trail-content.test.mjs. The repository has no DOM runner, so the
 * placement assertions below pin WHICH surface reads WHICH register from the
 * authority; they deliberately pin no JSX block, no element order and no CSS.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRAIL_CAVEATS } from '../src/data/trailCaveats.mjs';
import { GUIDE_SOURCES } from '../src/data/stageGuides.mjs';
import { TRAIL_CONTENT, trailDossierView } from '../src/data/trailMetadata.mjs';
import { defaultState } from '../src/utils/stateMigration.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (p) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Source with comments removed — what the module actually DOES.
 *
 * JSX comments (`{/* … *\/}`) are stripped braces and all, so a commented
 * rationale between two elements leaves no `{}` behind to break adjacency.
 */
const code = (p) =>
  source(p)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const AUTHORITY = 'src/data/trailCaveats.mjs';
const AUTHORITY_TYPES = 'src/data/trailCaveats.d.mts';
const BOUNDARY = 'src/trail/activeTrailContent.ts';

/** The four surfaces this PR places the caveats on, and which register each takes. */
const PLACEMENTS = [
  {
    file: 'src/screens/MapScreen.tsx',
    expression: 'TRAIL_CAVEATS.navigation.short',
    why: 'the map is read as an operational navigator',
  },
  {
    file: 'src/screens/StagesScreen.tsx',
    expression: 'TRAIL_CAVEATS.navigation.short',
    why: 'the shared stage-guide footer already qualifies its own guidance',
  },
  {
    file: 'src/screens/SettingsScreen.tsx',
    expression: 'TRAIL_CAVEATS.navigation.full',
    why: 'preparing offline maps is where the reasoning has room',
  },
  {
    file: 'src/components/TransportView.tsx',
    expression: 'TRAIL_CAVEATS.connectivity.short',
    why: 'the transport reference surface carries the coverage-dependent flows',
  },
  {
    file: 'src/components/TransportView.tsx',
    expression: 'TRAIL_CAVEATS.connectivity.full',
    why: 'and its existing context help explains why',
  },
];

const CAVEATS = Object.entries(TRAIL_CAVEATS);

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
// One authority for both caveats
// ---------------------------------------------------------------------------

test('both caveats exist, and exactly these two', () => {
  assert.deepEqual(
    Object.keys(TRAIL_CAVEATS),
    ['navigation', 'connectivity'],
    'findings #1 and #32 — this PR adds no third warning',
  );
});

test('exactly one production module defines caveat copy', () => {
  const hits = productionFiles().filter((f) => /\bTRAIL_CAVEATS\s*=/.test(source(f)));
  assert.deepEqual(hits, [AUTHORITY], 'no second, drifting definition');
});

test('the caveats are frozen — editorial content, not runtime state', () => {
  assert.ok(Object.isFrozen(TRAIL_CAVEATS));
  for (const [kind, caveat] of CAVEATS) {
    assert.ok(Object.isFrozen(caveat), `${kind} is frozen`);
    assert.ok(Object.isFrozen(caveat.guideSourceIds), `${kind} source ids are frozen`);
    assert.ok(Object.isFrozen(caveat.tripInfoSourceNames), `${kind} source names are frozen`);
  }

  const before = TRAIL_CAVEATS.navigation.short;
  try {
    TRAIL_CAVEATS.navigation.short = 'anything else';
  } catch {
    // Strict-mode modules throw; either way the value must not move.
  }
  assert.equal(TRAIL_CAVEATS.navigation.short, before);
});

test('the authority knows nothing about direction, plan or personal state', () => {
  const body = code(AUTHORITY);
  for (const forbidden of [
    'direction',
    'itinerary',
    'currentStage',
    'dayPlan',
    'localStorage',
    'SCHEMA_VERSION',
    'APP_VERSION',
    'dismiss',
  ]) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\b`, 'i').test(body),
      `${forbidden} would make a standing caveat conditional`,
    );
  }
  assert.ok(!/\bfunction\b|=>/.test(body), 'two records, no framework');
});

// ---------------------------------------------------------------------------
// The copy — two registers of one statement, and what it may not claim
// ---------------------------------------------------------------------------

test('each caveat has a short operational line and a fuller explanation', () => {
  for (const [kind, caveat] of CAVEATS) {
    for (const register of ['short', 'full']) {
      const text = caveat[register];
      assert.equal(typeof text, 'string', `${kind}.${register} is a string`);
      assert.equal(text, text.trim());
      assert.ok(text.length > 0, `${kind}.${register} is not empty`);
    }
    // "Short" has to survive a 320px map note and a guide footer; "full" has
    // to actually explain. Bounds, not exact copy — wording stays editorial.
    assert.ok(caveat.short.length <= 90, `${kind}.short stays one calm line`);
    assert.ok(
      caveat.full.length > caveat.short.length,
      `${kind}.full is the fuller register, not a duplicate`,
    );
    assert.notEqual(caveat.short, caveat.full);
  }
});

test('the navigation caveat says the app is an aid and names map and compass', () => {
  const { short, full } = TRAIL_CAVEATS.navigation;
  for (const [register, text] of [['short', short], ['full', full]]) {
    assert.match(text, /aid/i, `${register} frames the app as an aid`);
    assert.match(text, /\bmap\b/i, `${register} names the map`);
    assert.match(text, /compass/i, `${register} names the compass`);
    assert.match(text, /carry/i, `${register} asks the hiker to carry them`);
  }
  // The point of finding #1: the physical instruments are the primary ones.
  assert.match(full, /know how to use them/i, 'carrying them is not enough');
  assert.match(full, /primary/i, 'and they are the primary navigation');
});

test('the connectivity caveat hedges, and asks for offline preparation', () => {
  const { short, full } = TRAIL_CAVEATS.connectivity;
  for (const [register, text] of [['short', short], ['full', full]]) {
    assert.match(text, /coverage/i, `${register} names coverage`);
    assert.match(text, /\bcan be\b/i, `${register} states a possibility, never a fact`);
    assert.match(text, /offline/i, `${register} says what to do about it`);
  }
  assert.match(full, /tickets/i);
  assert.match(full, /timetables/i);
  // Close enough to the flows it qualifies to be operationally meaningful.
  assert.match(full, /call/i, 'phone calls are one dependency');
  assert.match(full, /Swish|payment/i, 'payment is another');
  assert.match(full, /live planner|link/i, 'and live links are a third');
});

test('no caveat overstates — it warns about a possibility, not a certainty', () => {
  const all = CAVEATS.flatMap(([, c]) => [c.short, c.full]).join(' | ');
  for (const overstatement of [
    /\bno coverage\b/i,
    /\bnever works?\b/i,
    /\bwill not work\b/i,
    /\bwon't work\b/i,
    /\bimpossible\b/i,
    /\bguaranteed\b/i,
    /\bnowhere\b/i,
    /\bunreachable\b/i,
    /\balways fails?\b/i,
  ]) {
    assert.doesNotMatch(all, overstatement, `an unsupported absolute claim: ${overstatement}`);
  }
  // No operator is singled out as offline: the dossier has no evidence for it.
  for (const operator of ['SJ', 'Enoks', 'Nikkaluoktaexpressen', 'Länstrafiken']) {
    assert.ok(!all.includes(operator), `${operator} is not named as unreachable`);
  }
});

test('the caveats read as guidance, not as a liability notice', () => {
  const all = CAVEATS.flatMap(([, c]) => [c.short, c.full]).join(' | ');
  for (const legalese of [
    /disclaimer/i,
    /liability|liable/i,
    /warranty|warrant/i,
    /at your own risk/i,
    /we accept no/i,
    /terms and conditions/i,
    /\bDANGER\b/,
    /\bWARNING\b/,
  ]) {
    assert.doesNotMatch(all, legalese, `alarming or legal framing: ${legalese}`);
  }
  assert.ok(!/[A-ZÅÄÖ]{4,}/.test(all), 'nothing is shouted in capitals');
  assert.ok(!all.includes('!'), 'and nothing is exclaimed');
});

// ---------------------------------------------------------------------------
// Provenance — existing registered sources, by reference
// ---------------------------------------------------------------------------

test('every guide-source reference resolves to a registered source with a link', () => {
  const referenced = CAVEATS.flatMap(([, c]) => c.guideSourceIds);
  assert.ok(referenced.length > 0, 'at least one caveat cites the guide registry');
  for (const id of referenced) {
    const entry = GUIDE_SOURCES[id];
    assert.ok(entry, `${id} is a registered guide source`);
    assert.ok(entry.label && entry.label.trim() !== '', `${id} has a label`);
    assert.match(entry.url, /^https:\/\//, `${id} keeps its link`);
  }
});

test('the navigation caveat rests on the trail sources already cited', () => {
  const { guideSourceIds } = TRAIL_CAVEATS.navigation;
  // The two source families the review named: STF's own Signature Trail page
  // and Naturkartan, both of which present their map as a planning tool.
  assert.ok(
    guideSourceIds.some((id) => GUIDE_SOURCES[id].url.includes('swedishtouristassociation.com')),
    'STF is cited',
  );
  assert.ok(
    guideSourceIds.some((id) => id.startsWith('naturkartan-')),
    'Naturkartan is cited',
  );
});

test('the connectivity caveat cites both registered boat sources', () => {
  const { tripInfoSourceNames } = TRAIL_CAVEATS.connectivity;
  // One record per operator (PR-4): the STF boat and the Enoks boat are
  // separate services with separate pages — a single shared credit could
  // present one operator's URL as evidence for the other's timetable.
  assert.deepEqual(
    [...tripInfoSourceNames],
    ['Alesjaure–Abiskojaure boat', 'Láddjujávri boat'],
  );

  // TRIP_INFO_SOURCES lives in TypeScript (src/data/attribution.ts), so the
  // reference is checked structurally: each record still exists, under that
  // exact name, still pointing at its own operator's page.
  const attribution = source('src/data/attribution.ts');
  for (const name of tripInfoSourceNames) {
    assert.ok(attribution.includes(`name: '${name}'`), `${name} is a registered trip-info source`);
  }
  assert.ok(
    attribution.includes(
      "sourceUrl: 'https://www.swedishtouristassociation.com/guides/mountains/transport/boats/'",
    ),
    'the STF boat keeps the STF link',
  );
  assert.ok(
    attribution.includes("sourceUrl: 'https://www.enoks.se/en/boat-departures/'"),
    'the Enoks boat links the Enoks page',
  );
});

test('the caveats add no source record and restate no source', () => {
  const body = code(AUTHORITY);
  assert.ok(!/https?:\/\//.test(body), 'no URL is copied — sources stay in their registries');
  assert.ok(!/\blastVerified\b|\d{4}-\d{2}-\d{2}/.test(body), 'and no verification date is claimed');
  assert.ok(
    !/GUIDE_SOURCES|TRIP_INFO_SOURCES|import\s/.test(body),
    'references are keys, so this module imports nothing and cannot cycle',
  );
});

// ---------------------------------------------------------------------------
// The application-facing boundary exposes them
// ---------------------------------------------------------------------------

test('the boundary imports the caveat authority instead of restating it', () => {
  const src = source(BOUNDARY);
  assert.match(src, /import \{ TRAIL_CAVEATS \} from '\.\.\/data\/trailCaveats\.mjs'/);
  assert.match(src, /caveats: TRAIL_CAVEATS,/, 'the descriptor points at the authority');
  assert.match(src, /^export \{ TRAIL_CAVEATS \};$/m, 'and named access exists for call sites');

  const body = code(BOUNDARY);
  for (const [kind, caveat] of CAVEATS) {
    assert.ok(!body.includes(caveat.short), `${kind}.short is not restated at the boundary`);
    assert.ok(!body.includes(caveat.full), `${kind}.full is not restated at the boundary`);
  }
});

test('the caveats are reachable as dossier content, beside the guides', () => {
  const body = code(BOUNDARY);
  const editorial = body.match(/editorial: Object\.freeze\(\{([\s\S]*?)\n {2}\}\)/);
  assert.ok(editorial, 'the editorial category exists');
  assert.match(editorial[1], /\bcaveats:/, 'a Guide finds them without bypassing the boundary');
  // And the dossier keeps the same six categories — this adds content, not a
  // second trail abstraction.
  const categories = [...body.matchAll(/^ {2}(\w+): (Object\.freeze\(\{|TRAIL_CONTENT,)/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(categories, ['metadata', 'route', 'places', 'editorial', 'logistics', 'sources']);
});

// ---------------------------------------------------------------------------
// Placement — each surface takes its register from the authority
// ---------------------------------------------------------------------------

test('every placement reads the caveat through the boundary', () => {
  for (const { file, expression, why } of PLACEMENTS) {
    const body = code(file);
    assert.ok(body.includes(expression), `${file} renders ${expression} — ${why}`);
    assert.match(
      body,
      /import \{[\s\S]*?TRAIL_CAVEATS[\s\S]*?\} from '\.\.\/trail\/activeTrailContent'/,
      `${file} reads it through the content boundary, not from the data module`,
    );
  }
});

test('the navigation caveat reaches the Map and the stage guide', () => {
  const placed = PLACEMENTS.filter((p) => p.expression.startsWith('TRAIL_CAVEATS.navigation'));
  const files = new Set(placed.map((p) => p.file));
  assert.ok(files.has('src/screens/MapScreen.tsx'), 'finding #1: the map surface');
  assert.ok(files.has('src/screens/StagesScreen.tsx'), 'finding #1: the stage guide context');
  assert.ok(files.has('src/screens/SettingsScreen.tsx'), 'finding #1: the fuller explanation');
});

test('the Map caveat is inline in the cockpit, not behind a modal', () => {
  const map = code('src/screens/MapScreen.tsx');
  const note = map.match(/<p className="map-note map-note--caveat">[\s\S]*?<\/p>/);
  assert.ok(note, 'the caveat is a map note in the cockpit');
  assert.ok(
    map.includes('{TRAIL_CAVEATS.navigation.short}'),
    'and it renders the authority string',
  );
  // Inline in the lead column beside the map's own notes — the Map surface
  // never puts it behind a dialog or a one-time prompt.
  for (const modal of ['ContextHelp', 'showModal', '<dialog']) {
    assert.ok(!map.includes(modal), `the map caveat is not behind ${modal}`);
  }
  // …and it is real text, not a hover tooltip on some control.
  assert.ok(
    !/title=\{[^}]*CAVEAT/i.test(map),
    'the caveat is rendered as text, never as a title attribute',
  );
});

test('the Map caveat appears whenever the map answers "where am I"', () => {
  const map = code('src/screens/MapScreen.tsx');
  // The gate is INTENT, not success: pressing Locate, holding a position, or
  // running a session. A denied or failed fix leaves geo.status on 'error',
  // so the caveat is still there beside the refusal it explains.
  assert.match(
    map,
    /const navigating =\s*tracking\.active \|\| geo\.status !== 'idle' \|\| marker != null;/,
    'the navigating gate covers Locate, a position, and live tracking',
  );
  assert.match(
    map,
    /\{navigating \? \(\s*<p className="map-note map-note--caveat">/,
    'and it is what guards the note',
  );
  const gate = map.match(/const navigating =([^;]*);/)[1];
  for (const success of ['lastFix', 'hasFix', 'coord', "'success'"]) {
    assert.ok(
      !gate.includes(success),
      `the gate must not depend on ${success} — a refused Locate is when it matters most`,
    );
  }
});

test('the idle Map keeps the overview fit it was tuned for', () => {
  // The lead column's measured depth IS the camera's top padding, and this
  // route's overview already spends its vertical budget (mapPadding.mjs). A
  // permanently rendered caveat costs ~58px of it and the bounded fit clamps
  // instead of zooming out, so "Fit route" stops containing the Abisko end.
  // The gate above is what keeps the planning view exactly as PR #100 left it.
  const map = code('src/screens/MapScreen.tsx');
  const element = '<p className="map-note map-note--caveat">';
  const guard = map.slice(0, map.indexOf(element)).trimEnd();
  assert.ok(
    guard.endsWith('{navigating ? ('),
    'the caveat is absent from the idle overview, so the fit keeps its budget',
  );

  // The planning surfaces state it with no condition at all, which is what
  // makes the Map's gate a placement choice rather than a hiding place.
  for (const [file, register] of [
    ['src/screens/StagesScreen.tsx', 'short'],
    ['src/screens/SettingsScreen.tsx', 'full'],
  ]) {
    const src = code(file);
    const before = src.slice(0, src.indexOf(`{TRAIL_CAVEATS.navigation.${register}}`)).trimEnd();
    assert.ok(
      !before.endsWith('(') && !before.endsWith('&&') && !before.endsWith('?'),
      `${file} states the caveat unconditionally`,
    );
  }
});

test('the Map caveat cannot swallow a map gesture', () => {
  // The cockpit sets pointer-events: none and re-enables it per child, so a
  // permanent overlay child needs its own opt-out or it becomes a dead zone
  // over the canvas for as long as the map is open.
  const css = source('src/styles/global.css');
  const rule = css.match(/\.map-note--caveat \{([\s\S]*?)\}/);
  assert.ok(rule, '.map-note--caveat is styled');
  assert.match(rule[1], /pointer-events:\s*none/, 'gestures pass through it');
  assert.ok(
    !/\.map-note--caveat[\s\S]{0,200}?position:\s*(absolute|fixed)/.test(css),
    'and it stays in the cockpit flow rather than floating over the canvas',
  );
});

test('the connectivity caveat reaches Transport in both registers', () => {
  const transport = code('src/components/TransportView.tsx');
  assert.ok(
    transport.includes('{TRAIL_CAVEATS.connectivity.short}'),
    'the reference surface carries the one-line caveat',
  );
  assert.ok(
    transport.includes('{TRAIL_CAVEATS.connectivity.full}'),
    'and the existing context help explains it',
  );
  // The short line sits on the surface itself, above the timetable sections —
  // not inside the ContextHelp dialog.
  const [beforeHelp] = transport.split('function TransportHelp');
  const [, afterHelp] = transport.split('export function TransportView');
  assert.ok(
    afterHelp.includes('{TRAIL_CAVEATS.connectivity.short}'),
    'the caveat is rendered by the view, not only by the help sheet',
  );
  assert.ok(
    !beforeHelp.includes('{TRAIL_CAVEATS.connectivity.full}'),
    'and the fuller register stays in the help',
  );
});

test('Settings shows the fuller trust context in an existing section', () => {
  const settings = code('src/screens/SettingsScreen.tsx');
  assert.ok(settings.includes('{TRAIL_CAVEATS.navigation.full}'));
  // Inside the existing Offline maps accordion — no new Settings section.
  const maps = settings.match(/id="maps"[\s\S]*?<\/SettingsAccordion>/);
  assert.ok(maps, 'the Offline maps section exists');
  assert.ok(
    maps[0].includes('{TRAIL_CAVEATS.navigation.full}'),
    'the caveat sits with the offline map it is about',
  );
  const sections = [...settings.matchAll(/<SettingsAccordion\b/g)].length;
  assert.equal(sections, 7, 'the same seven Settings sections as before this PR');
});

test('the caveat is not left to credits, a source link or an onboarding', () => {
  // Finding #1 explicitly rejects those as the only home. The credits sheet is
  // untouched by this PR, and nothing gated the caveat on a first run.
  const credits = source('src/components/CreditsSheet.tsx');
  assert.ok(!credits.includes('TRAIL_CAVEATS'), 'credits is not the caveat surface');
  for (const file of productionFiles()) {
    if (!code(file).includes('TRAIL_CAVEATS')) continue;
    assert.ok(
      !/onboard|firstRun|hasSeen|seenCaveat|tooltip/i.test(code(file)),
      `${file} shows the caveat every time, not once`,
    );
  }
});

test('no component restates the copy — the authority is the only writer', () => {
  const offenders = [];
  for (const file of productionFiles()) {
    if (file === AUTHORITY) continue;
    const src = source(file);
    for (const [kind, caveat] of CAVEATS) {
      for (const register of ['short', 'full']) {
        if (src.includes(caveat[register])) offenders.push(`${file} restates ${kind}.${register}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `copy belongs to ${AUTHORITY}:\n  ${offenders.join('\n  ')}`);

  // The type declaration describes the shape; it must not carry the copy either.
  for (const [, caveat] of CAVEATS) {
    assert.ok(!source(AUTHORITY_TYPES).includes(caveat.short));
    assert.ok(!source(AUTHORITY_TYPES).includes(caveat.full));
  }
});

// ---------------------------------------------------------------------------
// Exclusions — the caveats are content, and they stay content
// ---------------------------------------------------------------------------

test('personal state carries no caveat, and no dismissal of one', () => {
  const state = defaultState('d1');
  const serialised = JSON.stringify(state);
  for (const [kind, caveat] of CAVEATS) {
    assert.ok(!serialised.includes(caveat.short), `${kind}.short is not personal data`);
    assert.ok(!serialised.includes(caveat.full), `${kind}.full is not personal data`);
  }
  for (const key of Object.keys(state)) {
    assert.ok(
      !/caveat|warning|acknowledg|dismiss/i.test(key),
      `personal state gained "${key}" — a standing caveat is not acknowledged away`,
    );
  }
});

test('nothing persists, migrates or exports the caveats', () => {
  for (const file of [
    'src/utils/stateMigration.mjs',
    'src/utils/storage.ts',
    'src/utils/exportImport.ts',
  ]) {
    const body = code(file);
    assert.ok(!body.includes('TRAIL_CAVEATS'), `${file} does not read the caveats`);
    assert.ok(!body.includes('trailCaveats'), `${file} does not import the authority`);
  }
});

test('this PR publishes no new dossier edition and claims no review date', () => {
  assert.equal(TRAIL_CONTENT.contentVersion, 1, 'the correction cycle is still running');
  assert.equal(
    TRAIL_CONTENT.lastFullyReviewedOn,
    undefined,
    'a whole-dossier review has still not happened',
  );
  assert.equal(trailDossierView().fullyReviewedOn, null);
});
