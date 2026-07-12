/**
 * Icon keys for stage highlights — resolved to lucide-react components in
 * the UI layer (HIGHLIGHT_ICONS in src/screens/TodayScreen.tsx).
 */
export type StageHighlightIcon =
  | 'wind'
  | 'snowflake'
  | 'mountain-snow'
  | 'trending-down'
  | 'trending-up'
  | 'mountain'
  | 'trees'
  | 'signpost'
  | 'waves'
  | 'droplets'
  | 'sailboat'
  | 'users'
  | 'tree-pine';

/** One entry in the highlight taxonomy. */
export interface StageHighlightType {
  /** Canonical concise one-line label (≤ 20 characters, pinned by tests). */
  label: string;
  icon: StageHighlightIcon;
  /** Unique; lower = more important, survives the display cap. */
  priority: number;
}

/** A resolved highlight for one stage (taxonomy entry + its id). */
export interface StageHighlight extends StageHighlightType {
  id: string;
}

export declare const HIGHLIGHT_TYPES: Record<string, StageHighlightType>;
export declare const MAX_STAGE_HIGHLIGHTS: number;
export declare const STAGE_HIGHLIGHT_IDS: Record<string, readonly string[]>;

/**
 * The highlights to display for a stage: resolved, priority-sorted, capped
 * at MAX_STAGE_HIGHLIGHTS. Unknown stage ids return [].
 */
export declare function stageHighlights(
  stageId: string,
  max?: number,
): StageHighlight[];
