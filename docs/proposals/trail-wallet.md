# Trail Wallet — Stage 1: architectural audit & implementation proposal

Status: **approved & implemented (v0.21.0)** — all §8 decision points were
approved as recommended and are reflected in the shipped implementation.

Implementation notes / recorded trade-offs:
- **PDF opening** uses the progressive fallback from §4.2: Fjällkompis
  ATTEMPTS to open the locally stored PDF in the platform viewer via
  `window.open(objectURL)` (fully offline — the blob never touches the
  network); when the browser refuses to open a new window, a copy is
  downloaded automatically and a notice says so. A returned window is not
  itself a guarantee that every platform renders the blob PDF — which is
  exactly why the separate **Download a copy** action in the edit sheet
  remains available as the constant, viewer-independent path to the file.
  **PDF.js was NOT added** — no in-repo audit could justify a large viewer
  dependency before real-device behaviour is observed. Actual per-platform
  behaviour (Android browser/PWA, iOS Safari, iOS standalone) requires the
  manual phone verification steps listed in the Stage 2 report.
- **Orphan handling** (a state the spanning transactions should make
  impossible): metadata without a blob row is omitted from the list
  non-destructively with a console warning; opening a document whose blob
  turns out missing shows an honest in-UI notice suggesting delete + re-add.
- The wallet tab id is `wallet`; the compact tab label is **Wallet**, with
  "Trail Wallet" used in explanatory copy, as approved.
Scope: a small, offline-first place under **Lists** for a hiker's important
documents (memberships, tickets, reservations, insurance, route PDFs).
Deliberately narrow — not a file manager, not cloud storage.

---

## 1. Architectural audit

### 1.1 Stack & app shell

- Vite 5 + React 18 + TypeScript. Five runtime dependencies only
  (`react`, `react-dom`, `lucide-react`, `maplibre-gl`, `pmtiles`) — the
  project is deliberately dependency-light.
- **Routing:** no router library. Six primary destinations are hash-routed
  through `src/navigation/routes.mjs` (`TAB_ROUTES`, guarded by
  `tests/navigation-routes.test.mjs`). Lists is one destination
  (`#/lists`, internal tab id `checklist`); its sub-sections
  (Packing / Shops / Transport) are **local component state** inside
  `src/screens/ListsScreen.tsx` (`ListsSection`), plus a one-shot in-memory
  deep-link payload (`ListsDeepLink`) from other screens.
  → Trail Wallet needs **no route-table change**: it is a fourth
  `ListsSection`, exactly the shape the screen already models.
- **PWA:** `vite-plugin-pwa` (Workbox) precaches the app shell; prompt-style
  updates via `PwaLifecycle`. Map archives live in separate, user-controlled
  Cache Storage caches (`src/map/offlineMap.ts`) — the established precedent
  for "large binary data is an explicit user choice, stored outside the
  app-shell precache".

### 1.2 Persistence

- All personal data is **one JSON blob** in `localStorage`
  (`fjallkompis:state`, `SCHEMA_VERSION = 4`), owned by the
  `AppStore` React context and re-saved on every change.
- Migration/normalisation is a **pure `.mjs` module**
  (`src/utils/stateMigration.mjs`): normalise-on-load, idempotent, never
  throws, malformed fields fall back to defaults. Tested directly under
  `node --test` with no TypeScript toolchain.
- Backup & restore (Settings) exports/imports that blob as a JSON envelope
  (`src/utils/exportImport.ts`, `tests/device-transfer.test.mjs`).
- **Binary data precedent:** the offline basemap/terrain/satellite archives
  are stored in Cache Storage as full 200 responses — never in
  `localStorage`. `formatBytes()` already exists for size display.
- There is **no IndexedDB usage anywhere yet**.

### 1.3 Design system

- One token-driven stylesheet (`src/styles/global.css`, ~4 250 lines) with
  design-review governance (`docs/VISUAL-DESIGN-AUTHORITY.md`, ADR 0001) and
  structural contract tests (`tests/design-system.test.mjs`).
- Reusable pieces Trail Wallet can adopt wholesale:
  - `.card`, `.card-title`, `.card-sub`, `.section-label`, `.pill`,
    `.tnum`, `.row`, `.row-between`
  - `.seg` / `.seg-btn` segmented control — `.seg--lists` is **already sized
    for four tabs** on the narrowest phones (a leftover from the archived
    Daily checklist era; the CSS comment still says "Four segments…")
  - `.field`, `.input`, `.select`, `.btn` (+ `btn-primary/ghost/danger/block`)
  - `.card.empty` empty state with `.glyph`
  - `ConfirmDialog` (SettingsScreen) and the native `<dialog>` `.sheet`
    (ContextHelp: bottom sheet on phones, centred dialog on larger screens)
  - Lucide icons via `lucide-react`
- Lists screen conventions: per-section intro copy under the tab control
  (`.lists-intro`, guarded by `tests/lists-intro-placement.test.mjs`),
  inline add/edit forms (Packing), tab control with `role="tab"`.

### 1.4 Settings

- Accordion sections: Route direction, Trail readiness, Install, Offline
  maps, Backup & restore, Data sources. "Reset local data" resets the
  localStorage blob only. The JSON backup carries the whole
  `PersistentState` — it could not reasonably carry document binaries.

### 1.5 Tests & CI

- `npm test` = version-consistency check + route generation + `node --test`
  over plain `.mjs` files. **No jsdom, no browser runner, no test
  framework beyond `node:test`.** Two test styles exist:
  1. **pure-module tests** (migration, itinerary, transport status…);
  2. **source-text contract tests** (regex assertions over `.tsx`/`.css`,
     e.g. `lists-intro-placement`, `design-system`).
- Node 22 (CI) has **no built-in IndexedDB**, which constrains how
  persistence tests must be written (see §6).

---

## 2. Storage recommendation

**IndexedDB, for both metadata and file blobs, in a dedicated database
(`fjallkompis-wallet`), separate from the localStorage state blob.**

Why not the alternatives:

- **localStorage** — explicitly ruled out for binaries and rightly so:
  ~5 MB string-only quota, base64 bloat (+33 %), synchronous main-thread
  writes. A single ticket photo would exhaust it.
- **Cache Storage** — the map-archive precedent, but it is keyed by
  request URL and models *fetched responses*. User-uploaded files have no
  URL; synthesising fake request keys works but is semantically wrong and
  gains nothing (same origin quota, same eviction rules as IndexedDB).
- **OPFS (Origin Private File System)** — newer, less uniform support
  (notably older iOS), no advantage at this scale.

IndexedDB stores `Blob`s natively via structured clone, is async, works in
every browser the app targets, and shares the origin's large
browser-managed quota with the map caches.

### Database layout (v1)

```
fjallkompis-wallet (IDB version 1)
├── documents   keyPath 'id'   — metadata records only (small, JSON-like)
└── files       keyPath 'id'   — { id, blob }  (same id as its document)
```

Two object stores so that **listing documents never loads blobs**, and
replace-file touches only `files`. Add / replace / delete each run in a
**single transaction spanning both stores**, so metadata and blob can never
desync (no "ghost documents").

Written as a small dependency-free module (no `idb` wrapper library —
keeping with the project's minimal-dependency stance).

### Why metadata does NOT go into `PersistentState`

Putting metadata in the localStorage blob (files in IDB) would reuse the
existing migration/export machinery, but:

- the JSON backup would then carry document metadata **without the files**
  — importing on another device would materialise ghost entries whose
  blobs don't exist, which is worse than honestly not transferring them;
- metadata and blobs would live in two storage systems with no shared
  transaction, so they *will* eventually desync.

Keeping everything in one IDB database makes the wallet self-consistent and
keeps the existing localStorage schema (v4), migration path, and
export/import **completely untouched** — no `SCHEMA_VERSION` bump.

### Durability

- On first successful save, call `navigator.storage.persist()`
  (best-effort; auto-granted for installed PWAs on Chromium, heuristic
  elsewhere, safely ignored where unsupported).
- Probe IDB availability on first use (mirroring `storageAvailable()`):
  private-mode or blocked storage degrades to a friendly notice, never a
  crash.

---

## 3. Proposed data model

Types join `src/types/index.ts` (the single domain-types home):

```ts
export type WalletCategory =
  | 'membership'        // Memberships
  | 'transport'         // Transport (bus/train/flight tickets)
  | 'booking'           // Bookings (hut reservations, accommodation)
  | 'insurance-emergency' // Insurance & emergency
  | 'route-reference'   // Route references (PDFs, timetables)
  | 'other';

export type WalletMimeType =
  | 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export interface WalletDocument {
  id: string;                 // stable, generated once (same id keys the blob)
  title: string;
  category: WalletCategory;
  /** Optional ISO date (yyyy-mm-dd) — departure, validity, check-in. Drives sorting. */
  date?: string;
  note?: string;
  pinned: boolean;
  createdAt: number;          // ms epoch
  updatedAt: number;          // ms epoch — also the future sync merge key
  fileName: string;           // original filename, kept for re-export
  mimeType: WalletMimeType;
  sizeBytes: number;
}
```

A separate `meta` record in the `documents` store (or a dedicated store)
carries `{ id: '__meta__', schemaVersion: 1 }` — the same
normalise-on-load discipline as `stateMigration.mjs`, independent of IDB's
structural `versionchange`.

### Future extensibility (designed for, NOT implemented)

- **Stop / stage / travel-day association:** a future optional field
  (e.g. `links?: { stopId?, segmentId?, dayIso? }`) is purely additive —
  IDB stores plain objects, so old records simply lack the field and the
  read-time normaliser fills defaults. **No breaking storage migration is
  ever needed for additive fields.** Stage references would use the stable
  physical segment ids (`d1..d7`), never display day numbers — the same
  direction-safe rule the experiences layer established.
- **Cloud sync:** all access goes through one small `walletStore` module
  (list / get / put / remove + putFile / getFile). A future sync layer can
  wrap that interface; `updatedAt` already supports last-write-wins.
  Nothing in the MVP references a backend, account, or network.

### Sorting (pure function, `todayIso` injected like `timetableStatus()`)

1. Pinned documents (each group internally date-ordered as below)
2. Upcoming: `date ≥ today`, ascending (soonest first)
3. Undated documents, newest `updatedAt` first
4. Expired: `date < today`, descending (most recently expired first)

---

## 4. UX proposal

### 4.1 Placement & tab order — recommendation

Fourth tab in Lists: **Packing · Shops · Transport · Wallet** (appended
last). Reasoning:

- Packing dominates the pre-trip phase, when most users first learn the
  app; Shops and Transport are consulted repeatedly on-trail. Wallet
  moments (bus boarding, hut check-in) are discrete and predictable —
  important, but not high-frequency browsing.
- Appending preserves existing muscle memory and keeps all current
  deep-link behaviour untouched; Shops/Transport/Wallet also group
  naturally as the "reference" tabs after the interactive Packing list.
- Tab **label**: propose the single word **"Wallet"** (full name "Trail
  Wallet" in the intro copy and empty state). Four tabs already run at
  12–13 px on ≤360 px phones; a two-word tab label would wrap or truncate.
  *(Flagged for your approval since the brief writes "Trail Wallet".)*

### 4.2 Document list

- Intro copy (the `.lists-intro` slot, same as every other section) carries
  the offline message: *"Your travel documents, stored locally on this
  device and available offline. Clearing the browser's or app's data also
  removes them."*
- Each document is a compact `.card` row: file-type Lucide icon
  (`FileText` / `Image`), **title**, sub-line with category · optional
  date · file size (`formatBytes`), a small `Pin` glyph when pinned.
- **Whole card opens the document** (the card's main region is one large
  `<button>`); a separate small Pencil button (the Packing `pack-edit`
  pattern) opens the editor — this keeps nested-interactive markup valid
  and both targets ≥44 px.
- Open behaviour: images open in an in-app viewer (the existing `.sheet`
  native `<dialog>`); PDFs open via an object URL in a new tab/viewer
  (works fully offline — the blob is local). Export/download uses the
  existing `downloadTextFile`-style anchor mechanism with the original
  filename.
- **Storage indicator** (subtle, under the list): `8 documents · 14.2 MB
  stored locally` — muted `.card-sub`-style line, no card of its own.
- Sorted per §3; no search, no grouping headers — the collection is meant
  to stay small.

### 4.3 Empty state

Existing `.card.empty` with a `Wallet` glyph: *"Keep your important hiking
documents in one place — tickets, reservations, membership cards and route
PDFs, stored on this device and available offline."* + prominent
**Add document** `btn-primary`.

### 4.4 Add / edit dialog

One sheet (reusing the `.sheet` `<dialog>` pattern — bottom sheet on
phones, centred on larger screens), two modes:

- **Add:** file picker (`accept="application/pdf,image/jpeg,image/png,image/webp"`),
  Title (pre-filled from the filename stem), Category select, optional
  Date, optional Note → **Save**. Type validation on selection with a
  clear rejection message; soft size cap (~20 MB/file) with a friendly
  error.
- **Edit:** same fields plus **Pin**, **Replace file** (keeps id and
  metadata, swaps blob + fileName/mimeType/size), **Export**, **Delete**
  (via the existing `ConfirmDialog`).

No preview step, no multi-file upload, no drag-and-drop requirements —
smallest honest flow.

---

## 5. Files that will change

**New**

| File | Purpose |
|---|---|
| `src/wallet/walletModel.mjs` (+ `.d.mts`) | Pure logic: categories, accepted types, validation, sorting, normalisation, title-from-filename — plain `.mjs` so `node --test` runs it (the `stateMigration.mjs` pattern) |
| `src/wallet/walletStore.ts` | IndexedDB adapter: open/upgrade, transactional CRUD over `documents` + `files`, storage-persist request, availability probe |
| `src/hooks/useWalletDocuments.ts` | React state over the store (load on mount, CRUD, error/quota surfacing) |
| `src/components/WalletView.tsx` | List, cards, storage indicator, empty state, image viewer |
| `src/components/WalletEditorSheet.tsx` | Add/edit dialog |
| `tests/wallet-model.test.mjs` | Sorting, validation/rejection, normalisation |
| `tests/wallet-store.test.mjs` | Persistence round-trips (see §6) |
| `tests/wallet-view.test.mjs` | Source-text contracts: fourth tab, offline wording, accept-attribute allowlist |

**Modified**

- `src/screens/ListsScreen.tsx` — fourth `ListsSection`, tab entry,
  `LISTS_HEADER` intro copy, render `WalletView`
- `src/types/index.ts` — wallet domain types
- `src/styles/global.css` — small `.wallet-*` additions from existing tokens
- `src/screens/SettingsScreen.tsx` — two copy-only touches (flagged below):
  Backup & restore notes documents are not in the JSON export; Reset local
  data also clears the wallet DB
- `package.json` / `CHANGELOG.md` — version bump + changelog section
  (required by the version-consistency gate), `fake-indexeddb`
  devDependency if approved (§6)

**Explicitly untouched:** `navigation/routes.mjs` (no new primary tab),
`stateMigration.mjs` / `SCHEMA_VERSION` (wallet is outside the blob),
`exportImport.ts`, AppStore, service-worker config.

---

## 6. Testing approach

CI runs plain `node --test` on Node 22 — no browser, no built-in
IndexedDB. Proposal:

1. **Pure model tests** (no environment needed): ordering incl. every
   pinned/upcoming/undated/expired permutation; unsupported-type and
   oversize rejection; normalisation of malformed records; rename/replace
   metadata rules.
2. **Persistence tests with `fake-indexeddb`** (devDependency, ~zero
   footprint, the standard way to exercise real IDB semantics in Node):
   add → reload → list round-trip (offline loading is this same path — IDB
   is local by construction), rename, replace (same id, new blob/size),
   delete (both stores emptied), upgrade-from-empty, meta/schema record,
   quota-error surfacing. *(Needs your OK since it adds a devDependency;
   the fallback — an injected in-memory adapter — tests our code but not
   real IDB transaction semantics.)*
3. **Source-text contract tests** in the established style: the Lists tab
   row, the offline wording ("Stored locally on this device"), the
   `accept` allowlist, and no `fetch(` in wallet modules (offline-first by
   construction).

---

## 7. Risks & browser limitations

Honest limitations that cannot reasonably be engineered away:

- **Browsers may evict site data under storage pressure.** Mitigated by
  `navigator.storage.persist()` and — most effectively — by installing the
  PWA; never fully preventable. The UI copy says so plainly.
- **Safari (browser-tab usage):** ITP can delete script-writable storage
  after ~7 days of non-use of the *website*; the installed home-screen app
  is exempt. Deleting the installed app deletes its data.
- **Clearing browser/app data deletes documents** — stated in the intro
  copy and empty state; we never imply cloud storage.
- **The JSON backup cannot carry documents** (binary payloads don't belong
  in a JSON text export; a ZIP backup is explicitly out of scope). The
  Backup section says so; cross-device transfer of documents is a roadmap
  item, not silently broken.
- **iPhone HEIC photos:** files picked from the iOS photo picker are
  transparently converted to JPEG, but a HEIC picked from the Files app is
  rejected (unsupported type) with a clear message naming the supported
  formats.
- **PDF opening on iOS standalone PWAs** is the least predictable flow:
  the app attempts the platform/browser viewer via a new window and falls
  back to downloading a copy when the window is refused; how iOS presents
  the opened blob (and its "back to app" affordance) is iOS's behaviour,
  not ours, and must be confirmed on a real device. There is no in-app PDF
  viewer — the in-app viewer sheet exists for images only.
- **Private browsing:** IndexedDB may be unavailable or ephemeral — probed
  up front, degrades to a notice instead of a broken screen.
- **Quota exhaustion** on save is caught and surfaced (the origin quota is
  shared with the ~100 MB of optional map archives, but modern quotas are
  ≥ 1 GB — not a practical ceiling for "a small number of documents").

---

## 8. Decision points for approval

1. Tab order **last** (Packing · Shops · Transport · Wallet) — recommended.
2. Tab label **"Wallet"** (full "Trail Wallet" in copy) — recommended.
3. Storage: dedicated IndexedDB database, metadata + blobs together,
   outside `PersistentState` — recommended.
4. Add `fake-indexeddb` as a devDependency for genuine persistence tests —
   recommended.
5. "Reset local data" also clears the wallet (with updated confirm copy) —
   recommended; the alternative (reset ignores the wallet) makes "reset
   all local data" untrue.
6. Soft per-file size cap ~20 MB — recommended.
