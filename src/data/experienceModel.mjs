/**
 * Pure logic for the "Along the way" stage experience layer (see
 * docs/proposals/explore-more.md). Plain .mjs + sibling .d.mts so `node --test`
 * can exercise it without a TypeScript toolchain — the itinerary.mjs convention.
 * The data module and the React layer both consume these, so the rules live in
 * exactly one tested place.
 *
 * DIRECTION-SAFE: experiences associate with STABLE physical segment ids
 * (d1..d7) and carry a canonical position (0..1 from the segment's north/
 * canonical start). Presentation ORDER is derived from that position plus the
 * active direction; records are never duplicated per direction.
 */

// ─── Commitment grouping — kept for the future Explore Index, which answers a
//     different question ("what's worth doing across the route, by commitment").
//     Stage presentation uses PHYSICAL order instead (below).
export const EXPERIENCE_GROUP_ORDER = ['on-route', 'detours', 'larger'];
export const EXPERIENCE_GROUP_LABEL = {
  'on-route': 'On the route',
  detours: 'Short detours',
  larger: 'Larger options',
};
/** A short list stays flat; longer than this earns headers. */
export const GROUP_THRESHOLD = 3;

export function experienceGroup(scale) {
  switch (scale) {
    case 'on-route':
      return 'on-route';
    case 'mini-detour':
    case 'short-excursion':
      return 'detours';
    case 'half-full-day':
    case 'major-adventure':
      return 'larger';
    default:
      return 'larger';
  }
}

// ─── Stage presentation: order by the PHYSICAL journey ───────────────────────

/** A basecamp trip is launched from an overnight stop, not met "along" the walk. */
export function isBasecamp(experience) {
  return experience.location?.access === 'basecamp-trip';
}

/** Coarse canonical order position (0..1; 0.5 fallback). ORDERING ONLY — never a coordinate. */
export function segmentPosition(experience) {
  const p = experience.location?.orderHint;
  return typeof p === 'number' ? p : 0.5;
}

/** Position as WALKED in the given direction (reverse flips 0..1). */
export function walkedPosition(experience, direction) {
  const p = segmentPosition(experience);
  return direction === 'nikkaluokta-to-abisko' ? 1 - p : p;
}

/**
 * Experiences on a stage, split into the LINEAR on-stage items (ordered by the
 * physical order the hiker meets them, direction-aware) and the BASECAMP trips
 * (kept separate — not encountered "along" the walk). Stable within a position
 * tie via curated order. Reversing direction only reverses the linear order; no
 * record is duplicated.
 */
export function orderForStage(experiences, stageId, direction) {
  const along = experiences
    .map((x, i) => ({ x, i }))
    .filter((e) => e.x.segmentIds.includes(stageId));
  const linear = along.filter((e) => !isBasecamp(e.x));
  const basecamp = along.filter((e) => isBasecamp(e.x));
  linear.sort(
    (a, b) =>
      walkedPosition(a.x, direction) - walkedPosition(b.x, direction) ||
      a.i - b.i,
  );
  return { linear: linear.map((e) => e.x), basecamp: basecamp.map((e) => e.x) };
}

/** Whether a stage has any experiences (drives whether the disclosure shows). */
export function hasExperiences(experiences, stageId) {
  return experiences.some((x) => x.segmentIds.includes(stageId));
}

// Positional grouping — used only when a linear list is long enough to benefit.
export const POSITION_GROUP_ORDER = ['near-start', 'along', 'near-end'];
export const POSITION_GROUP_LABEL = {
  'near-start': 'Near the start',
  along: 'Along the stage',
  'near-end': 'Near the end',
};

export function positionGroup(walked) {
  if (walked < 1 / 3) return 'near-start';
  if (walked < 2 / 3) return 'along';
  return 'near-end';
}

/**
 * Stage display as ordered sections. Linear items keep journey order; a short
 * list (≤ GROUP_THRESHOLD) stays flat with no headers (never pad); a longer one
 * is split into Near the start / Along the stage / Near the end (empty dropped).
 * Basecamp trips are a separate trailing "Larger options" section. Returns [] if
 * the stage has nothing.
 */
export function groupForStageDisplay(experiences, stageId, direction) {
  const { linear, basecamp } = orderForStage(experiences, stageId, direction);
  const sections = [];
  if (linear.length > 0 && linear.length <= GROUP_THRESHOLD) {
    sections.push({ key: 'linear', label: null, items: linear });
  } else if (linear.length > GROUP_THRESHOLD) {
    for (const g of POSITION_GROUP_ORDER) {
      const items = linear.filter(
        (x) => positionGroup(walkedPosition(x, direction)) === g,
      );
      if (items.length) sections.push({ key: g, label: POSITION_GROUP_LABEL[g], items });
    }
  }
  if (basecamp.length > 0) {
    sections.push({ key: 'larger', label: 'Larger options', larger: true, items: basecamp });
  }
  return sections;
}

// ─── Inline vs detail: CONTENT DEPTH, not scale ──────────────────────────────

/**
 * A separate detail view is warranted when an item carries meaningful extra
 * planning/safety content that won't fit inline — a GPX route, multiple route
 * statistics, equipment, substantial weather sensitivity, multiple warnings,
 * turnaround advice, prep/booking or a major time commitment. Otherwise it stays
 * inline (short why-notice + planning fit + optional single warning + View on
 * map). Scale is deliberately NOT the rule.
 */
const MAJOR_TIME_SCALES = new Set(['half-full-day', 'major-adventure']);

export function needsDetailView(experience) {
  if (experience.expedition) return true; // equipment / turnaround / warnings / guide / booking
  if (experience.location && experience.location.gpxAssetId) return true; // a route to show
  if (MAJOR_TIME_SCALES.has(experience.scale)) return true; // major time commitment
  const stats = [
    experience.roundTripKm,
    experience.elevationGainM,
    experience.detourDistanceKm,
  ].filter((v) => v != null);
  if (stats.length >= 2) return true; // multiple route statistics
  if (experience.weatherSensitivity === 'high') return true;
  return false;
}

export function isInlineExperience(experience) {
  return !needsDetailView(experience);
}

// ─── Progressive provenance ──────────────────────────────────────────────────

/**
 * How much source/verification to surface, so attribution never clutters small
 * sights but is always visible where it matters:
 *  - 'shown'    major / safety-sensitive / time-sensitive / draft-spatial → source + date;
 *  - 'optional' medium (has a detail view) → a collapsible "Source";
 *  - 'hidden'   small stable on-route sight → no attribution in the primary UI.
 */
export function provenanceLevel(experience) {
  if (experience.expedition) return 'shown';
  if (experience.weatherSensitivity === 'high') return 'shown';
  if (needsDetailView(experience)) return 'optional';
  return 'hidden';
}

// ─── Map availability — the operational "View on map" gate ───────────────────

/**
 * Whether the Map may show a marker/route + a "View on map" action for an
 * experience. Draft / inferred / synthetic / missing geometry is always
 * `unavailable` in production, so this returns false until real verified data
 * exists. Never derive a coordinate from `orderHint` — that would be false
 * precision.
 */
export function canViewOnMap(experience) {
  const a = experience.location?.mapAvailability;
  return a === 'exact-point' || a === 'verified-route' || a === 'context-only';
}

/**
 * What the Map should render for an experience: a precise marker, the route
 * line, a clearly-labelled contextual area/direction, or nothing.
 */
export function mapDisplayKind(experience) {
  const a = experience.location?.mapAvailability;
  if (a === 'exact-point') return 'marker';
  if (a === 'verified-route') return 'route';
  if (a === 'context-only') return 'context';
  return 'none';
}

// ─── Reference integrity ─────────────────────────────────────────────────────

/** Errors for one experience against known stage/stop id sets ([] when valid). */
export function experienceRefErrors(experience, knownStageIds, knownStopIds) {
  const errors = [];
  if (!experience.segmentIds || experience.segmentIds.length === 0) {
    errors.push(`"${experience.id}" has no segmentIds`);
  }
  for (const segId of experience.segmentIds ?? []) {
    if (!knownStageIds.has(segId)) {
      errors.push(`"${experience.id}" references unknown segment "${segId}"`);
    }
  }
  if (experience.nearestStopId && !knownStopIds.has(experience.nearestStopId)) {
    errors.push(
      `"${experience.id}" references unknown stop "${experience.nearestStopId}"`,
    );
  }
  return errors;
}

/** Broken experience↔GPX-asset links, both directions ([] when all resolve). */
export function gpxRefErrors(experiences, assets) {
  const errors = [];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const expById = new Map(experiences.map((x) => [x.id, x]));
  for (const x of experiences) {
    const gid = x.location && x.location.gpxAssetId;
    if (gid && !assetById.has(gid)) {
      errors.push(`experience "${x.id}" references unknown GPX asset "${gid}"`);
    }
  }
  for (const a of assets) {
    if (!expById.has(a.experienceId)) {
      errors.push(`GPX asset "${a.id}" references unknown experience "${a.experienceId}"`);
    }
  }
  return errors;
}
