# Trip plan — architecture & decision record (v0.23.0)

Status: **implemented** — evolves the document-first Trail Wallet
(docs/proposals/trail-wallet.md, v0.21.0) into a trip-item-first personal
Trip plan under Lists → **Trip**.

## The model shift

The Trail Wallet was document-first: a file was the primary object, with a
category/date/note attached. The Trip plan inverts this: a personal
**transport movement** or **stay** is the primary object, with structured
fields (status, dates, times, endpoints, booking reference) and OPTIONAL
attached documents. A ticket is supporting material — users plan travel and
stays before any document exists.

Three item families:

- **Travel** — flight / train / bus / boat / taxi-shuttle / other;
- **Stays** — hotel-hostel / mountain-station / mountain-hut / other;
- **Documents** — standalone files not tied to one item
  (membership, insurance & emergency, identity, route reference, timetable,
  other).

Statuses (exactly three in this first version, deliberately distinct from
Packing's needed/ready/packed): **needed** (required but not arranged),
**planned** (selected/scheduled, not confirmed), **confirmed** (settled — a
document is NOT required, and status is never inferred from attachment
presence in either direction).

## Storage decision (the audited hybrid)

| Data | Store | Rides JSON backup? |
|---|---|---|
| Travel/Stay items (structured JSON) | `PersistentState` (localStorage blob, schema **v6**, `trip` array) | **Yes** |
| Document metadata | IndexedDB `fjallkompis-wallet` → `documents` (unchanged, IDB v1) | No |
| Document blobs | IndexedDB `fjallkompis-wallet` → `files` (unchanged) | No |

Why:

- Trip items are small JSON and are valuable without files — putting them in
  `PersistentState` gives them the existing pure/idempotent normalisation
  (`src/utils/stateMigration.mjs` → `src/trip/tripModel.mjs`), the existing
  JSON backup/restore and device transfer, and reactive store updates for
  free, with no new storage system.
- The wallet database is untouched (same schema, same spanning-transaction
  guarantees); the v0.21.0 audit's reasons for keeping blobs out of
  localStorage all still hold.
- The join is by id only: `attachmentIds: string[]` on an item references
  document ids — never blobs, and no booking status or personal dates are
  duplicated into document metadata.

### Cross-store integrity rules

Two stores cannot share a transaction, so the seams are handled explicitly:

- a **missing document** (evicted, or a backup restored on another device)
  renders as "not available on this device" on the item card and in the item
  sheet, with a Remove-link action — never a crash, never a fake file;
- **deleting a document** (Documents → edit → Delete) also strips its id
  from every item via `removeTripAttachmentReferences` — no clickable link
  ever points at a deleted blob;
- **deleting a trip item always keeps its documents** (the safe first-version
  rule, stated in the confirmation copy); they reappear under Documents;
- normalisation deduplicates `attachmentIds` and tolerates stale ids
  indefinitely (they simply render as missing until removed).

### Backup / device transfer behaviour

The JSON export now carries the full trip plan (items, statuses, links,
attachment REFERENCES). File blobs still never ride the JSON backup. After a
restore on a new device the items are intact and each unresolvable reference
is flagged honestly; the user can remove the stale link or re-attach the
file there. Settings → Backup & restore copy states exactly this.

## Migration

- Persisted schema v5 → v6 (v5 is the personal packing list, 0.22.0):
  additive `trip` field; payloads without it get
  `[]`. Nothing is fabricated from existing documents (no filename
  heuristics, no OCR, no auto-conversion of transport/booking documents into
  items). Idempotent, covered by fixtures.
- Wallet records: ids, blobs, titles, notes, dates, pinned state and
  categories are preserved verbatim. The category vocabulary for NEW
  documents became membership / insurance-emergency / identity /
  route-reference / timetable / other; the historical `transport` and
  `booking` ids remain valid on existing records (displayed with their
  historical titles, offered in the editor only on records that carry them).

## Reference-data links

- `linkedTransportId` — stable Transport entry id (`line-91`, …), on
  transport items only. Set by **Add to Trip** on a reference card, which
  prefills only verified source facts (mode, endpoints parsed from the
  entry's own direction string, operator, title) with status `planned`;
  timetable dates/times are NEVER copied into the personal record. An
  already-linked entry shows **View in Trip** plus an explicit "Add to Trip
  again" (same bus on other dates is legitimate — only accidental
  duplicates are guarded). Immutable through ordinary field patching (like
  `id`, `kind`, `createdAt`); no UI rewrites it.
- `linkedPlaceId` — stable Journey Place id, on stay items only, and —
  unlike transport provenance — user-EDITABLE (v0.27.0; see "Places &
  Stay ↔ Place linking" below). Succeeds the v0.23.0 `linkedStopId`:
  route Place ids preserve the stable physical stop ids
  (`abisko` … `nikkaluokta`), so old values migrate verbatim at read time
  and reversing the route still cannot corrupt a link.

## Places & Stay ↔ Place linking (v0.27.0)

`src/data/journeyPlaces.mjs` adds the read-only **Journey Place** reference
layer every stay link resolves through:

- **route-stop places** are ADAPTERS over the canonical `STOPS` registry —
  the place id IS the stop id, and every curated fact (name, facilities,
  coordinates, source) stays in `src/data/stops.ts`, never duplicated. The
  module is deliberately free of route-data imports; callers inject the
  registry (the stateMigration/topology pattern). Route ordering is always
  the ACTIVE itinerary's — reversal reorders the adapters, ids stay stable.
- **curated-off-route places** live in the module's own registry and are
  reference data for the nights around the hike. First (and in v0.27.0
  only) record: `stf-kiruna` — STF Kiruna Hotel & Hostel, verified against
  the official STF page on 2026-07-31 (address, GPS, 76–100 beds,
  check-in from 15:00 / check-out until 11:00, guest kitchen, sauna,
  Wi-Fi, restaurant, public transport within 1 km). No prices, room
  availability or seasonal hours — nothing that goes stale between manual
  verifications, and no unverified image. Off-route records NEVER enter
  `STOPS`, itinerary ordering, route kilometres, stage endpoints or GPX
  geometry; the Stops & places screen renders them in a separate
  **Before & after trail** section without any route language.

Ownership boundary (unchanged in spirit from the trip-item-first rule): a
Place supplies identity, verified facts and safe defaults for a NEW stay
(official name, stay type, `Kiruna` as the off-route location). A Stay owns
title, type, free-text location, dates, status, booking reference, notes,
attachments and the association itself. Editing the link — set, move,
remove, through the Stay editor's **Linked place** control — changes ONLY
`linkedPlaceId`, in the same Save/Cancel draft transaction as every other
field; in add mode a chosen place may fill fields that are still untouched,
never one the user edited. Unlinking keeps all personal text and dates.

Link hygiene at the normalisation layer (`normalizeTripItem`):

- v9 `linkedStopId` (and old v10 records still carrying it) migrates into
  `linkedPlaceId` verbatim; only one field ever survives in output;
- an UNKNOWN but syntactically valid id is preserved — never validated
  against the registry — so removing or renaming curated data cannot
  silently destroy the association; the UI shows "Linked place is no
  longer available in this version" and offers relinking or unlinking;
- wrong-kind fields are stripped (transport never carries a place link,
  stays never carry transport provenance); empty ids are removed.

Several stays may legitimately link one place (arrival + departure nights,
two bookings). The place card's action is honest about plurality: zero →
**Track stay**, one → **View stay in Trip**, several → **"N stays in
Trip"** opening a focused chooser (title, status, dates, type/location,
plus one explicit **Add another stay**) — never an arbitrary first match.
Navigation is bidirectional: a resolved link's **View place** rides the
one-shot `placeId` payload to Stops & places and scrolls to the card.

Day-plan overnights keep referencing Trip item ids: changing, adding or
removing a place link never moves a stay between days, never changes
Tonight, and never touches `dayPlan` at all.

**Deferred beyond v0.27.0** (a future product decision, deliberately not in
the v0.27.0 release scope): user-created custom Places, automatic Place
creation from free-text locations, Places for arbitrary hotels/campsites,
and a dedicated wildcamp model with coordinates/overnight rules. Until
then a wildcamp, campsite or private accommodation stays a plain
`Stay type: Other stay` — unlinked, free-text location, fully valid as a
Day-plan overnight and for documents.

## For the future Today "Prepare" view (not built here)

`src/trip/tripModel.mjs` exposes pure, tested selectors:
`tripPlanSummary(items)` → `{ total, travelCount, stayCount, needed,
planned, confirmed }` (standalone documents excluded, no percentages, no
"next action"), plus `sortTravelItems` / `sortStayItems` with injected
`todayIso`. Deep links into the section exist
(`ListsDeepLink.section: 'trip'`, `tripItemId`, `trackStayPlaceId`) via the
established one-shot in-memory payload — no router, `#/lists` unchanged.

## Known limitations (deliberate first-version scope)

- Deleting a LINKED document requires unlinking first (it then appears under
  Documents where the existing delete flow lives) — the safe subset of the
  branching delete dialog.
- Attachments added inside the item sheet default to category `other`; the
  document editor can recategorise later.
- Trip-item deletion confirms through the shared accessible `ConfirmDialog`
  (the 0.22.0 component), rendered inside the item sheet's modal top layer;
  document deletion inside the document editor still uses the pre-existing
  Trail Wallet `window.confirm` flow (untouched by this iteration).
- No Completed/Cancelled statuses, no readiness percentages, no automatic
  status inference, no Today Prepare UI yet.
