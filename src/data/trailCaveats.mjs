/**
 * Standing operational caveats for the curated trail dossier.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two things a hiker has to know are true for the WHOLE dossier, on every
 * stage and every day, and neither belongs to any single stop, guide or
 * timetable:
 *
 *  1. NAVIGATION — Fjällkompis shows an offline topographic map, a GPS
 *     position, Locate me, live tracking and on/off-route feedback. Together
 *     those read like a navigator, and until now nothing in the app said they
 *     are not one. The sources the dossier already cites frame their own maps
 *     the same way (STF's Signature Trail page and Naturkartan present a
 *     planning map, not a replacement for map and compass), and the app's own
 *     packing seed already marks a paper map and a compass as essential — so
 *     the interface was the only place the statement was missing.
 *
 *  2. CONNECTIVITY — several dossier flows read as if a phone will work:
 *     operator numbers, payment methods, booking instructions, a live SJ
 *     planner and "check the official source" links. STF's own boat page
 *     warns that mountain coverage can be limited. Saying so once, where
 *     those flows are, is the difference between a reference and a trap.
 *
 * WHAT THIS IS
 * ------------
 * Trail CONTENT: verified, citable statements about walking this route with
 * this dossier. Not personal state — nothing here is stored, migrated,
 * exported or dismissible, and no caveat depends on the walking direction,
 * the day plan or which stage is current. There is nothing to persist.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a warnings framework, not a notification system, not a liability
 * document and not a consent gate. It is two records with two registers of
 * the same statement, so a screen can pick the one that fits its space
 * without any component writing safety copy of its own. A third caveat that
 * is really a per-stop, per-guide or per-timetable fact belongs on that
 * record, not here.
 *
 * TWO REGISTERS, ONE MEANING
 * --------------------------
 *   `short` — one calm line for operational UI, where the hiker is doing
 *             something else and the caveat must not take over the screen.
 *   `full`  — calm preparation copy for a surface with room for the complete
 *             responsibility note (Settings → Trail Readiness).
 *
 * They are never shown together on one surface, and no component may restate
 * either of them — fenced by tests/trail-caveats.test.mjs.
 *
 * WHAT THE COPY MAY NOT DO
 * ------------------------
 * The connectivity caveat describes a POSSIBILITY and a precaution. It must
 * not claim there is no coverage anywhere, that a named operator is
 * unreachable, or that a payment method is guaranteed to fail — the dossier
 * has evidence for none of those, and an overstated warning is as wrong as a
 * missing one.
 *
 * PROVENANCE
 * ----------
 * Each caveat names the already-registered primary sources it rests on, so
 * the statement is auditable without adding a source record for it:
 *   - `guideSourceIds`      — keys into GUIDE_SOURCES (src/data/stageGuides.mjs);
 *   - `tripInfoSourceNames` — `name` values in TRIP_INFO_SOURCES
 *                             (src/data/attribution.ts).
 * Both registries keep their own links, scope and verification dates; nothing
 * is copied here. The references are validated in the test suite rather than
 * rendered as a second link list — these caveats explain how to use the
 * dossier, and the sources behind them stay in the credits sheet where every
 * other source lives.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` can import it without a
 * TypeScript toolchain — the same convention as trailMetadata.mjs.
 */

/**
 * The dossier's two standing caveats.
 *
 * Frozen, including the source-reference arrays: what the dossier warns about
 * is a compile-time editorial fact, not runtime state.
 */
export const TRAIL_CAVEATS = Object.freeze({
  /**
   * The short register qualifies active navigation in the Map cockpit. The
   * full register is the central preparation note in Trail Readiness; it is
   * deliberately not repeated after every Stage Guide.
   */
  navigation: Object.freeze({
    short: 'Planning and orientation aid — carry a map and compass.',
    full:
      'Trail, water and weather conditions vary; check locally.\n' +
      'Plan ahead and carry a map and compass.',
    guideSourceIds: Object.freeze(['stf-kungsleden-abisko', 'naturkartan-bd21']),
    tripInfoSourceNames: Object.freeze([]),
  }),

  /**
   * Said where the dossier points at something that needs a working phone:
   * transport times, prices, payment, booking and live planner links.
   */
  connectivity: Object.freeze({
    short: 'Mobile coverage can be limited — save tickets and timetables offline.',
    full:
      'Mobile coverage along the trail can be limited or absent, and it varies from ' +
      'place to place. Save tickets, timetables and booking confirmations offline ' +
      'before you leave, and plan so that a phone call, a Swish or card payment, or ' +
      'a live planner link is never the only way to reach, pay or check something.',
    guideSourceIds: Object.freeze([]),
    tripInfoSourceNames: Object.freeze([
      'Alesjaure–Abiskojaure boat',
      'Láddjujávri boat',
    ]),
  }),
});
