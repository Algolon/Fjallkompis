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
| Travel/Stay items (structured JSON) | `PersistentState` (localStorage blob, schema **v5**, `trip` array) | **Yes** |
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

- Persisted schema v4 → v5: additive `trip` field; payloads without it get
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

- `linkedTransportId` — stable Transport entry id (`line-91`, …). Set by
  **Add to Trip** on a reference card, which prefills only verified source
  facts (mode, endpoints parsed from the entry's own direction string,
  operator, title) with status `planned`; timetable dates/times are NEVER
  copied into the personal record. An already-linked entry shows
  **View in Trip** plus an explicit "Add to Trip again" (same bus on other
  dates is legitimate — only accidental duplicates are guarded).
- `linkedStopId` — stable physical stop id (`abisko` … `nikkaluokta`). Set
  by **Track stay** on a stop card (prefills name + stay type, status
  `planned`). Physical ids are direction-safe; reversing the route cannot
  corrupt the link. A linked source that later disappears degrades to a
  plain note in the item sheet.
- Links are immutable through ordinary field patching (like `id`, `kind`,
  `createdAt`); no UI rewrites them.

## For the future Today "Prepare" view (not built here)

`src/trip/tripModel.mjs` exposes pure, tested selectors:
`tripPlanSummary(items)` → `{ total, travelCount, stayCount, needed,
planned, confirmed }` (standalone documents excluded, no percentages, no
"next action"), plus `sortTravelItems` / `sortStayItems` with injected
`todayIso`. Deep links into the section exist
(`ListsDeepLink.section: 'trip'`, `tripItemId`, `trackStayStopId`) via the
established one-shot in-memory payload — no router, `#/lists` unchanged.

## Known limitations (deliberate first-version scope)

- Deleting a LINKED document requires unlinking first (it then appears under
  Documents where the existing delete flow lives) — the safe subset of the
  branching delete dialog.
- Attachments added inside the item sheet default to category `other`; the
  document editor can recategorise later.
- Delete confirmations use `window.confirm` (the established Packing/Wallet
  pattern).
- No Completed/Cancelled statuses, no readiness percentages, no automatic
  status inference, no Today Prepare UI yet.
