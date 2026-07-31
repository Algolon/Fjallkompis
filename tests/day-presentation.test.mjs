/**
 * How a day's activities READ (src/plan/dayPresentation.mjs).
 *
 * The stored activity order is the only thing separating "walk, then catch the
 * bus" from "catch the bus, then walk". These tests fence that the wording and
 * the LINE POSITION both follow it, and that a mixed day always says travel is
 * part of it even when Lists → Trip has nothing for the date.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityOrderPhrase,
  hikingLead,
  travelItemsText,
  travelPresentation,
} from '../src/plan/dayPresentation.mjs';

const transport = (from, to, extra = {}) => ({
  id: `t_${from ?? '?'}_${to ?? '?'}`,
  kind: 'transport',
  title: 'A movement',
  date: '2026-09-10',
  from,
  to,
  ...extra,
});

/** A derived-day stand-in: only the fields the presenter reads. */
const derived = (kinds, travelItems = []) => ({
  kinds,
  travelItems,
  stages: kinds.includes('hiking') ? [{ id: 'd1' }] : [],
});

// ---- The ordered phrase -----------------------------------------------------

test('a single-activity day reads as its own label', () => {
  assert.equal(activityOrderPhrase(derived(['hiking'])), 'Hiking');
  assert.equal(activityOrderPhrase(derived(['travel'])), 'Travel');
  assert.equal(activityOrderPhrase(derived(['rest'])), 'Rest & explore');
});

test('a mixed day reads in its stored order, and the two orders differ', () => {
  const hikeFirst = activityOrderPhrase(derived(['hiking', 'travel']));
  const travelFirst = activityOrderPhrase(derived(['travel', 'hiking']));
  assert.equal(hikeFirst, 'Hiking, then travel');
  assert.equal(travelFirst, 'Travel, then hiking');
  assert.notEqual(hikeFirst, travelFirst, 'the accessible name distinguishes the orders');
});

test('the phrase survives an empty or malformed day without throwing', () => {
  assert.equal(activityOrderPhrase(null), '');
  assert.equal(activityOrderPhrase(undefined), '');
  assert.equal(activityOrderPhrase({ kinds: [] }), '');
  assert.equal(activityOrderPhrase({ kinds: ['nonsense'] }), '');
});

// ---- Travel text ------------------------------------------------------------

test('several legs join in order, and stays are never treated as movements', () => {
  const items = [transport('Nikkaluokta', 'Kiruna'), transport('Kiruna', 'Arlanda')];
  assert.equal(travelItemsText(items), 'Nikkaluokta → Kiruna, Kiruna → Arlanda');
  assert.equal(travelItemsText([{ id: 's', kind: 'stay', title: 'Hotel' }]), '');
  assert.equal(travelItemsText(undefined), '');
});

test('a partial leg shows what the user recorded and invents nothing', () => {
  assert.equal(travelItemsText([transport('Kiruna', undefined)]), 'Kiruna → ?');
  assert.equal(travelItemsText([transport(undefined, 'Abisko')]), '? → Abisko');
});

test('a title-only movement falls back to its title (v0.26.2 regression)', () => {
  // The reproduced production defect: "Bus Nikkaluokta to Kiruna" recorded
  // with empty endpoint fields appeared in the day sheet but the compact
  // Day plan and Today both claimed "no travel added yet". A movement with
  // no endpoints but a usable title IS travel and reads as its title.
  const bus = {
    id: 't_bus',
    kind: 'transport',
    title: 'Bus Nikkaluokta to Kiruna',
    date: '2026-09-10',
    departureTime: '16:40',
  };
  assert.equal(travelItemsText([bus]), 'Bus Nikkaluokta to Kiruna');
  const p = travelPresentation(derived(['hiking', 'travel'], [bus]));
  assert.equal(p.isEmpty, false, 'a title-only movement is never "no travel added yet"');
  assert.equal(p.line, 'then travel Bus Nikkaluokta to Kiruna');
});

test('only a movement with neither endpoints nor a usable title is dropped', () => {
  assert.equal(
    travelItemsText([{ id: 't_x', kind: 'transport', title: '   ' }]),
    '',
    'whitespace is not a usable title',
  );
  assert.equal(travelItemsText([{ id: 't_y', kind: 'transport' }]), '');
});

test('mixed forms on one date all survive, in the order given', () => {
  // The derivation hands the items over already sorted by departure time —
  // the presenter keeps that order and loses no title-only leg in between.
  const items = [
    transport('Nikkaluokta', 'Kiruna'),
    { id: 't_t', kind: 'transport', title: 'Night train to Stockholm' },
    transport('Stockholm', undefined),
  ];
  assert.equal(
    travelItemsText(items),
    'Nikkaluokta → Kiruna, Night train to Stockholm, Stockholm → ?',
  );
});

// ---- Position and wording ---------------------------------------------------

test('a day without travel has no travel line at all', () => {
  assert.equal(travelPresentation(derived(['hiking'])), null);
  assert.equal(travelPresentation(derived(['rest'])), null);
  assert.equal(travelPresentation(null), null);
});

test('travel AFTER the walk sits below it and reads "then travel"', () => {
  const p = travelPresentation(derived(['hiking', 'travel'], [transport('Nikkaluokta', 'Kiruna')]));
  assert.equal(p.position, 'after');
  assert.equal(p.lead, 'then travel');
  assert.equal(p.line, 'then travel Nikkaluokta → Kiruna');
});

test('travel BEFORE the walk sits above it and reads "Travel"', () => {
  const p = travelPresentation(derived(['travel', 'hiking'], [transport('Kiruna', 'Nikkaluokta')]));
  assert.equal(p.position, 'before');
  assert.equal(p.lead, 'Travel');
  assert.equal(p.line, 'Travel Kiruna → Nikkaluokta');
});

test('reversing the stored order changes BOTH the position and the wording', () => {
  const items = [transport('Kiruna', 'Nikkaluokta')];
  const after = travelPresentation(derived(['hiking', 'travel'], items));
  const before = travelPresentation(derived(['travel', 'hiking'], items));
  assert.notEqual(after.position, before.position, 'the line moves');
  assert.notEqual(after.line, before.line, 'the sentence changes');
});

test('a mixed day with no matching Trip item still says travel is part of it', () => {
  const after = travelPresentation(derived(['hiking', 'travel'], []));
  assert.equal(after.isEmpty, true);
  assert.equal(after.line, 'then travel — no travel added yet');
  const before = travelPresentation(derived(['travel', 'hiking'], []));
  assert.equal(before.line, 'Travel — no travel added yet');
  // The regression: a mixed day must never be mistakable for a hiking day.
  assert.notEqual(after.line, '');
  assert.notEqual(before.line, '');
});

test('a travel-only day keeps its existing bare wording and empty state', () => {
  const withItems = travelPresentation(derived(['travel'], [transport('Stockholm', 'Abisko')]));
  assert.equal(withItems.position, 'only');
  assert.equal(withItems.lead, null, 'nothing to sequence against');
  assert.equal(withItems.line, 'Stockholm → Abisko');
  const empty = travelPresentation(derived(['travel'], []));
  assert.equal(empty.line, 'No travel added yet');
});

// ---- The walking lead -------------------------------------------------------

test('the walk picks up a "then hike" lead only when travel came first', () => {
  assert.equal(hikingLead(derived(['travel', 'hiking'])), 'then hike');
  assert.equal(hikingLead(derived(['hiking', 'travel'])), null);
  assert.equal(hikingLead(derived(['hiking'])), null);
  assert.equal(hikingLead(derived(['travel'])), null);
  assert.equal(hikingLead(null), null);
});

// ---- Nothing is copied ------------------------------------------------------

test('presenting a day never mutates it and never copies Trip data into it', () => {
  const day = derived(['hiking', 'travel'], [transport('Nikkaluokta', 'Kiruna', { departureTime: '16:30' })]);
  const frozen = JSON.stringify(day);
  travelPresentation(day);
  activityOrderPhrase(day);
  hikingLead(day);
  assert.equal(JSON.stringify(day), frozen);
  // With endpoints present the line uses them alone — no provider, no time,
  // and the title appears ONLY as the no-endpoints fallback.
  const p = travelPresentation(day);
  assert.ok(!p.line.includes('16:30'));
  assert.ok(!p.line.includes('A movement'));
});
