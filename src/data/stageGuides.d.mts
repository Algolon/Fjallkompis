/** An editorial source a stage guide draws on. */
export interface StageGuideSource {
  label: string;
  url: string;
}

/**
 * Editorial day guide for one stage. GPX-derived statistics stay
 * authoritative elsewhere (src/route/routeData); this is static, hedged
 * route guidance — never live conditions.
 */
export interface StageGuide {
  /** 2–3 sentences: what the day is like. */
  overview: string;
  /** Compact underfoot/character description. */
  terrain: string;
  /** 2–4 genuinely useful landmarks or transitions. */
  highlights: string[];
  /** Stage-specific planning considerations only. */
  watchFor?: string[];
  /** Keys into GUIDE_SOURCES. */
  sourceIds: string[];
  /** ISO date the editorial facts were last verified. */
  lastVerified: string;
}

export declare const GUIDE_SOURCES: Record<string, StageGuideSource>;
export declare const STAGE_GUIDES: Record<string, StageGuide>;
