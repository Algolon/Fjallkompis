# Second-route architecture probe — report

**Status:** evidence artifact. Not a foundation, not a second trail, not for merge as product work.
**Decision gate:** **NARROW** (see §6).

This probe places a second, deliberately different **real** route beside Kungsleden and records what
today's architecture actually does. No file under `src/`, no existing test, no script, no dependency
and no generated asset was changed. Everything here is additive and deletable in one step (§8).

---

## 1. Fixture

`tests/fixtures/second-route/delft-pilot.gpx` — the historical Delft pilot route, restored **verbatim**
from this repository's own history:

```
git show 4ada992^:public/gpx/delft-pilot.gpx      # blob f989da6, sha256 e1d41fb2…
```

**Provenance is real, not synthesised.** The file was drawn in gpx.studio with the *walking routing*
profile, so its geometry follows real OSM-mapped pavements — which is why its track points still carry
the OSM way tags the router put there (`<highway>residential</highway>`, `<surface>paving_stones</surface>`).
It was then physically field-walked on 2026-07-07 (`docs/pilot-results/delft-2026-07-07-summary.md`
at that commit). The probe tests assert the restored bytes hash to the historical blob, so provenance
cannot silently drift. Full detail in `provenance.json`.

**Why this route:** ~52°N vs ~68°N, ~2 km vs ~105 km, near-square bounds vs strongly north–south,
flat vs alpine, and no STF hut model behind its endpoints.

**One derivation, and why it is not invented geometry.** The historical pilot was single-stage, which
cannot exercise stage ordering, multi-leg days or reversal. `deriveMultiStageGpx()` therefore splits
the stage polyline into three stages **in memory**, cutting at existing track-point indices and placing
the two new waypoints on those exact existing coordinates. Every lat/lon stays byte-equal to the
historical file; only the segment/waypoint framing is derived. The file on disk is never rewritten.

**Why this is not a product trail.** A ~2 km urban walk is not a multi-day hike and is not a candidate
for the product. Kungsleden remains the only visible trail.

**Deliberate ID collision.** The historical config used `stageIdPrefix: 'p'`, commented *"never 'd', so
pilot stage ids can never collide with the persisted Kungsleden stage ids"*. That **avoided** the
collision rather than solving it. This probe uses `'d'` on purpose, so both trails legitimately produce
`d1/d2/d3` and the collision becomes observable.

---

## 2. Hypotheses

| # | Hypothesis | Outcome | Evidence |
|---|---|---|---|
| H1 | Route generation is really multi-route capable | **HELD** | `buildRouteData(xml, config)` processed the second route with `problems: []` — 3 stages, statistics, bounds, elevation, per-trail buffers — with no change to `src/` or `scripts/`. Every Kungsleden default proved to be a config field. |
| H2 | Route/itinerary logic accepts injected topology | **HELD (geometry) / BROKE (stop identity)** | Ordering, reversal, day re-derivation and mirrored distances are all correct for a foreign route. But `buildDirectionalItinerary` resolves stops via the module constant `WAYPOINT_TO_HUT`, so `stopOrder` — declared `string[]` — comes back `undefined[]`, and `startStopId`/`endStopId` (declared `string \| null`) come back `undefined`. |
| H3 | Personal core is really trail-agnostic | **HELD for `plan`/`trip`/`wallet`; BROKE for persisted identity** | `src/plan/*`, `src/trip/*`, `src/wallet/*` and packing needed **no change**: topology is injected everywhere, and a Stay keeps a foreign `linkedPlaceId` verbatim. But the persisted blob has no trail identity, so a probe-trail day plan normalises cleanly against the **Kungsleden** topology and its legs silently re-point to `d1/d2/d3`. |
| H4 | Local ids are only safe inside a trail scope | **BROKE** | Both trails mint `d1/d2/d3`. `topologyStage(merged, 'd1')` returns Kungsleden (first match wins). A probe leg `{stageId:'d1'}` is `isValidHikingLeg(...) === true` against Kungsleden topology and `orientedLegEndpoints` resolves it to **abisko → abiskojaure**. Merged topology yields duplicated `missingStageIds`. |
| H5 | Coverage/map contracts work outside Kungsleden | **HELD (camera) / BROKE (envelope)** | `cameraConstraintsFor` is pure maths on injected bounds and scales correctly to 52°N and 2 km. But `overviewEnvelope` derives north/south by shrinking the data bounds inward by a fixed 2000 m of mercator: for the probe route the envelope no longer contains the data bounds, and below ~2.5 km of route height it **inverts** (south > north). |
| H6 | Direction is config, not a core concept | **KNOWN LIMITATION + new BROKE** | The Kungsleden literals were already known and are not re-litigated. New: `normalizeDirection` **silently coerces** any foreign value to `abisko-to-nikkaluokta` and `isReversed` reports `false` — a second trail's vocabulary is swallowed, never rejected. Separately HELD: planning modules use direction only through `isReversed()`, so they need **ordering only**. |
| H7 | Content access can take one boundary | **HELD (shape) / FINDING (surface)** | Both trails fit the same minimal categories (descriptor, topology, places, editorial, logistics, source, assets). `hydrate.ts` is already generic — its docstring still names the Delft pilot — and carries no Kungsleden coupling. But 20 files under `src/` reach trail content by direct compile-time import, and there is no access boundary today. Editorial content should be an **optional capability**, not empty data. |
| H8 | Persistence | **INCONCLUSIVE BY DESIGN** | Asserted as an executable admission. See §5. |

All 35 probe tests pass. Tests named `BROKE:` characterise today's wrong-for-multi-trail behaviour
deliberately — they are a baseline, not a contract to preserve.

---

## 3. New findings vs already-known limitations

**Already known (impact only, no probe credit claimed):** Kungsleden direction literals; STF-flavoured
`TripStayType`/`ShopType`/wallet categories — all of which have an `other` escape hatch, so they
describe a second trail poorly but never block it; Kungsleden archive/cache names; direct content
imports; absent trail scope.

**New, and only visible with a second dataset present:**

1. A foreign personal plan **validates as legitimate** against the wrong trail and resolves to that
   trail's places — silently, with no error path (H4).
2. The persisted state has no identity that could detect this, and `normalizeState` adopts it wholesale (H3).
3. `stopOrder`/`startStopId`/`endStopId` violate their own declared TypeScript contract by returning
   `undefined`, invisible to the compiler because they come from a `Record` index access (H2).
4. `overviewEnvelope` inverts for short routes — a documented safety cap that stops being a cap (H5).
5. `normalizeDirection` cannot signal a mismatch; foreign directions load as forward (H6).
6. The route manifest kept its multi-route *contract* but its *fields* drifted while only one route
   existed: the historical `mapBufferKm` became `userBufferKm` + `dataMarginKm`, and a config written
   against the old shape now yields **NaN bounds** rather than a loud failure (H1).

---

## 4. Core-touch estimate

**Necessary** (identity, content access, config, asset descriptors — and the two real breaks):

| File | Why |
|---|---|
| `src/route/waypointStops.mjs` | `WAYPOINT_TO_HUT` must become injected per-trail data, not a module constant |
| `src/route/itinerary.mjs` | take the waypoint→place map as a parameter; return `null`, never `undefined` |
| `src/route/direction.mjs` | direction becomes per-trail config (ordered endpoint pair + reversed flag) |
| `src/route/routeData.ts` | the single content entry point (today a direct Kungsleden import) |
| `src/route/activeItinerary.ts` | consume the boundary instead of importing content |
| `src/utils/stateMigration.mjs` | add trail identity to the persisted blob; refuse/quarantine a mismatch |
| `src/map/cameraBounds.mjs` | `overviewEnvelope` must clamp to the data bounds, not shrink inside them |
| `src/store/AppStore.tsx` | hold the active trail descriptor |
| `src/data/stages.ts`, `src/data/stops.ts` | become trail-scoped datasets behind the boundary |
| `scripts/route-configs.mjs` | restore optional entries; add `contentVersion` |

**Likely** (mostly mechanical): `src/utils/storage.ts`; `src/map/offlineMap.ts` and
`src/map/pmtilesProtocol.ts` (Kungsleden archive names and cache keys); `src/data/attribution.ts`;
and the ~13 UI components that import `stops`/`stages` directly for display.

**Deliberately deferred:** a generic direction model; trail catalogue, selector or pack store; multiple
simultaneous trips; generalising the STF taxonomies (the `other` escape hatch makes this optional); the
"route is taller than wide" camera-fit assumption — the probe route is near-square and does **not**
falsify it, so abstracting it now would be speculative.

**Personal core:** supporting the fixture required **no change** to `src/plan/*`, `src/trip/*` or
`src/wallet/*`. This is the probe's strongest positive result. What those modules need is not
modification but a **trail-scoped reference** for the ids they already accept by injection.

---

## 5. Persistence — not proven by this probe

This probe validates none of: migration of existing v10 data; backward compatibility of exports;
wallet document scoping; switching the active trail with personal data present; more than one saved
trip; missing or partial trail packs; `contentVersion` migrations.

What it *did* establish is narrow and negative: the blob has no trail identity, and nothing in the
current path can detect a foreign plan. Everything else is an open question for the `trailId` foundation.

---

## 6. Decision gate — NARROW

Not PROCEED, and not STOP.

**Not STOP:** the fixture was processed end-to-end with zero production changes. `src/plan/*`,
`src/trip/*` and `src/wallet/*` — the expensive, risky layer — are genuinely trail-agnostic. Topology
injection holds completely. No plugin framework or runtime CMS is implied.

**Not PROCEED:** persistence is unproven by design (§5), the silent-adoption failure (H3/H4) is a real
data-safety unknown rather than a cosmetic gap, direction needs a product decision this probe cannot
make, and 20 files reach content directly — more production surface than is justified before a real
second hike exists.

**Recommended consequence:** adopt `contentVersion`; optionally add `trailId` **additively**; introduce
**one** content access boundary. Make no general second-trail support claim.

**Next recommended foundation PR:** `contentVersion` + an additive `trailId` on the persisted state,
with `normalizeState` refusing (not adopting) a blob whose `trailId` does not match the active trail —
this closes the one finding with genuine data-safety consequences, and needs no content boundary yet.

---

## 7. Validation

Baseline on `origin/main` (55fa715): 1248 tests, 1245 pass, 0 fail, 3 skipped; `tsc -b --noEmit` clean;
build clean. After the probe: **1283 tests, 1280 pass, 0 fail, 3 skipped** (+35, exactly the probe);
`tsc` clean; build clean; `git diff --check` clean.

Zero tracked files differ from `origin/main`. The production bundle is byte-identical — same content
hash `index-D97uP1PW.js`, same 1,850.91 kB, same 25-entry precache — and `dist/` contains no fixture
reference. A probe test also guards the artifact's own inertness by import graph: it imports no
storage, wallet-store or export module, and uses read-only `fs` APIs.

---

## 8. Cleanup

One delete path, nothing else references it:

```
rm -rf tests/architecture/ tests/fixtures/second-route/ tests/helpers/secondRouteFixture.mjs
```

Keep it only while the `trailId` foundation is being designed — the H3/H4 tests are the cheapest
regression check that a trail-scoped identity actually fixes the silent-adoption failure. Delete it
once that foundation lands with its own tests, or immediately if the direction is dropped.
