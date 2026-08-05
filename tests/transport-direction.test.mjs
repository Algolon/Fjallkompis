/**
 * Transport follows the walking direction.
 *
 * The route is walked both ways, so the transport reference has to work both
 * ways. Before this, "Getting to the trail" always meant Kiruna → Abisko and
 * "Leaving the trail" always meant Nikkaluokta → Kiruna — correct for a hiker
 * walking south, and quietly the wrong half of the journey for one walking
 * north, who would have had to work out for themselves that neither section
 * was about their trip.
 *
 * What these tests hold in place:
 *  - every entry is ONE real operator direction, transcribed from the table
 *    for that direction — never a forward list read backwards;
 *  - the personal walking direction picks whole entries, in a pure selector;
 *  - a service is never silently dropped, and never shown under a label that
 *    belongs to the other direction;
 *  - an unknown direction is answered honestly (everything, under
 *    endpoint-naming blurbs) rather than guessed at;
 *  - "Add to Trip" copies the endpoints of the journey actually being made.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRANSPORT_ENTRIES,
  TRANSPORT_SECTIONS,
  BUS_TIMETABLES_REVERIFIED_ON,
  sectionBlurb,
  transportSectionsFor,
} from '../src/data/transport.mjs';
import {
  DEFAULT_DIRECTION,
  REVERSE_DIRECTION,
  ROUTE_DIRECTIONS,
  isRouteDirection,
} from '../src/route/direction.mjs';
import { transportPrefillFromEntry } from '../src/trip/tripModel.mjs';
import { defaultState, normalizeState } from '../src/utils/stateMigration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const byId = Object.fromEntries(TRANSPORT_ENTRIES.map((e) => [e.id, e]));
const ids = (entries) => entries.map((e) => e.id);
/** Every departure time in an entry, in schedule/call order. */
const timesOf = (entry) =>
  (entry.schedules ?? []).flatMap((s) => s.calls.map((c) => c.time ?? ''));
/** Every named call place in an entry, in schedule/call order. */
const placesOf = (entry) =>
  (entry.schedules ?? []).flatMap((s) => s.calls.map((c) => c.place).filter(Boolean));

// ---- 1. Data integrity ------------------------------------------------------

test('every entry declares the walking direction(s) it belongs to', () => {
  for (const e of TRANSPORT_ENTRIES) {
    assert.ok(Array.isArray(e.directions), `${e.id} needs a directions array`);
    assert.ok(e.directions.length > 0, `${e.id} must apply to at least one direction`);
    assert.equal(
      new Set(e.directions).size,
      e.directions.length,
      `${e.id} must not repeat a direction`,
    );
    for (const d of e.directions) {
      assert.ok(isRouteDirection(d), `${e.id} declares an unknown direction ${d}`);
    }
  }
});

test('trailhead services apply to exactly one walking direction; on-route ones to both', () => {
  const oneWay = ['line-91', 'line-91-return', 'nikkaluoktaexpressen', 'nikkaluoktaexpressen-outbound'];
  for (const id of oneWay) {
    assert.deepEqual(
      byId[id].directions.length,
      1,
      `${id} is a trailhead service and belongs to one walking direction`,
    );
  }
  // The boats are ON the route and mean the same thing either way round.
  for (const id of ['alesjaure-boat', 'laddjujavri-boat']) {
    assert.deepEqual([...byId[id].directions].sort(), [...ROUTE_DIRECTIONS].sort());
  }
});

test('ids are unique and every entry carries a source; static ones carry validity', () => {
  const all = TRANSPORT_ENTRIES.map((e) => e.id);
  assert.equal(new Set(all).size, all.length, 'transport ids are unique');
  for (const e of TRANSPORT_ENTRIES) {
    assert.ok(e.source?.url, `${e.id} needs a source url`);
    assert.ok(e.source?.title, `${e.id} needs a source title`);
    assert.ok(e.source?.lastVerified, `${e.id} needs a verification date`);
    if (!e.live) {
      assert.match(e.validFrom, /^\d{4}-\d{2}-\d{2}$/, `${e.id} needs validFrom`);
      assert.match(e.validTo, /^\d{4}-\d{2}-\d{2}$/, `${e.id} needs validTo`);
      assert.ok(e.validityText, `${e.id} needs readable validity`);
    }
  }
});

test('schedule ids are unique within their own entry', () => {
  for (const e of TRANSPORT_ENTRIES) {
    const sched = (e.schedules ?? []).map((s) => s.id);
    assert.equal(new Set(sched).size, sched.length, `${e.id} has duplicate schedule ids`);
  }
});

test('each entry’s calls stay inside the journey its direction names', () => {
  // The endpoints a card claims are the endpoints its timetable actually has.
  const endpoints = {
    'line-91': [/^Kiruna/, /^Abisko/],
    'line-91-return': [/^Abisko/, /^Kiruna/],
    'nikkaluoktaexpressen': [/^Nikkaluokta/, /^Kiruna/],
    'nikkaluoktaexpressen-outbound': [/^Kiruna/, /^Nikkaluokta/],
  };
  for (const [id, [startsWith, endsWith]] of Object.entries(endpoints)) {
    for (const s of byId[id].schedules) {
      const places = s.calls.map((c) => c.place);
      assert.match(places[0], startsWith, `${id}/${s.id} starts in the wrong place`);
      assert.match(places[places.length - 1], endsWith, `${id}/${s.id} ends in the wrong place`);
    }
  }
});

test('both operator directions are transcribed separately, never mirrored', () => {
  const pairs = [
    ['line-91', 'line-91-return'],
    ['nikkaluoktaexpressen', 'nikkaluoktaexpressen-outbound'],
  ];
  for (const [forward, reverse] of pairs) {
    const out = timesOf(byId[forward]);
    const back = timesOf(byId[reverse]);
    // A return run is a different service with its own published times, so it
    // can be neither a copy of the outward times nor those times reversed.
    assert.notDeepEqual(back, out, `${reverse} must not repeat ${forward}'s times`);
    assert.notDeepEqual(back, [...out].reverse(), `${reverse} must not be ${forward} reversed`);
    assert.equal(
      out.some((t) => back.includes(t)),
      false,
      `${reverse} shares a departure time with ${forward} — check the transcription`,
    );
  }
});

test('line 91 return keeps the asymmetries the official table actually has', () => {
  const out = byId['line-91'];
  const back = byId['line-91-return'];

  // Rensjön is a timed call southbound and an on-demand halt northbound —
  // it cannot exist in a mirrored list, because the outward table has no
  // timed intermediate call at all.
  assert.ok(placesOf(back).includes('Rensjön E10'));
  assert.equal(placesOf(out).includes('Rensjön E10'), false);

  // Abisko Turist is called BEFORE Abisko Östra heading for Kiruna, and
  // after it heading out.
  const backMorning = back.schedules.find((s) => s.id === 'morning').calls.map((c) => c.place);
  assert.ok(
    backMorning.indexOf('Abisko Turist E10') < backMorning.indexOf('Abisko Östra'),
    'return calls Abisko Turist first',
  );
  const outMorning = out.schedules.find((s) => s.id === 'morning').calls.map((c) => c.place);
  assert.ok(
    outMorning.indexOf('Abisko Östra') < outMorning.indexOf('Abisko Turist E10'),
    'outward calls Abisko Östra first',
  );

  // Only the daily return run touches the airport; the afternoon ones do not.
  const airportRuns = back.schedules
    .filter((s) => s.calls.some((c) => c.place === 'Kiruna Airport'))
    .map((s) => s.id);
  assert.deepEqual(airportRuns, ['morning']);
});

test('boarding and drop-off rules invert with the operator direction', () => {
  const notesFor = (id, place) =>
    byId[id].schedules
      .flatMap((s) => s.calls)
      .filter((c) => c.place === place)
      .map((c) => c.note);

  // Heading OUT of Kiruna you may only get on; heading in, only off.
  assert.ok(notesFor('nikkaluoktaexpressen-outbound', 'Kiruna Stadshustorget').every((n) => n === 'boarding only'));
  assert.ok(notesFor('nikkaluoktaexpressen', 'Kiruna Stadshustorget').every((n) => n === 'drop-off only'));
  assert.ok(notesFor('line-91', 'Kiruna Stadshustorget').every((n) => n === 'boarding only'));
  assert.ok(notesFor('line-91-return', 'Kiruna Stadshustorget').every((n) => n === 'drop-off only'));
});

test('the return timetables record when they were actually read', () => {
  assert.equal(BUS_TIMETABLES_REVERIFIED_ON, '2026-08-05');
  for (const id of ['line-91-return', 'nikkaluoktaexpressen-outbound']) {
    assert.equal(byId[id].source.lastVerified, BUS_TIMETABLES_REVERIFIED_ON);
  }
});

test('the return services stay inside the periods the sources already cover', () => {
  // PR-3 adds the missing periods; nothing here may quietly widen coverage.
  assert.equal(byId['line-91-return'].validFrom, '2026-08-17');
  assert.equal(byId['line-91-return'].validTo, '2026-09-20');
  assert.equal(byId['nikkaluoktaexpressen-outbound'].validFrom, '2026-08-10');
  assert.equal(byId['nikkaluoktaexpressen-outbound'].validTo, '2026-09-20');
});

// ---- 2. Forward assembly ----------------------------------------------------

test('walking Abisko → Nikkaluokta: in from Kiruna, out from Nikkaluokta', () => {
  const a = transportSectionsFor(DEFAULT_DIRECTION);
  assert.equal(a.direction, DEFAULT_DIRECTION);
  assert.deepEqual(ids(a.toTrail), ['line-91']);
  assert.deepEqual(ids(a.fromTrail), ['nikkaluoktaexpressen']);
  assert.deepEqual(ids(a.alongTrail), ['alesjaure-boat', 'laddjujavri-boat']);
  assert.deepEqual(ids(a.liveAlternatives), ['train-kiruna-abisko']);

  assert.equal(a.toTrail[0].direction, 'Kiruna → Abisko Turiststation');
  assert.equal(a.fromTrail[0].direction, 'Nikkaluokta → Kiruna');
});

test('reverse-only services never appear for a forward walker', () => {
  const shown = new Set(transportSectionsFor(DEFAULT_DIRECTION).sections.flatMap((s) => ids(s.entries)));
  for (const id of ['line-91-return', 'nikkaluoktaexpressen-outbound', 'train-abisko-kiruna']) {
    assert.equal(shown.has(id), false, `${id} must not show walking south`);
  }
});

test('the forward reference reads exactly as it did before both directions existed', () => {
  const a = transportSectionsFor(DEFAULT_DIRECTION);
  assert.deepEqual(
    a.sections.map((s) => [s.id, s.title, s.blurb]),
    [
      ['to-trail', 'Getting to the trail', 'Kiruna to the Abisko trailhead.'],
      ['along-trail', 'Along the trail', 'Optional boats that shorten a stage.'],
      ['from-trail', 'Leaving the trail', 'Nikkaluokta back to Kiruna.'],
      ['live-alternative', 'Live alternatives', 'Services to check for your actual travel date.'],
    ],
  );
});

// ---- 3. Reverse assembly ----------------------------------------------------

test('walking Nikkaluokta → Abisko: in from Kiruna to Nikkaluokta, out from Abisko', () => {
  const a = transportSectionsFor(REVERSE_DIRECTION);
  assert.equal(a.direction, REVERSE_DIRECTION);
  assert.deepEqual(ids(a.toTrail), ['nikkaluoktaexpressen-outbound']);
  assert.deepEqual(ids(a.fromTrail), ['line-91-return']);
  assert.deepEqual(ids(a.alongTrail), ['alesjaure-boat', 'laddjujavri-boat']);
  assert.deepEqual(ids(a.liveAlternatives), ['train-abisko-kiruna']);

  assert.equal(a.toTrail[0].direction, 'Kiruna → Nikkaluokta');
  assert.equal(a.fromTrail[0].direction, 'Abisko Turiststation → Kiruna');
});

test('forward-only services never appear for a reverse walker', () => {
  const shown = new Set(transportSectionsFor(REVERSE_DIRECTION).sections.flatMap((s) => ids(s.entries)));
  for (const id of ['line-91', 'nikkaluoktaexpressen', 'train-kiruna-abisko']) {
    assert.equal(shown.has(id), false, `${id} must not show walking north`);
  }
});

test('the reverse sections name their own endpoints, not the other direction’s', () => {
  const a = transportSectionsFor(REVERSE_DIRECTION);
  assert.deepEqual(
    a.sections.map((s) => [s.id, s.title, s.blurb]),
    [
      ['to-trail', 'Getting to the trail', 'Kiruna to the Nikkaluokta trailhead.'],
      ['along-trail', 'Along the trail', 'Optional boats that shorten a stage.'],
      ['from-trail', 'Leaving the trail', 'Abisko back to Kiruna.'],
      ['live-alternative', 'Live alternatives', 'Services to check for your actual travel date.'],
    ],
  );
  // Nothing anywhere in the reverse view claims the forward journey.
  const blurbs = a.sections.map((s) => s.blurb).join(' ');
  assert.equal(/Abisko trailhead/.test(blurbs), false);
  assert.equal(/Nikkaluokta back to Kiruna/.test(blurbs), false);
});

test('every service is reachable from one direction or the other', () => {
  const seen = new Set(
    ROUTE_DIRECTIONS.flatMap((d) =>
      transportSectionsFor(d).sections.flatMap((s) => ids(s.entries)),
    ),
  );
  for (const e of TRANSPORT_ENTRIES) {
    assert.ok(seen.has(e.id), `${e.id} is unreachable in both directions`);
  }
});

// ---- 4. No direction known --------------------------------------------------

test('the app always has a direction, so the unknown branch is never its state', () => {
  assert.ok(isRouteDirection(defaultState().routeDirection));
  assert.ok(isRouteDirection(normalizeState({}).routeDirection));
  assert.ok(isRouteDirection(normalizeState({ routeDirection: 'sideways' }).routeDirection));
});

test('an unrecognised direction shows everything, and says it knows of none', () => {
  for (const bad of [undefined, null, '', 'sideways', 42]) {
    const a = transportSectionsFor(bad);
    assert.equal(a.direction, null, `${String(bad)} must not resolve to a direction`);
    // Both real trailhead services stay visible, each under its own endpoints.
    assert.deepEqual(ids(a.toTrail), ['line-91', 'nikkaluoktaexpressen-outbound']);
    assert.deepEqual(ids(a.fromTrail), ['nikkaluoktaexpressen', 'line-91-return']);
    assert.equal(
      a.sections.flatMap((s) => s.entries).length,
      TRANSPORT_ENTRIES.length,
      'no service is dropped when no direction is known',
    );
  }
});

test('with no direction the blurbs name both endpoints instead of picking one', () => {
  const a = transportSectionsFor(null);
  const blurb = (id) => a.sections.find((s) => s.id === id).blurb;
  assert.equal(blurb('to-trail'), 'Kiruna to either trailhead — Abisko or Nikkaluokta.');
  assert.equal(blurb('from-trail'), 'Either trailhead back to Kiruna — Nikkaluokta or Abisko.');
  // And it never borrows one direction's wording as a stand-in for "unknown".
  assert.notEqual(blurb('to-trail'), sectionBlurb(TRANSPORT_SECTIONS[0], DEFAULT_DIRECTION));
  assert.notEqual(blurb('to-trail'), sectionBlurb(TRANSPORT_SECTIONS[0], REVERSE_DIRECTION));
});

test('sectionBlurb falls back rather than returning nothing', () => {
  const neutral = TRANSPORT_SECTIONS.find((s) => s.id === 'along-trail');
  for (const d of [...ROUTE_DIRECTIONS, null]) {
    assert.equal(sectionBlurb(neutral, d), 'Optional boats that shorten a stage.');
  }
});

// ---- 5. What the view is allowed to do --------------------------------------

test('TransportView renders the assembly and holds no direction logic itself', () => {
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /transportSectionsFor\(routeDirection\)/);
  assert.match(src, /const \{ routeDirection \} = useStore\(\)/);
  assert.match(src, /sections\.map\(\(section\) =>/);
  assert.match(src, /\{section\.blurb\}/);
  assert.match(src, /section\.entries\.map/);
  // No string surgery that could turn one route into its opposite, and no
  // list reversal standing in for a real return service.
  assert.equal(/\.reverse\(\)/.test(src), false, 'the view must not reverse anything');
  assert.equal(/split\(\s*['"`]→/.test(src), false, 'the view must not parse route strings');
  assert.equal(/[Rr]eversed|oppositeDirection|isReversed/.test(src), false);
});

test('the connectivity caveats from the caveats pass are still where they were', () => {
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /TRAIL_CAVEATS\.connectivity\.short/);
  assert.match(src, /TRAIL_CAVEATS\.connectivity\.full/);
  // The short line still heads the list, above the first section.
  assert.ok(
    src.indexOf('TRAIL_CAVEATS.connectivity.short') < src.indexOf('sections.map'),
    'the short caveat still comes first',
  );
});

test('source, validity and timetable status stay on every card', () => {
  const src = read('src/components/TransportView.tsx');
  assert.match(src, /timetableStatus\(entry, today\)/);
  assert.match(src, /entry\.source\.title/);
  assert.match(src, /entry\.validityText/);
  assert.match(src, /status === 'expired'/);
  assert.match(src, /entry\.warnings/);
});

// ---- 6. Add to Trip ---------------------------------------------------------

test('the trip prefill copies the endpoints of the journey actually made', () => {
  const forward = transportPrefillFromEntry(byId['nikkaluoktaexpressen']);
  assert.equal(forward.from, 'Nikkaluokta');
  assert.equal(forward.to, 'Kiruna');

  const reverse = transportPrefillFromEntry(byId['nikkaluoktaexpressen-outbound']);
  assert.equal(reverse.from, 'Kiruna');
  assert.equal(reverse.to, 'Nikkaluokta');
  assert.equal(reverse.title, 'Nikkaluoktaexpressen — Kiruna → Nikkaluokta');
  assert.equal(reverse.provider, 'Nikkaluoktaexpressen');
  assert.equal(reverse.linkedTransportId, 'nikkaluoktaexpressen-outbound');

  const back = transportPrefillFromEntry(byId['line-91-return']);
  assert.equal(back.from, 'Abisko Turiststation');
  assert.equal(back.to, 'Kiruna');
  assert.equal(back.mode, 'bus');
});

test('a prefill still invents no personal facts, in either direction', () => {
  for (const id of ['line-91-return', 'nikkaluoktaexpressen-outbound', 'train-abisko-kiruna']) {
    const prefill = transportPrefillFromEntry(byId[id]);
    assert.equal(prefill.status, 'planned');
    // No timetable date, no departure time, no booking or ticket state — the
    // user owns all of that.
    for (const field of ['date', 'time', 'departAt', 'arriveAt', 'reference', 'booked', 'ticket']) {
      assert.equal(prefill[field], undefined, `${id} prefilled ${field}`);
    }
  }
});
