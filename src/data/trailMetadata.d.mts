/** Content metadata for the one trail dossier this app ships. */
export interface TrailContentMetadata {
  /** Exactly ACTIVE_TRAIL_ID — imported, never restated. */
  readonly trailId: string;
  /** Human dossier name; names the route span, not the walking direction. */
  readonly name: string;
  /** Positive, monotonic, hand-bumped edition of the curated content. */
  readonly contentVersion: number;
  /**
   * Whole-dossier review date, `YYYY-MM-DD`. Absent unless the ENTIRE dossier
   * was demonstrably reviewed as one piece — a per-source `lastVerified` is
   * not evidence for it.
   */
  readonly lastFullyReviewedOn?: string;
}

/** What the interface may say about the dossier. */
export interface TrailDossierView {
  name: string;
  /** Row label — deliberately distinct from the app's "App version". */
  contentVersionLabel: string;
  /** The content version as display text, e.g. "1". Never a semver. */
  contentVersion: string;
  /** ISO date, or null when no honest whole-dossier review date exists. */
  fullyReviewedOn: string | null;
}

export declare const TRAIL_CONTENT: TrailContentMetadata;
export declare function isFullReviewDate(value: unknown): value is string;
export declare function trailDossierView(
  meta?: TrailContentMetadata,
): TrailDossierView;
