/**
 * Trail identity — the single stable id of the trail dossier this app is built
 * around.
 *
 * WHY THIS EXISTS
 * ---------------
 * Personal data references trail content by LOCAL ids: a hiking leg stores
 * `stageId: 'd1'`, an overnight stores a bare stop id. Those ids are only
 * meaningful inside one trail. Without an identity on the state envelope,
 * personal data written for a different route validates perfectly against the
 * Kungsleden topology and is silently reinterpreted — a `d1` leg from another
 * trail resolves to Abisko → Abiskojaure. The second-route architecture probe
 * (draft PR #97) demonstrated exactly that.
 *
 * This module is the one place the active trail's identity is defined. It
 * closes that hole at the ENVELOPE level: one id per stored state, checked
 * before any local id is interpreted. It deliberately does NOT introduce
 * per-object scoping (no prefixed stage ids, no composite keys) — while one
 * stored state represents exactly one trail, the envelope is the right and
 * smallest place for the check.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a trail registry, not a selector, not a content loader, and not a
 * content version. It identifies the DOSSIER, not a personal trip (there is
 * no tripId) and not a content generation (contentVersion is a separate,
 * later concern). The id is internal: nothing in the normal interface shows
 * or explains it.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` and the persistence
 * layer can import it without a TypeScript toolchain — the same convention as
 * direction.mjs / stateMigration.mjs.
 */

/**
 * The active trail dossier: the Kungsleden between Abisko and Nikkaluokta.
 *
 * Names the PHYSICAL route (the same endpoints as its source GPX,
 * `public/gpx/kungsleden-abisko-nikkaluokta.gpx`), never the walking
 * direction — a hiker walking Nikkaluokta → Abisko is on the same dossier and
 * keeps this exact id. It also never encodes an app or content version.
 *
 * Stable and immutable: changing this value would orphan every stored state,
 * so it must outlive releases, content edits and route regeneration.
 */
export const ACTIVE_TRAIL_ID = 'kungsleden-abisko-nikkaluokta';

/** A syntactically usable trail id: a non-empty, non-blank string. */
export function isTrailId(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The trail id a stored/imported state explicitly claims, or `null` when it
 * claims none.
 *
 * "Claims none" means the field is absent, `null`, or a blank string — the
 * shapes a legacy (pre-trailId) payload can legitimately have. Any OTHER
 * present value (a number, an object, an empty-after-trim string is treated as
 * absent) is a claim we cannot read; see {@link trailIdentityOf}.
 */
export function readTrailId(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw.trailId;
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/**
 * Classify an incoming state against the expected trail.
 *
 *  - `'legacy'`   — no identity claimed. Pre-trailId Kungsleden data: safe to
 *                   migrate and adopt (every state written before this schema
 *                   step was Kungsleden data by definition).
 *  - `'match'`    — claims exactly the expected trail. Business as usual.
 *  - `'mismatch'` — claims something else, INCLUDING a malformed claim (a
 *                   non-string id). For an identity field the safe direction
 *                   is to refuse: real Kungsleden states either omit the field
 *                   (legacy) or carry the exact string. Nothing legitimate is
 *                   rejected by treating an unreadable claim as foreign.
 */
export function trailIdentityOf(raw, expectedTrailId = ACTIVE_TRAIL_ID) {
  const claimed = readTrailId(raw);
  if (claimed === null) return 'legacy';
  if (claimed === expectedTrailId) return 'match';
  return 'mismatch';
}
