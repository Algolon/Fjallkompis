/**
 * Hiking legs — the explicit per-day route model.
 *
 * A personal Hiking day owns an ordered list of LEGS. Each leg references one
 * physical canonical stage by its stable id ('d1'..'d7') and an ABSOLUTE
 * orientation over that physical segment:
 *
 *   'canonical'  the stage as stored (the north-to-south generation order);
 *   'opposite'   the same verified physical route walked in reverse.
 *
 * Orientation is a property of the LEG, never of the app's selected route
 * direction: a plan authored while walking Nikkaluokta → Abisko stores
 * 'opposite' legs, and re-reading it can never reinterpret them. The canonical
 * stage itself — geometry, statistics, guides, highlights, detours — is never
 * edited, regenerated or fabricated here; a leg only points at it.
 *
 * Unlike the pre-v10 stage-count model there is NO route partition invariant:
 * a stage may appear on no day, one day, several days, or several times on the
 * same day (an out-and-back). What remains structurally required is that the
 * legs WITHIN one Hiking activity connect physically end-to-start — a day's
 * walk is one continuous line on the ground. Everything else (skipped stages,
 * repeats, reversals, early finishes) is a DIAGNOSTIC, not an error — see
 * coverageDiagnostics.mjs.
 *
 * Topology injection: every predicate takes `topology`, an ordered array of
 *   { id, fromStopId, toStopId }
 * descriptors of the canonical stages (canonical order, canonical direction).
 * The caller derives it from the verified route data; this module stays free
 * of route-data imports, the same convention stateMigration.mjs follows.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` exercises
 * the model directly — the convention shared with dayPlan.mjs.
 */

/** The one supported leg kind. Deliberately closed — no custom-route member. */
export const HIKING_LEG_KINDS = ['canonical-stage'];

/** Absolute orientations over the physical canonical stage. */
export const HIKING_LEG_ORIENTATIONS = ['canonical', 'opposite'];

export function isHikingLegOrientation(value) {
  return HIKING_LEG_ORIENTATIONS.includes(value);
}

/** Stable leg id — same shape as day / trip item / wallet document ids. */
export function newHikingLegId() {
  return `leg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Deterministic id for a leg created by the v9 → v10 migration. In a v9 plan
 * every canonical stage was consumed exactly once, so (day id, stage id) is
 * unique — migrating the same payload twice yields byte-identical legs.
 */
export function migratedHikingLegId(dayId, stageId) {
  return `leg_${dayId}_${stageId}`;
}

/** The topology descriptor for a stage id, or null. */
export function topologyStage(topology, stageId) {
  if (!Array.isArray(topology) || typeof stageId !== 'string') return null;
  return topology.find((s) => s?.id === stageId) ?? null;
}

/**
 * True for a well-formed leg whose stage exists in the canonical topology.
 * Malformed objects, unknown kinds, unknown stages and unknown orientations
 * are all hard failures — a leg either resolves to verified data or it is
 * invalid, never partially interpreted.
 */
export function isValidHikingLeg(leg, topology) {
  if (leg == null || typeof leg !== 'object' || Array.isArray(leg)) return false;
  if (typeof leg.id !== 'string' || leg.id === '') return false;
  if (leg.kind !== 'canonical-stage') return false;
  if (!isHikingLegOrientation(leg.orientation)) return false;
  return topologyStage(topology, leg.stageId) !== null;
}

/**
 * The oriented endpoints of a leg: where it physically starts and ends. An
 * 'opposite' leg swaps the canonical stage's endpoints. Null when the leg
 * cannot be resolved against the topology.
 */
export function orientedLegEndpoints(leg, topology) {
  if (!isValidHikingLeg(leg, topology)) return null;
  const stage = topologyStage(topology, leg.stageId);
  return leg.orientation === 'opposite'
    ? { fromStopId: stage.toStopId, toStopId: stage.fromStopId }
    : { fromStopId: stage.fromStopId, toStopId: stage.toStopId };
}

/** True when leg `b` physically continues from where leg `a` ends. */
export function legsConnect(a, b, topology) {
  const endA = orientedLegEndpoints(a, topology);
  const startB = orientedLegEndpoints(b, topology);
  return endA !== null && startB !== null && endA.toStopId === startB.fromStopId;
}

/**
 * True when every consecutive pair of legs connects end-to-start. A single
 * leg is trivially connected; an empty list is NOT a connected walk (a
 * persisted Hiking activity cannot have zero legs).
 */
export function isConnectedLegSequence(legs, topology) {
  if (!Array.isArray(legs) || legs.length === 0) return false;
  for (const leg of legs) if (!isValidHikingLeg(leg, topology)) return false;
  for (let i = 1; i < legs.length; i++) {
    if (!legsConnect(legs[i - 1], legs[i], topology)) return false;
  }
  return true;
}

/**
 * Full structural validity for one Hiking activity's legs: a non-empty,
 * physically connected sequence of well-formed legs. Duplicate leg IDS are
 * checked plan-wide by dayPlan.mjs (a leg id must be unique across the whole
 * plan, not merely within its day).
 */
export function isValidHikingLegs(legs, topology) {
  return isConnectedLegSequence(legs, topology);
}

// ---- Candidates -------------------------------------------------------------

/**
 * Every leg that could physically START at `stopId`: for each canonical stage
 * touching that stop, the orientation that departs from it. On a linear route
 * this yields at most two candidates (continue, or turn around) and exactly
 * one at either route end. Ordered by canonical stage order, 'canonical'
 * orientation first — a stable, deterministic order for the editor.
 */
export function legCandidatesFrom(topology, stopId) {
  if (!Array.isArray(topology) || typeof stopId !== 'string') return [];
  const out = [];
  for (const stage of topology) {
    if (stage?.fromStopId === stopId) {
      out.push({
        stageId: stage.id,
        orientation: 'canonical',
        fromStopId: stage.fromStopId,
        toStopId: stage.toStopId,
      });
    }
    if (stage?.toStopId === stopId) {
      out.push({
        stageId: stage.id,
        orientation: 'opposite',
        fromStopId: stage.toStopId,
        toStopId: stage.fromStopId,
      });
    }
  }
  return out;
}

/** Every leg that could physically END at `stopId` — for prepending. */
export function legCandidatesTo(topology, stopId) {
  if (!Array.isArray(topology) || typeof stopId !== 'string') return [];
  const out = [];
  for (const stage of topology) {
    if (stage?.toStopId === stopId) {
      out.push({
        stageId: stage.id,
        orientation: 'canonical',
        fromStopId: stage.fromStopId,
        toStopId: stage.toStopId,
      });
    }
    if (stage?.fromStopId === stopId) {
      out.push({
        stageId: stage.id,
        orientation: 'opposite',
        fromStopId: stage.toStopId,
        toStopId: stage.fromStopId,
      });
    }
  }
  return out;
}

// ---- Editing (pure; every helper returns a NEW array, or the input on refusal)

const freshLeg = (stageId, orientation, id) => ({
  id: id ?? newHikingLegId(),
  kind: 'canonical-stage',
  stageId,
  orientation,
});

/**
 * Append (position 'end') or prepend (position 'start') a leg. Refused —
 * input returned unchanged — when the result would not be a connected
 * sequence. An explicit `id` is for tests and migration; callers normally
 * omit it and get a fresh unique id.
 */
export function withLegAdded(legs, stageId, orientation, position, topology, id) {
  if (!Array.isArray(legs)) return [];
  const leg = freshLeg(stageId, orientation, id);
  const next = position === 'start' ? [leg, ...legs] : [...legs, leg];
  return isConnectedLegSequence(next, topology) ? next : legs;
}

/**
 * True when removing this leg keeps the remaining sequence connected (ends
 * are always safe; a middle leg only when its neighbours meet). Removing the
 * FINAL leg is never allowed here — an empty Hiking activity is invalid, and
 * emptying a day of walking is a different, explicit decision (remove the
 * activity), taken in dayPlan.mjs.
 */
export function canRemoveLeg(legs, legId, topology) {
  if (!Array.isArray(legs) || legs.length <= 1) return false;
  const index = legs.findIndex((l) => l?.id === legId);
  if (index === -1) return false;
  const next = legs.filter((l) => l.id !== legId);
  return isConnectedLegSequence(next, topology);
}

/** Remove a leg. Refused (input unchanged) when `canRemoveLeg` says no. */
export function withLegRemoved(legs, legId, topology) {
  if (!Array.isArray(legs)) return [];
  if (!canRemoveLeg(legs, legId, topology)) return legs;
  return legs.filter((l) => l.id !== legId);
}

/**
 * True when flipping this leg's orientation keeps the whole sequence
 * connected. Always true for a single-leg day; in a longer sequence only
 * where the flipped endpoints still meet both neighbours.
 */
export function canReverseLeg(legs, legId, topology) {
  if (!Array.isArray(legs)) return false;
  const index = legs.findIndex((l) => l?.id === legId);
  if (index === -1) return false;
  const next = legs.map((l) =>
    l.id === legId
      ? { ...l, orientation: l.orientation === 'opposite' ? 'canonical' : 'opposite' }
      : l,
  );
  return isConnectedLegSequence(next, topology);
}

/** Flip a leg's absolute orientation. Refused (input unchanged) when unsafe. */
export function withLegReversed(legs, legId, topology) {
  if (!Array.isArray(legs)) return [];
  if (!canReverseLeg(legs, legId, topology)) return legs;
  return legs.map((l) =>
    l.id === legId
      ? { ...l, orientation: l.orientation === 'opposite' ? 'canonical' : 'opposite' }
      : l,
  );
}

/**
 * Repeat a leg's stage immediately after it, as a SECOND occurrence with its
 * own id — the first leg is never moved or reused. The repetition walks the
 * same physical stage back in the other absolute orientation, which is the
 * only continuation that connects (an out-and-back). Refused when it would
 * not connect (unreachable on a well-formed sequence, kept for safety).
 */
export function withLegRepeated(legs, legId, topology, id) {
  if (!Array.isArray(legs)) return [];
  const index = legs.findIndex((l) => l?.id === legId);
  if (index === -1) return legs;
  const source = legs[index];
  const repeat = freshLeg(
    source.stageId,
    source.orientation === 'opposite' ? 'canonical' : 'opposite',
    id,
  );
  const next = [...legs.slice(0, index + 1), repeat, ...legs.slice(index + 1)];
  return isConnectedLegSequence(next, topology) ? next : legs;
}

/**
 * Move the leg at `fromIndex` to `toIndex`. Refused (input unchanged) unless
 * the reordered sequence is still physically connected — reordering is rare
 * (most connected sequences admit exactly one order) but an out-and-back of
 * symmetric halves is legitimately reorderable.
 */
export function withLegMoved(legs, fromIndex, toIndex, topology) {
  if (!Array.isArray(legs)) return [];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return legs;
  if (fromIndex < 0 || fromIndex >= legs.length) return legs;
  if (toIndex < 0 || toIndex >= legs.length) return legs;
  if (fromIndex === toIndex) return legs;
  const next = [...legs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return isConnectedLegSequence(next, topology) ? next : legs;
}

// ---- Normalisation ----------------------------------------------------------

/**
 * Normalise one persisted leg: verbatim when valid, null when irrecoverable.
 * Unknown extra fields are dropped, never carried through. No repair is
 * attempted beyond that — a leg that does not resolve to verified stage data
 * must fail loudly (its activity becomes invalid) rather than be guessed at.
 */
export function normalizeHikingLeg(raw, topology) {
  if (!isValidHikingLeg(raw, topology)) return null;
  return {
    id: raw.id,
    kind: 'canonical-stage',
    stageId: raw.stageId,
    orientation: raw.orientation,
  };
}
