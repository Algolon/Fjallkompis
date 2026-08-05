# Vector archive revision — safe offline-cache migration

Prerequisite for Map Refinement II PR 2. No camera code, no route data, no
archive rebuild: the committed archive is byte-identical to the one PR #104
shipped (5,904,598 bytes, sha256 `17d98946…`).

## The defect

PR #104 replaced the vector archive in place, keeping the public path
`maps/kungsleden.pmtiles` — deliberately. But the cache identity did not move
with it, and nothing compared the cached bytes to what the server now serves:

| | before this change |
| --- | --- |
| cache name | `fjallkompis-offline-map-v1` (unchanged since 0.x) |
| archive URL | `maps/kungsleden.pmtiles` (unchanged, by design) |
| `getArchiveStatus()` | `cache.match(url)` → **any** hit means "downloaded" |
| `getArchiveBlob()` | returns that hit, whatever it contains |

So a device that downloaded the archive before PR #104 kept a 5,603,107-byte
file that satisfied every check the app made. Settings reported "✓ Stored on
this device"; the map read the superseded blob; nothing ever asked for the
5,904,598-byte replacement. Indefinitely.

Two smaller findings, both measured here rather than reasoned about:

- **`caches.open()` creates a missing cache.** A status probe against a new
  cache name would have conjured an empty `…-map-v2` on every device that
  merely opened Settings — an inventory entry that reads like a stored
  archive. The probe now asks `has()` first.
- **`cache: 'no-store'` does not get past a service worker.** The Workbox
  `CacheFirst` route matches the bare archive path, so a download request was
  answered from Cache Storage without reaching the server. Measured: with a
  1,234-byte body planted in the vector cache, `fetch(url, {cache:'no-store'})`
  returned 1,234 bytes. An Update that cannot reach the server can never
  replace a bad copy, so the download now fetches `…pmtiles?rev=<revision id>`,
  which the route does not match. **The Cache Storage key stays the bare URL** —
  parameterising it would silently break offline range serving.

## The model

`src/map/archiveRevision.mjs` — pure, dependency-injected, imported by both the
app and `vite.config.ts`:

```
VECTOR_ARCHIVE_CACHE          'fjallkompis-offline-map-v2'   ← current
VECTOR_ARCHIVE_LEGACY_CACHES  ['fjallkompis-offline-map-v1'] ← fallback-only
VECTOR_ARCHIVE_REVISION       { id: 'kungsleden-vector-2026-08-overview-corridor',
                                bytes: 5_904_598, sha256: '17d98946…' }
```

A cached response is **current** only if it is in the current cache *and* its
byte length equals `bytes`. Anything else that exists is **legacy**: usable
offline, explicitly not current, replaced only by a successful download.
`sha256` is recorded provenance, checked against the committed file in tests,
never computed at runtime.

Terrain, contours and satellite declare no revision and no legacy caches, so
their status stays existence-only and their cache identities are untouched.

## Runtime evidence

Real Chrome, one **disposable profile per scenario**, headless, against
`vite preview` on this branch's production build. Reproduce with
`capture-runtime-evidence.mjs`; full output in `runtime-evidence.json`.

### A. Simulated pre-PR #104 install

Seeded: the 5,603,107-byte archive in `fjallkompis-offline-map-v1`, plus
sentinel entries in the terrain, contour and satellite caches.

| check | result |
| --- | --- |
| app recognises legacy state | ✅ `Map update available` |
| Settings offers Update | ✅ `Update map data` (primary), `Remove from device` kept |
| sizes shown | `Stored now 5.3 MB` · `Update size 5.6 MB` |
| map renders from the legacy archive | ✅ full route + all eight stops |
| basemap source | `blob:` — **zero** requests for `maps/kungsleden.pmtiles` |
| anything deleted by opening the app | ❌ none — inventory byte-identical |
| empty current-revision cache conjured | ❌ none |
| console errors | 0 |

`A-legacy-settings-1512x860.png`, `A-legacy-map-1512x860.png`

### B. Successful update

| check | result |
| --- | --- |
| server fetch bypasses stale caches | ✅ `200 maps/kungsleden.pmtiles?rev=kungsleden-vector-2026-08-overview-corridor` |
| bytes stored in the current cache | **5,904,598** — exactly |
| legacy vector cache after success | removed |
| terrain / contour / satellite caches | all three intact |
| second permanent archive left behind | none |
| map after update | renders, `✓ Stored on this device`, `5.6 MB` |
| console errors | 0 |

`B-before-update-1512x860.png`, `B-after-update-1512x860.png`,
`B-after-update-map-1512x860.png`

### C. Failed update

Two failure modes, same guarantee.

| | C1 network failure | C2 server returns the wrong archive |
| --- | --- | --- |
| old archive | preserved, 5,603,107 bytes | preserved, 5,603,107 bytes |
| current cache written | never created | never created |
| state reported | `Map update available` | `Map update available` |
| map still usable offline | ✅ | ✅ |
| message | "Failed to fetch — check your connection and try again." | "Map download did not match the expected archive (got 5603107 bytes, expected 5904598). Nothing was replaced — your existing offline map is untouched." |

C2 is the regression that matters most: the rejected bytes are the *old
archive*, served at the current URL. It is refused before anything is written.

`C1-network-failure-1512x860.png`, `C1-map-still-usable-1512x860.png`,
`C2-wrong-archive-rejected-1512x860.png`

### D. Fresh install

Desktop 1512×860 and phone 390×844. Both download straight into
`fjallkompis-offline-map-v2` at 5,904,598 bytes; no legacy cache is created.

`D-fresh-desktop-{before,after}-1512x860.png`,
`D-fresh-phone-{before,after}-390x844.png`

## Cache Storage inventory, before → after

Legacy device, at the three points that matter (from `runtime-evidence.json`):

```
seeded / after opening the app          after a successful update
──────────────────────────────          ─────────────────────────
fjallkompis-offline-map-v1  5 603 107   fjallkompis-offline-map-v2  5 904 598
fjallkompis-offline-terrain-v1     11   fjallkompis-offline-terrain-v1     11
fjallkompis-offline-contours-v1    22   fjallkompis-offline-contours-v1    22
fjallkompis-offline-satellite-v1   33   fjallkompis-offline-satellite-v1   33
workbox-precache-v2-…                   workbox-precache-v2-…
```

Exactly one cache was deleted: `fjallkompis-offline-map-v1`.

## Service worker, bytes, checks

See `service-worker-and-bytes.md`. In short: `dist/sw.js` names
`fjallkompis-offline-map-v2` and contains **zero** occurrences of the
superseded name; the terrain and contour routes are unchanged; the committed
and built archives are both 5,904,598 bytes with the declared sha256.

```
tests      1422 total · 1419 pass · 0 fail · 3 skipped (pre-existing)
           baseline on main f9e1d6b: 1384 total · 1381 pass · 0 fail · 3 skipped
typecheck  clean
build      clean · PWA generateSW · precache 16 entries
```
