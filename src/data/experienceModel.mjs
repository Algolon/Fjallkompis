/**
 * Pure selection / sorting / grouping / classification logic for the "Along the
 * way" stage experience layer (see docs/proposals/explore-more.md). Kept in
 * plain .mjs with a sibling .d.mts so `node --test` can exercise it without a
 * TypeScript toolchain — the same convention as itinerary.mjs and
 * stageGuides.mjs. The data module (src/data/routeExperiences.ts) and the React
 * layer both consume these functions, so the rules live in exactly one tested
 * place.
 *
 * Everything here is DIRECTION-AGNOSTIC: experiences associate with STABLE
 * physical segment ids (d1..d7), never display-day numbers, so a stage keeps its
 * experiences when the route direction flips. No function reads a day number.
 */

/** The three display groups, ordered by RISING commitment. */
export const EXPERIENCE_GROUP_ORDER = ['on-route', 'detours', 'larger'];

export const EXPERIENCE_GROUP_LABEL = {
  'on-route': 'On the route',
  detours: 'Short detours',
  larger: 'Larger options',
};

/** A short list stays flat; longer than this earns the commitment-group headers. */
export const GROUP_THRESHOLD = 3;

const GROUP_RANK = { 'on-route': 0, detours: 1, larger: 2 };

/** Which display group a scale falls into. */
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

/**
 * On-route sights expand INLINE to a sentence; everything larger opens a detail
 * view. Depth follows scale — this is the single source of that classification.
 */
export function isInlineExperience(scale) {
  return scale === 'on-route';
}

/**
 * Experiences along a stage, by STABLE segment id. Filtered by segment
 * membership, then ordered by rising commitment, preserving curated order within
 * a group (stable sort via original index). Multi-segment experiences (e.g. a
 * basecamp trip on d6+d7) appear for every segment they list.
 */
export function selectForStage(experiences, stageId) {
  return experiences
    .filter((x) => x.segmentIds.includes(stageId))
    .map((x, i) => ({ x, i }))
    .sort(
      (a, b) =>
        GROUP_RANK[experienceGroup(a.x.scale)] -
          GROUP_RANK[experienceGroup(b.x.scale)] || a.i - b.i,
    )
    .map((e) => e.x);
}

/**
 * Whether a stage should show the "Along the way" disclosure at all. False for
 * zero experiences — the UI must never render an empty "Along the way · 0".
 */
export function hasExperiences(experiences, stageId) {
  return experiences.some((x) => x.segmentIds.includes(stageId));
}

/**
 * Shape a stage-selected list for display. A short list (≤ GROUP_THRESHOLD)
 * stays flat; a longer one is split into the ordered commitment groups with
 * empty groups dropped. `selected` must already be stage-filtered and sorted
 * (via {@link selectForStage}).
 */
export function groupForDisplay(selected) {
  if (selected.length <= GROUP_THRESHOLD) {
    return { grouped: false, items: selected };
  }
  const groups = EXPERIENCE_GROUP_ORDER.map((group) => ({
    group,
    label: EXPERIENCE_GROUP_LABEL[group],
    items: selected.filter((x) => experienceGroup(x.scale) === group),
  })).filter((g) => g.items.length > 0);
  return { grouped: true, groups };
}

/**
 * Reference-integrity errors for one experience against the known stage/stop id
 * sets. Returns a list of human messages ([] when valid); the data module turns
 * any non-empty result into a thrown error at import, catching typos early.
 */
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
