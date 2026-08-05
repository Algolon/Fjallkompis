/** One standing operational caveat, in the two registers the app renders. */
export interface TrailCaveat {
  /** One calm line for operational UI (Map cockpit, stage guide footer). */
  readonly short: string;
  /** The same statement with its reasoning, for Settings and context help. */
  readonly full: string;
  /** Keys into GUIDE_SOURCES (src/data/stageGuides.mjs). */
  readonly guideSourceIds: readonly string[];
  /** `name` values in TRIP_INFO_SOURCES (src/data/attribution.ts). */
  readonly tripInfoSourceNames: readonly string[];
}

/** The dossier's standing caveats — trail content, never personal state. */
export interface TrailCaveats {
  /** The app is an orientation aid, not a replacement for map and compass. */
  readonly navigation: TrailCaveat;
  /** Mobile coverage can be limited; do not depend on reach on the trail. */
  readonly connectivity: TrailCaveat;
}

export declare const TRAIL_CAVEATS: TrailCaveats;
