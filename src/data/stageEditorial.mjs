/**
 * Short per-stage editorial: the one-line note shown on the Stages card and
 * the personal walking-time estimate, both keyed by STABLE physical segment id
 * ('d1'..'d7', the north-to-south generation order).
 *
 * Direction-aware notes
 * ---------------------
 * A one-line note is genuinely direction-dependent ("gentle start" vs "easy
 * final day"; "up to the pass" vs "down to Sälka"), so each stage carries a
 * note per {@link RouteDirection}. Notes are reoriented editorial — never a
 * word-for-word reversal — and stay grounded in the same verified route facts
 * as the fuller day guides (src/data/stageGuides.mjs).
 *
 * Walking-time estimate (direction-neutral, explicitly approximate)
 * ----------------------------------------------------------------
 * The GPX carries no timestamps, so estimatedHours has always been a personal
 * planning ESTIMATE the UI labels with a ± sign. It is stored once per physical
 * segment and REUSED for both directions: over these moderate gradients the
 * per-day up/down difference is modest, and the whole route's ascent and
 * descent are near-equal. Reverse times are therefore approximate, not
 * direction-specific measurements — see docs/decisions/0003-route-direction.md.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so the itinerary layer and
 * node --test can import it without a TypeScript toolchain — the same pattern
 * as stageGuides.mjs. src/data/stages.ts consumes the forward note to build the
 * canonical STAGES.
 */
import { DEFAULT_DIRECTION, normalizeDirection } from '../route/direction.mjs';

/**
 * Per physical segment: a direction-keyed one-line note and the (shared,
 * approximate) walking-time estimate in hours.
 */
export const STAGE_EDITORIAL = {
  d1: {
    estimatedHours: 5,
    notes: {
      'abisko-to-nikkaluokta':
        'Gentle start through birch forest along the Abiskojåkka river.',
      'nikkaluokta-to-abisko':
        'Easy final day: birch forest along the Abiskojåkka river down to Abisko.',
    },
  },
  d2: {
    estimatedHours: 6.5,
    notes: {
      'abisko-to-nikkaluokta':
        'Long day climbing above the treeline. Exposed and beautiful.',
      'nikkaluokta-to-abisko':
        'Long day descending below the treeline into birch forest. Exposed up high.',
    },
  },
  d3: {
    estimatedHours: 4.5,
    notes: {
      'abisko-to-nikkaluokta':
        'Open high valley. Wind picks up approaching the pass.',
      'nikkaluokta-to-abisko':
        'Open high valley, descending away from the pass. Often windy up top.',
    },
  },
  d4: {
    estimatedHours: 4.5,
    notes: {
      'abisko-to-nikkaluokta':
        'Over the Tjäktja pass (route high point), then down to Sälka.',
      'nikkaluokta-to-abisko':
        'Climb to the Tjäktja pass (route high point); the highest cabin sits just below it.',
    },
  },
  d5: {
    estimatedHours: 4,
    notes: {
      'abisko-to-nikkaluokta':
        'Valley walking. Singi is the junction for the Kebnekaise spur.',
      'nikkaluokta-to-abisko':
        'Valley walking. At Singi the route rejoins the main Kungsleden north.',
    },
  },
  d6: {
    estimatedHours: 5.5,
    notes: {
      'abisko-to-nikkaluokta':
        'Leave the main Kungsleden east toward Kebnekaise station.',
      'nikkaluokta-to-abisko':
        'Up the Kebnekaise valley to Singi, where the main Kungsleden begins.',
    },
  },
  d7: {
    estimatedHours: 6,
    notes: {
      'abisko-to-nikkaluokta':
        'Final stretch out to Nikkaluokta. Boat shortcut option on Láddjujávri.',
      'nikkaluokta-to-abisko':
        'First day in from Nikkaluokta. Boat shortcut option on Láddjujávri.',
    },
  },
};

/** The one-line note for a stage in the given direction (empty for unknowns). */
export function stageNote(stageId, direction) {
  const entry = STAGE_EDITORIAL[stageId];
  if (!entry) return '';
  return entry.notes[normalizeDirection(direction)] ?? '';
}

/** The (direction-neutral, approximate) walking-time estimate in hours. */
export function stageEstimatedHours(stageId) {
  return STAGE_EDITORIAL[stageId]?.estimatedHours ?? 0;
}

/** Convenience default-direction note (canonical Abisko → Nikkaluokta). */
export function forwardStageNote(stageId) {
  return stageNote(stageId, DEFAULT_DIRECTION);
}
