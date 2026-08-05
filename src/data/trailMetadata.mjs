/**
 * Trail content metadata — the publication identity of the curated trail
 * dossier this app ships.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fjällkompis keeps five different versioning concepts apart, and nothing may
 * derive one from another:
 *
 *   1. app version    — the software release (package.json → __APP_VERSION__).
 *   2. state schema   — the shape of PERSONAL data (SCHEMA_VERSION, v11).
 *   3. trail identity — WHICH dossier personal data belongs to
 *                       (ACTIVE_TRAIL_ID, src/data/trailIdentity.mjs).
 *   4. content version — WHICH published generation of the curated dossier
 *                       ships in this build. That is this module.
 *   5. offline assets — PMTiles archive names and cache keys (src/map/*).
 *
 * `trailId` answers "does this personal data belong here?" and is a silent
 * data-integrity contract. `contentVersion` answers a different question —
 * "which edition of the trail dossier am I reading?" — and is publishable.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a registry, not a list of trail packs, not a runtime selector, not a
 * loader, and not a mutable "active trail" context. It describes exactly one
 * dossier: the Kungsleden between Abisko and Nikkaluokta. A second trail is a
 * separate architectural step and deliberately has no seam here.
 *
 * It is also NOT part of personal state. Content metadata is compile-time
 * application content: it is not stored, not migrated, and never decides
 * whether a backup may be imported. An old personal backup stays valid for a
 * newer edition of the same dossier.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` can import it without a
 * TypeScript toolchain — the same convention as trailIdentity.mjs.
 */
import { ACTIVE_TRAIL_ID } from './trailIdentity.mjs';

/**
 * The active trail dossier's content metadata.
 *
 * `trailId` is imported, never restated: metadata and persisted identity must
 * be able to disagree only if someone edits one authority, and there is only
 * one.
 *
 * `name` is the human dossier name. It names the physical route span, so it
 * reads correctly for a hiker walking either way — walking direction is a
 * personal setting (src/route/direction.mjs) and changes neither this name nor
 * the id nor the content version.
 *
 * `contentVersion` is a positive, monotonically increasing integer. It is
 * bumped BY HAND, in the same commit as the content it publishes. See
 * "WHEN CONTENT VERSION CHANGES" below.
 *
 * `lastFullyReviewedOn` is intentionally ABSENT — see the honesty note at the
 * bottom of this file. Do not add it without evidence of a whole-dossier
 * review; a per-source `lastVerified` date is not that evidence.
 *
 * WHEN CONTENT VERSION CHANGES
 * ----------------------------
 * It goes up by 1 on a meaningful publication of curated dossier content:
 *   - route or stage content (distances, splits, stage editorial);
 *   - stops and curated places;
 *   - stage/day guides;
 *   - highlights and detours;
 *   - shops and resupply information;
 *   - transport references;
 *   - important warnings, validity windows or trust information.
 *
 * It does NOT change for:
 *   - app releases, CSS, refactors, dependency or tooling updates;
 *   - anything in personal data (SCHEMA_VERSION, migrations, packing
 *     templates — `packingTemplateVersion` is a personal-state concept and
 *     unrelated to this number);
 *   - regenerating derived build artefacts with identical content;
 *   - new PMTiles builds or cache-key changes (offline assets version
 *     independently — a basemap rebuild publishes no trail content);
 *   - typo fixes that change no fact.
 *
 * It is not a date, not a semver, not the app version, and it never encodes
 * the trail id or the walking direction. There is no generator and no release
 * bot: raising it is an editorial decision.
 *
 * Frozen because a publication identity must not be edited at runtime.
 */
export const TRAIL_CONTENT = Object.freeze({
  trailId: ACTIVE_TRAIL_ID,
  name: 'Kungsleden (Abisko–Nikkaluokta)',
  contentVersion: 1,
});

/**
 * A usable whole-dossier review date: a real calendar day in `YYYY-MM-DD`.
 *
 * Deliberately strict — `'2026-7-2'`, `'2026-02-30'` and anything non-string
 * are rejected rather than coerced, so a malformed value can never reach the
 * interface as a trust claim.
 */
export function isFullReviewDate(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  // Rejects overflow dates that Date() would silently roll forward.
  return date.toISOString().slice(0, 10) === value;
}

/**
 * What the interface may say about the dossier — a pure view model, so the
 * honesty rule is testable without a DOM.
 *
 * `fullyReviewedOn` is `null` unless a valid whole-dossier review date exists.
 * Nothing here claims the content is checked, current or up to date: a content
 * version is an edition, not a freshness guarantee. Per-source freshness stays
 * where it belongs — on the stop, guide, shop or transport record that was
 * actually verified.
 *
 * The date is returned raw (ISO); the caller formats it with the existing
 * `formatVerifiedDate` so dossier dates read exactly like source dates.
 */
export function trailDossierView(meta = TRAIL_CONTENT) {
  return {
    name: meta.name,
    contentVersionLabel: 'Content version',
    contentVersion: String(meta.contentVersion),
    fullyReviewedOn: isFullReviewDate(meta.lastFullyReviewedOn)
      ? meta.lastFullyReviewedOn
      : null,
  };
}

/**
 * HONESTY NOTE — why there is no `lastFullyReviewedOn` (2026-08-05)
 * ------------------------------------------------------------------
 * A whole-dossier review date may only be published when the WHOLE dossier —
 * route and stages, stops and places, stage guides, highlights and detours,
 * shops and resupply, transport references, sources, validity windows and
 * warnings — was demonstrably checked as one piece.
 *
 * The repository holds no such event. What it holds is a set of independent,
 * partial verification dates, each honest about its own scope:
 *
 *   - src/data/stops.ts        FACTS_VERIFIED_ON            2026-07-02
 *   - src/data/shops.mjs       SHOP_FACTS_VERIFIED_ON       2026-07-12
 *   - src/data/transport.mjs   TRANSPORT_FACTS_VERIFIED_ON  2026-07-12
 *   - src/data/journeyPlaces.mjs OFF_ROUTE_FACTS_VERIFIED_ON 2026-07-31
 *   - src/data/stageGuides.mjs per-guide lastVerified       2026-07-11…16
 *
 * …and several content areas carry no verification date at all (stages.ts,
 * stageEditorial.mjs, stageHighlights.mjs, routeExperiences' detour geometry).
 *
 * The newest of those dates is not a review of the rest, the oldest is not
 * either, and neither is the date of this commit. Inventing one would turn a
 * publication identity into a false freshness claim, which is the exact
 * failure this module exists to prevent. The field therefore stays absent
 * until a real whole-dossier review happens, and the interface says nothing
 * about content being checked.
 */
