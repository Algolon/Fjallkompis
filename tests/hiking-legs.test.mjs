/**
 * The explicit hiking-leg model (src/plan/hikingLegs.mjs) — the exact module
 * the app runs. These tests fence the product invariants of the v10 model:
 *
 *   - a leg references one physical canonical stage with an ABSOLUTE
 *     orientation — never a direction-relative one;
 *   - a day's legs must connect physically end-to-start (a day's walk is one
 *     continuous line on the ground);
 *   - repeats, reversals, skips and early finishes are representable — the
 *     old full-route partition invariant is gone by design;
 *   - every edit is refused (input returned unchanged) rather than partially
 *     applied when the result would disconnect;
 *   - leg identity is a stable id, never an array position.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIKING_LEG_KINDS,
  HIKING_LEG_ORIENTATIONS,
  canRemoveLeg,
  canReverseLeg,
  isConnectedLegSequence,
  isHikingLegOrientation,
  isValidHikingLeg,
  isValidHikingLegs,
  legCandidatesFrom,
  legCandidatesTo,
  legsConnect,
  migratedHikingLegId,
  newHikingLegId,
  normalizeHikingLeg,
  orientedLegEndpoints,
  topologyStage,
  withLegAdded,
  withLegMoved,
  withLegRemoved,
  withLegRepeated,
  withLegReversed,
} from '../src/plan/hikingLegs.mjs';

/**
 * The real Kungsleden topology, spelled out literally so these tests state
 * the physical facts they rely on (d1..d7, abisko → … → nikkaluokta).
 */
const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

let seq = 0;
const leg = (stageId, orientation = 'canonical') => ({
  id: `leg_fixture_${(seq += 1)}`,
  kind: 'canonical-stage',
  stageId,
  orientation,
});

// ---- Vocabulary and identity ------------------------------------------------

test('the one supported leg kind is canonical-stage — nothing free-form', () => {
  assert.deepEqual(HIKING_LEG_KINDS, ['canonical-stage']);
});

test('orientations are exactly canonical and opposite', () => {
  assert.deepEqual(HIKING_LEG_ORIENTATIONS, ['canonical', 'opposite']);
  assert.ok(isHikingLegOrientation('canonical'));
  assert.ok(isHikingLegOrientation('opposite'));
  for (const bad of ['forward', 'reverse', '', null, 42]) {
    assert.ok(!isHikingLegOrientation(bad), String(bad));
  }
});

test('new leg ids follow the repository convention and are unique', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newHikingLegId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^leg_[a-z0-9]+_[a-z0-9]+$/);
});

test('migrated leg ids are deterministic — same input, same id, every time', () => {
  const a = migratedHikingLegId('day_lx3k_ab12cd', 'd3');
  assert.equal(a, migratedHikingLegId('day_lx3k_ab12cd', 'd3'));
  assert.equal(a, 'leg_day_lx3k_ab12cd_d3');
  assert.notEqual(a, migratedHikingLegId('day_lx3k_ab12cd', 'd4'));
  assert.notEqual(a, migratedHikingLegId('day_other_ef34gh', 'd3'));
});

// ---- Validity ---------------------------------------------------------------

test('a well-formed canonical leg and a well-formed opposite leg are valid', () => {
  assert.ok(isValidHikingLeg(leg('d3', 'canonical'), TOPOLOGY));
  assert.ok(isValidHikingLeg(leg('d7', 'opposite'), TOPOLOGY));
});

test('unknown stages, kinds, orientations and malformed shapes are invalid', () => {
  assert.ok(!isValidHikingLeg(leg('d9'), TOPOLOGY), 'unknown stage');
  assert.ok(!isValidHikingLeg({ ...leg('d3'), kind: 'custom-gpx' }, TOPOLOGY), 'unknown kind');
  assert.ok(!isValidHikingLeg({ ...leg('d3'), orientation: 'reverse' }, TOPOLOGY));
  assert.ok(!isValidHikingLeg({ ...leg('d3'), id: '' }, TOPOLOGY), 'empty id');
  assert.ok(!isValidHikingLeg({ ...leg('d3'), id: 42 }, TOPOLOGY), 'non-string id');
  for (const bad of [null, undefined, 'd3', 42, [], {}]) {
    assert.ok(!isValidHikingLeg(bad, TOPOLOGY), String(bad));
  }
  assert.ok(!isValidHikingLeg(leg('d3'), null), 'no topology, no validity');
});

test('topologyStage resolves by id and never guesses', () => {
  assert.equal(topologyStage(TOPOLOGY, 'd5').toStopId, 'singi');
  assert.equal(topologyStage(TOPOLOGY, 'd9'), null);
  assert.equal(topologyStage(null, 'd5'), null);
});

// ---- Oriented endpoints -----------------------------------------------------

test('a canonical leg keeps the stored endpoints; an opposite leg swaps them', () => {
  assert.deepEqual(orientedLegEndpoints(leg('d1', 'canonical'), TOPOLOGY), {
    fromStopId: 'abisko',
    toStopId: 'abiskojaure',
  });
  assert.deepEqual(orientedLegEndpoints(leg('d1', 'opposite'), TOPOLOGY), {
    fromStopId: 'abiskojaure',
    toStopId: 'abisko',
  });
  assert.equal(orientedLegEndpoints(leg('d9'), TOPOLOGY), null);
});

// ---- Connectivity -----------------------------------------------------------

test('adjacent canonical legs connect; a gap does not', () => {
  assert.ok(legsConnect(leg('d1'), leg('d2'), TOPOLOGY));
  assert.ok(!legsConnect(leg('d1'), leg('d3'), TOPOLOGY), 'skips d2');
  assert.ok(!legsConnect(leg('d2'), leg('d1'), TOPOLOGY), 'wrong order');
});

test('an out-and-back connects: the same stage in both orientations', () => {
  // Kebnekaise → Nikkaluokta, then back to Kebnekaise.
  assert.ok(legsConnect(leg('d7', 'canonical'), leg('d7', 'opposite'), TOPOLOGY));
  // And the mirror image, starting from Nikkaluokta.
  assert.ok(legsConnect(leg('d7', 'opposite'), leg('d7', 'canonical'), TOPOLOGY));
});

test('opposite legs chain backwards through the route', () => {
  assert.ok(legsConnect(leg('d5', 'opposite'), leg('d4', 'opposite'), TOPOLOGY));
  assert.ok(!legsConnect(leg('d4', 'opposite'), leg('d5', 'opposite'), TOPOLOGY));
});

test('a single leg is a connected sequence; an empty list is not', () => {
  assert.ok(isConnectedLegSequence([leg('d4')], TOPOLOGY));
  assert.ok(!isConnectedLegSequence([], TOPOLOGY), 'a hiking day cannot walk nothing');
  assert.ok(!isConnectedLegSequence(null, TOPOLOGY));
});

test('multi-leg sequences validate connection pair by pair', () => {
  assert.ok(isConnectedLegSequence([leg('d3'), leg('d4'), leg('d5')], TOPOLOGY));
  assert.ok(!isConnectedLegSequence([leg('d3'), leg('d5')], TOPOLOGY), 'skips d4');
  assert.ok(
    isConnectedLegSequence([leg('d6'), leg('d7'), leg('d7', 'opposite')], TOPOLOGY),
    'walk to Nikkaluokta and back to Kebnekaise',
  );
  assert.ok(!isConnectedLegSequence([leg('d3'), { nonsense: true }], TOPOLOGY));
  assert.equal(isValidHikingLegs([leg('d3'), leg('d4')], TOPOLOGY), true);
  assert.equal(isValidHikingLegs([], TOPOLOGY), false);
});

// ---- Candidates -------------------------------------------------------------

test('candidates from a mid-route stop: continue forward or turn back', () => {
  // Standing at Sälka (between d4 and d5).
  assert.deepEqual(legCandidatesFrom(TOPOLOGY, 'salka'), [
    { stageId: 'd4', orientation: 'opposite', fromStopId: 'salka', toStopId: 'tjaktja' },
    { stageId: 'd5', orientation: 'canonical', fromStopId: 'salka', toStopId: 'singi' },
  ]);
});

test('candidates at the route ends: exactly one way to walk', () => {
  assert.deepEqual(legCandidatesFrom(TOPOLOGY, 'abisko'), [
    { stageId: 'd1', orientation: 'canonical', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  ]);
  assert.deepEqual(legCandidatesFrom(TOPOLOGY, 'nikkaluokta'), [
    { stageId: 'd7', orientation: 'opposite', fromStopId: 'nikkaluokta', toStopId: 'kebnekaise' },
  ]);
});

test('candidates TO a stop mirror the candidates FROM it', () => {
  assert.deepEqual(legCandidatesTo(TOPOLOGY, 'salka'), [
    { stageId: 'd4', orientation: 'canonical', fromStopId: 'tjaktja', toStopId: 'salka' },
    { stageId: 'd5', orientation: 'opposite', fromStopId: 'singi', toStopId: 'salka' },
  ]);
  assert.deepEqual(legCandidatesTo(TOPOLOGY, 'abisko'), [
    { stageId: 'd1', orientation: 'opposite', fromStopId: 'abiskojaure', toStopId: 'abisko' },
  ]);
});

test('candidates for an unknown stop are empty, never invented', () => {
  assert.deepEqual(legCandidatesFrom(TOPOLOGY, 'kiruna'), []);
  assert.deepEqual(legCandidatesTo(TOPOLOGY, 'kiruna'), []);
  assert.deepEqual(legCandidatesFrom(null, 'salka'), []);
});

// ---- Editing: add -----------------------------------------------------------

test('a connecting next stage appends; a non-connecting one is refused', () => {
  const legs = [leg('d3')];
  const grown = withLegAdded(legs, 'd4', 'canonical', 'end', TOPOLOGY);
  assert.equal(grown.length, 2);
  assert.equal(grown[1].stageId, 'd4');
  assert.match(grown[1].id, /^leg_/);
  assert.equal(withLegAdded(legs, 'd6', 'canonical', 'end', TOPOLOGY), legs, 'refused: gap');
  assert.equal(withLegAdded(legs, 'd4', 'opposite', 'end', TOPOLOGY), legs, 'refused: wrong way');
});

test('a connecting previous stage prepends at the start', () => {
  const legs = [leg('d3')];
  const grown = withLegAdded(legs, 'd2', 'canonical', 'start', TOPOLOGY);
  assert.equal(grown[0].stageId, 'd2');
  assert.equal(grown[1].stageId, 'd3');
  assert.equal(withLegAdded(legs, 'd1', 'canonical', 'start', TOPOLOGY), legs, 'refused: gap');
});

test('adding the turn-around leg builds an out-and-back explicitly', () => {
  const legs = [leg('d7', 'canonical')];
  const backAgain = withLegAdded(legs, 'd7', 'opposite', 'end', TOPOLOGY);
  assert.equal(backAgain.length, 2);
  assert.equal(backAgain[0].stageId, 'd7');
  assert.equal(backAgain[1].stageId, 'd7');
  assert.notEqual(backAgain[0].id, backAgain[1].id, 'two occurrences, two identities');
  assert.notEqual(backAgain[0].orientation, backAgain[1].orientation);
});

test('an explicit id is honoured for deterministic construction', () => {
  const grown = withLegAdded([leg('d1')], 'd2', 'canonical', 'end', TOPOLOGY, 'leg_pinned');
  assert.equal(grown[1].id, 'leg_pinned');
});

// ---- Editing: remove --------------------------------------------------------

test('an end leg can be removed; the final leg can never be', () => {
  const legs = [leg('d3'), leg('d4'), leg('d5')];
  assert.ok(canRemoveLeg(legs, legs[0].id, TOPOLOGY));
  assert.ok(canRemoveLeg(legs, legs[2].id, TOPOLOGY));
  const shorter = withLegRemoved(legs, legs[2].id, TOPOLOGY);
  assert.deepEqual(
    shorter.map((l) => l.stageId),
    ['d3', 'd4'],
  );
  const single = [leg('d4')];
  assert.ok(!canRemoveLeg(single, single[0].id, TOPOLOGY), 'the last leg is not removable here');
  assert.equal(withLegRemoved(single, single[0].id, TOPOLOGY), single, 'refused');
});

test('a middle leg is only removable when its neighbours still connect', () => {
  const line = [leg('d3'), leg('d4'), leg('d5')];
  assert.ok(!canRemoveLeg(line, line[1].id, TOPOLOGY), 'd3 → d5 would be a gap');
  assert.equal(withLegRemoved(line, line[1].id, TOPOLOGY), line, 'refused');
  // In an out-and-back the middle pair CAN collapse: d6, d7, d7', d6' minus
  // one d7 still connects nothing — but d7, d7' minus the second d7 leaves a
  // valid single leg... removal legality is decided by the survivors alone.
  const outAndBack = [leg('d7', 'canonical'), leg('d7', 'opposite')];
  assert.ok(canRemoveLeg(outAndBack, outAndBack[0].id, TOPOLOGY));
  assert.ok(canRemoveLeg(outAndBack, outAndBack[1].id, TOPOLOGY));
});

test('removing an unknown leg id changes nothing', () => {
  const legs = [leg('d3'), leg('d4')];
  assert.equal(withLegRemoved(legs, 'leg_missing', TOPOLOGY), legs);
  assert.ok(!canRemoveLeg(legs, 'leg_missing', TOPOLOGY));
});

// ---- Editing: reverse -------------------------------------------------------

test('a single-leg day reverses freely, flipping its absolute orientation', () => {
  const legs = [leg('d4', 'canonical')];
  assert.ok(canReverseLeg(legs, legs[0].id, TOPOLOGY));
  const reversed = withLegReversed(legs, legs[0].id, TOPOLOGY);
  assert.equal(reversed[0].orientation, 'opposite');
  assert.equal(reversed[0].id, legs[0].id, 'identity survives the flip');
  const back = withLegReversed(reversed, legs[0].id, TOPOLOGY);
  assert.equal(back[0].orientation, 'canonical');
});

test('a leg inside a connected line refuses to reverse — it would disconnect', () => {
  const line = [leg('d3'), leg('d4'), leg('d5')];
  for (const l of line) {
    assert.ok(!canReverseLeg(line, l.id, TOPOLOGY), `${l.stageId} cannot flip alone`);
    assert.equal(withLegReversed(line, l.id, TOPOLOGY), line, 'refused');
  }
});

test('reversing an unknown leg id changes nothing', () => {
  const legs = [leg('d4')];
  assert.equal(withLegReversed(legs, 'leg_missing', TOPOLOGY), legs);
});

// ---- Editing: repeat --------------------------------------------------------

test('repeating a leg inserts a second occurrence walking back — never moves the first', () => {
  const legs = [leg('d7', 'canonical')];
  const repeated = withLegRepeated(legs, legs[0].id, TOPOLOGY);
  assert.equal(repeated.length, 2);
  assert.equal(repeated[0], legs[0], 'the original leg object is untouched');
  assert.equal(repeated[1].stageId, 'd7');
  assert.equal(repeated[1].orientation, 'opposite', 'the repeat walks back');
  assert.notEqual(repeated[1].id, repeated[0].id);
});

test('repeating a middle leg is refused when the result would disconnect', () => {
  const line = [leg('d3'), leg('d4')];
  // Repeating d3 inserts d3-opposite between d3 and d4: alesjaure → … no.
  assert.equal(withLegRepeated(line, line[0].id, TOPOLOGY), line, 'refused');
  // Repeating the LAST leg of the line is always safe.
  const grown = withLegRepeated(line, line[1].id, TOPOLOGY);
  assert.equal(grown.length, 3);
  assert.equal(grown[2].orientation, 'opposite');
});

// ---- Editing: reorder -------------------------------------------------------

test('reordering is refused unless the moved sequence still connects', () => {
  const line = [leg('d3'), leg('d4'), leg('d5')];
  assert.equal(withLegMoved(line, 0, 2, TOPOLOGY), line, 'a line admits one order');
  // A symmetric out-and-back admits the swap: A→B, B→A ⇄ B→A, A→B only when
  // endpoints agree — for a single-stage out-and-back the swap is the mirror
  // image and still connects.
  const bounce = [leg('d7', 'canonical'), leg('d7', 'opposite')];
  const swapped = withLegMoved(bounce, 0, 1, TOPOLOGY);
  assert.deepEqual(
    swapped.map((l) => l.orientation),
    ['opposite', 'canonical'],
    'Nikkaluokta-based out-and-back',
  );
  assert.equal(withLegMoved(line, 0, 0, TOPOLOGY), line, 'same position is a no-op');
  assert.equal(withLegMoved(line, -1, 2, TOPOLOGY), line);
  assert.equal(withLegMoved(line, 0, 9, TOPOLOGY), line);
});

// ---- Purity -----------------------------------------------------------------

test('every edit returns a new array and never mutates its input', () => {
  const legs = Object.freeze([Object.freeze(leg('d6')), Object.freeze(leg('d7'))]);
  const snapshot = JSON.stringify(legs);
  withLegAdded(legs, 'd7', 'opposite', 'end', TOPOLOGY);
  withLegRemoved(legs, legs[0].id, TOPOLOGY);
  withLegReversed(legs, legs[0].id, TOPOLOGY);
  withLegRepeated(legs, legs[1].id, TOPOLOGY);
  withLegMoved(legs, 0, 1, TOPOLOGY);
  assert.equal(JSON.stringify(legs), snapshot);
});

// ---- Normalisation ----------------------------------------------------------

test('a valid persisted leg normalises verbatim; extra fields are dropped', () => {
  const raw = { ...leg('d5', 'opposite'), note: 'walked in fog' };
  const out = normalizeHikingLeg(raw, TOPOLOGY);
  assert.deepEqual(out, {
    id: raw.id,
    kind: 'canonical-stage',
    stageId: 'd5',
    orientation: 'opposite',
  });
});

test('an irrecoverable leg normalises to null — never a guess', () => {
  for (const bad of [
    leg('d9'),
    { ...leg('d3'), orientation: 'backwards' },
    { ...leg('d3'), kind: 'gpx' },
    { kind: 'canonical-stage', stageId: 'd3', orientation: 'canonical' }, // no id
    null,
    'd3',
  ]) {
    assert.equal(normalizeHikingLeg(bad, TOPOLOGY), null, JSON.stringify(bad));
  }
});
