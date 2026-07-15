/**
 * Pure logic for the Highlights & detours stage experience layer (see
 * docs/proposals/highlights-and-detours.md). Plain .mjs + sibling .d.mts so
 * `node --test` can exercise it without a TypeScript toolchain — the
 * itinerary.mjs convention.
 * The data module and the React layer both consume these, so the rules live in
 * exactly one tested place.
 *
 * DIRECTION-SAFE: experiences associate with STABLE physical segment ids
 * (d1..d7) and carry a canonical position (0..1 from the segment's north/
 * canonical start). Presentation ORDER is derived from that position plus the
 * active direction; records are never duplicated per direction.
 */

// ─── Highlight vs Detour — DERIVED from the spatial `access` field ───────────
//
// The Stage presents two internal sections. The split is not a new dimension:
// it reads the existing `access` relationship.
//  - Highlight — experienced while following the normal stage route
//    (on-trail / beside-trail / visible-from-trail);
//  - Detour — the hiker deliberately leaves the route
//    (short-detour / side-route / basecamp-trip).

/** Access relationships that mean "you leave the normal route". */
const DETOUR_ACCESS = new Set(['short-detour', 'side-route', 'basecamp-trip']);

/** 'detour' when the hiker leaves the route; 'highlight' otherwise. */
export function experienceKind(experience) {
  return DETOUR_ACCESS.has(experience.location?.access) ? 'detour' : 'highlight';
}
export function isHighlight(experience) {
  return experienceKind(experience) === 'highlight';
}
export function isDetour(experience) {
  return experienceKind(experience) === 'detour';
}

// ─── Stage presentation: order by the PHYSICAL journey ───────────────────────

/** A basecamp trip is launched from an overnight stop, not met "along" the walk. */
export function isBasecamp(experience) {
  return experience.location?.access === 'basecamp-trip';
}

/** A route-wide observation (a stretch/zone, not a single point or destination). */
export function isRouteWide(experience) {
  const kind = experience.location?.kind;
  return kind === 'segment-portion' || kind === 'area';
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

/** Whether a stage has any experiences (drives whether the disclosure shows). */
export function hasExperiences(experiences, stageId) {
  return experiences.some((x) => x.segmentIds.includes(stageId));
}

/**
 * The two internal Stage sections, each journey-ordered and direction-aware:
 *  - `highlights` — on/beside/visible-from the trail, ordered by the physical
 *    order the hiker meets them (reverse flips it);
 *  - `detours` — route detours ordered by where they leave the trail, with the
 *    basecamp trips kept visibly LAST (launched from an overnight stop, not met
 *    "along" the walk).
 * `basecamp` is also returned split out so the UI can label that trailing group.
 * Returns empty arrays when the stage carries nothing.
 */
export function highlightsAndDetoursForStage(experiences, stageId, direction) {
  const onStage = experiences
    .map((x, i) => ({ x, i }))
    .filter((e) => e.x.segmentIds.includes(stageId));
  const byWalked = (a, b) =>
    walkedPosition(a.x, direction) - walkedPosition(b.x, direction) || a.i - b.i;

  const highlights = onStage.filter((e) => isHighlight(e.x)).sort(byWalked);
  const routeDetours = onStage
    .filter((e) => isDetour(e.x) && !isBasecamp(e.x))
    .sort(byWalked);
  // Basecamp trips have no trail position — keep them in curated order, last.
  const basecamp = onStage
    .filter((e) => isBasecamp(e.x))
    .sort((a, b) => a.i - b.i);

  return {
    highlights: highlights.map((e) => e.x),
    detours: [...routeDetours, ...basecamp].map((e) => e.x),
    basecamp: basecamp.map((e) => e.x),
  };
}

/**
 * Optional per-row journey-position label for a Highlight — 'Near the start' /
 * 'Near the end', direction-aware. The quiet middle band and route-wide
 * observations return null (no invented precision), so the label appears only
 * where it genuinely helps orient the reader.
 */
export function journeyPositionLabel(experience, direction) {
  if (isRouteWide(experience)) return null;
  const walked = walkedPosition(experience, direction);
  if (walked < 1 / 3) return 'Near the start';
  if (walked >= 2 / 3) return 'Near the end';
  return null;
}

// ─── Progressive provenance ──────────────────────────────────────────────────

/**
 * How much source/verification to surface, so attribution never clutters small
 * sights but is always visible where it matters:
 *  - 'shown'    safety-/time-sensitive (expedition, high weather sensitivity) → source + date;
 *  - 'optional' a committing detour → a collapsible "Source" inside the card;
 *  - 'hidden'   an on-route highlight → no attribution in the primary UI.
 */
export function provenanceLevel(experience) {
  if (experience.expedition) return 'shown';
  if (experience.weatherSensitivity === 'high') return 'shown';
  if (isDetour(experience)) return 'optional';
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
  return (
    a === 'exact-point' ||
    a === 'verified-route' ||
    a === 'context-only' ||
    a === 'full-stage'
  );
}

/**
 * What the Map should render for an experience: a precise marker, the route
 * line, a clearly-labelled contextual area/direction, the whole Stage, or
 * nothing.
 */
export function mapDisplayKind(experience) {
  const a = experience.location?.mapAvailability;
  if (a === 'exact-point') return 'marker';
  if (a === 'verified-route') return 'route';
  if (a === 'context-only') return 'context';
  if (a === 'full-stage') return 'stage';
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
