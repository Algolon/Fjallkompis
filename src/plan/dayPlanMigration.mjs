/**
 * Day plan — the v9 → v10 hiking migration.
 *
 * Schema v9 stored a Hiking activity as a COUNT of adjacent canonical stages
 * ({ kind: 'hiking', stages: n }), consumed in walking order from a shared
 * cursor over the directional itinerary. Schema v10 stores explicit legs
 * (src/plan/hikingLegs.mjs). This module converts a legacy plan by walking
 * the v9 days exactly as the released derivation did:
 *
 *   - the plan's own stored direction fixes the walking order (forward:
 *     d1..d7 as 'canonical' legs; reverse: d7..d1 as 'opposite' legs —
 *     orientation is ABSOLUTE over the physical stage, so re-reading the
 *     migrated plan can never reinterpret it);
 *   - every hiking activity's count consumes that many stages from the
 *     cursor, each becoming one explicit leg IN PLACE — the activity keeps
 *     its position within the day, days keep their ids and order;
 *   - leg ids are DETERMINISTIC (migratedHikingLegId(dayId, stageId)), so
 *     migrating the same payload twice yields byte-identical output — a v9
 *     stage was consumed exactly once, which makes (day id, stage id) unique;
 *   - `currentLegId` is derived from the released pointers: the migrated leg
 *     on the current day that walks `currentStageId`, when there is exactly
 *     such a leg — otherwise null, never a guess.
 *
 * Malformed input — non-integer or non-positive counts, a plan that under- or
 * over-consumes the route, unknown direction, malformed days — returns null:
 * the same honest fallback the released normaliser already applied to an
 * invalid v9 plan (no plan, unrelated state untouched), never a crash and
 * never a partially-migrated plan.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises the migration
 * deterministically — the stateMigration.mjs convention.
 */
import { isRouteDirection } from '../route/direction.mjs';
import { migratedHikingLegId } from './hikingLegs.mjs';

/** True when an activity is the legacy stage-count hiking shape. */
export function isLegacyHikingActivity(activity) {
  return (
    activity != null &&
    typeof activity === 'object' &&
    activity.kind === 'hiking' &&
    !Array.isArray(activity.legs) &&
    'stages' in activity
  );
}

/** True when a raw plan carries at least one legacy stage-count activity. */
export function planUsesLegacyHiking(raw) {
  if (raw == null || typeof raw !== 'object' || !Array.isArray(raw.days)) return false;
  return raw.days.some(
    (day) =>
      day != null &&
      typeof day === 'object' &&
      Array.isArray(day.activities) &&
      day.activities.some(isLegacyHikingActivity),
  );
}

/**
 * Migrate a legacy v9 plan to explicit v10 legs. Returns a NEW raw-plan
 * object (same shape the v10 normaliser accepts) or null when the legacy
 * data cannot be interpreted exactly. The input is never mutated.
 *
 * @param {unknown} raw            The persisted v9 dayPlan value.
 * @param {ReadonlyArray<{id: string}>} topology  Canonical stages, canonical order.
 * @param {string|null} currentStageId  The blob's route-progress pointer,
 *   used only to derive `currentLegId` for the current day.
 */
export function migrateLegacyDayPlan(raw, topology, currentStageId = null) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isRouteDirection(raw.direction)) return null;
  if (!Array.isArray(topology) || topology.length === 0) return null;
  if (!Array.isArray(raw.days) || raw.days.length === 0) return null;

  // The walking order the released derivation consumed: the directional
  // itinerary over the same physical stages. Orientation is recorded
  // absolutely so the stored direction never has to be consulted again.
  const reversed = raw.direction !== 'abisko-to-nikkaluokta';
  const walkingOrder = reversed ? [...topology].reverse() : topology;
  const orientation = reversed ? 'opposite' : 'canonical';

  let cursor = 0;
  const days = [];
  for (const day of raw.days) {
    if (day == null || typeof day !== 'object') return null;
    if (typeof day.id !== 'string' || day.id === '') return null;
    if (!Array.isArray(day.activities)) return null;
    const activities = [];
    for (const activity of day.activities) {
      if (activity == null || typeof activity !== 'object') return null;
      if (!isLegacyHikingActivity(activity)) {
        // Travel, rest — and any already-explicit hiking activity — pass
        // through untouched, in position; the v10 normaliser validates them.
        activities.push(activity);
        continue;
      }
      const count = activity.stages;
      if (!Number.isInteger(count) || count < 1) return null;
      if (cursor + count > walkingOrder.length) return null; // over-consumption
      const legs = [];
      for (let i = 0; i < count; i++) {
        const stage = walkingOrder[cursor + i];
        if (stage == null || typeof stage.id !== 'string') return null;
        legs.push({
          id: migratedHikingLegId(day.id, stage.id),
          kind: 'canonical-stage',
          stageId: stage.id,
          orientation,
        });
      }
      cursor += count;
      activities.push({ kind: 'hiking', legs });
    }
    days.push({ ...day, activities });
  }
  if (cursor !== walkingOrder.length) return null; // under-consumption

  // The released model had exactly one occurrence of every stage, so the
  // current leg — when the pointers agree — is unambiguous: the migrated leg
  // on the current day that walks the current stage. Anything else is null.
  let currentLegId = null;
  if (typeof raw.currentDayId === 'string' && typeof currentStageId === 'string') {
    const currentDay = days.find((d) => d.id === raw.currentDayId);
    for (const activity of currentDay?.activities ?? []) {
      if (activity.kind !== 'hiking' || !Array.isArray(activity.legs)) continue;
      const match = activity.legs.find((l) => l.stageId === currentStageId);
      if (match) currentLegId = match.id;
    }
  }

  return {
    ...raw,
    currentLegId,
    days,
  };
}
