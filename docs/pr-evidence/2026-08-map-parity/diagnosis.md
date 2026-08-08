# Map parity — current architecture, and why Android stops at the vector basemap

Base SHA: `989dbd873af0a9bdb8717d981cb67b6c687393c6` (PR #127 merge, v0.27.0).

Written **before** any implementation, as the milestone requires. Everything
below was read out of the tree at that SHA or measured against the live
release assets; nothing here is inferred from the roadmap.

---

## 1. The four archives, end to end

| | vector | terrain | contours | satellite |
| --- | --- | --- | --- | --- |
| File | `maps/kungsleden.pmtiles` | `maps/kungsleden-terrain.pmtiles` | `maps/kungsleden-contours.pmtiles` | `maps/kungsleden-satellite.pmtiles` |
| Bytes | 5 904 598 | 19 297 735 | 9 271 029 | 61 704 169 |
| SHA-256 | `17d98946…` | `89eef717…` | `3e8fbcfa…` | `b9471452…` |
| In git | **yes** (`public/maps/`) | no (gitignored) | no (gitignored) | no (gitignored) |
| Canonical origin | the committed file | `terrain-data-v3` Release | `terrain-data-v3` Release | `satellite-data-v3` Release |
| Reaches Pages via | the ordinary Vite build | `deploy.yml` injection | `deploy.yml` injection | `deploy.yml` injection |
| Revision contract | **yes** (`VECTOR_ARCHIVE_REVISION`) | none | none | none |
| Cache Storage cache | `fjallkompis-offline-map-v2` (+ `…-v1` legacy) | `fjallkompis-offline-terrain-v1` | `fjallkompis-offline-contours-v1` | `fjallkompis-offline-satellite-v1` |
| In the AAB | **yes** | no | no | no |

All four SHA-256 values were re-verified against the live Release assets
while writing this document; they agree with the pins in `deploy.yml`.
Superseded sizes recorded from the older Release tags, for the revision work
in §5: contours 4 618 344 (v1) and 6 192 959 (v2); satellite 43 610 353 (v1)
and 11 294 208 (v2); terrain v2 is byte-identical to v3.

### Where each identity is written down today

The same facts are repeated in five places, which is the core defect:

- **`src/map/offlineMap.ts`** — `VECTOR_ARCHIVE`, `TERRAIN_ARCHIVE`,
  `CONTOURS_ARCHIVE`, `SATELLITE_ARCHIVE` (`ArchiveSpec`: cache name, path,
  optional revision, optional `resolveUrl`, `bundledInApp`).
- **`src/map/archiveRevision.mjs`** — the vector cache name, its legacy
  cache list and `VECTOR_ARCHIVE_REVISION` (`id`, `bytes`, `sha256`).
- **`vite.config.ts`** — imports `VECTOR_ARCHIVE_CACHE` (good) but then
  *hardcodes* `'fjallkompis-offline-terrain-v1'` and
  `'fjallkompis-offline-contours-v1'` as Workbox `cacheName`s, plus three
  literal `/maps/…pmtiles` URL suffixes.
- **`.github/workflows/deploy.yml`** — release tags `terrain-data-v3` /
  `satellite-data-v3`, three literal SHA-256 pins, one literal size pin, and
  the filenames again, in four separate steps.
- **`tests/*.test.mjs`** — filenames, sizes and cache names re-stated as
  string literals.

Nothing links these. A new terrain build means editing a workflow, a config
and a spec by hand, and the failure mode of getting it half-right is a device
that silently serves the wrong bytes.

### Runtime read paths

`src/map/pmtilesProtocol.ts` registers the `pmtiles://` protocol once, then
`resolveArchiveBasemap(spec)` resolves in a fixed order:

1. `getArchiveBlob(spec)` — Cache Storage blob, wrapped in `BlobSource`
   (a `pmtiles.Source` over `Blob.slice`);
2. `spec.bundledInApp && isNativeAndroid()` — one full-body GET of the
   packaged file, classified by `classifyBundledArchive`, wrapped in the same
   `BlobSource`;
3. `probeHostedArchive` — a `bytes=0-0` GET; on success the hosted URL is
   handed to PMTiles' own ranged `FetchSource`;
4. otherwise `'none'` — placeholder background, route overlays only.

`resolveSatellite()` is the same shape minus the bundled branch. `MapView.tsx`
calls all four resolutions in one `Promise.all`, feeds the resulting source
URLs to `buildMapStyle`, and drives `terrainAvailableRef` /
`satelliteAvailableRef` — which in turn decide the camera's coverage envelope
and whether the Satellite toggle does anything.

### Download/status/remove paths (PWA)

`src/map/offlineMap.ts` is the browser adapter over the pure contract in
`src/map/archiveRevision.mjs`:

- `getArchiveStatus` → `probeArchiveCaches` → `classifyArchiveProbe`, giving
  `absent | current | legacy | invalid`;
- `downloadArchive` streams the response, assembles **one Blob in memory**,
  runs `storeArchiveRevision` (verify size → `cache.put` → prune legacy);
- `removeArchive` → `removeArchiveRevision` deletes caches by name.

`OfflineMapCard.tsx` renders one `ArchiveCard` per download group and folds
multi-file groups with `combineStatuses`; the Terrain relief card is the only
group with two archives, because hillshade without contours is not a product.
`useTrailReadiness` reads the same statuses.

---

## 2. Why Android cannot use terrain, contours or satellite today

Three independent reasons, all of them real. Any one of them alone would be
enough.

**(a) The bytes are not on the device and nothing fetches them.** The
optional archives never enter the Vite build — `deploy.yml` downloads them
from pinned Releases into `public/maps` *on the Pages runner only*. The
Capacitor build syncs `dist`, so `assets/public/maps/` contains exactly one
file. `docs/ANDROID.md` records this as deliberate.

**(b) The URLs the app derives cannot resolve in the native shell.**
`archiveUrl()` is `new URL(BASE_URL + path, location.origin)`. Under the
native base (`/`) that is `https://localhost/maps/kungsleden-terrain.pmtiles`
— Capacitor's in-app asset server, which has no such file. The optional
archives have no notion of an off-origin canonical URL; `SATELLITE_ARCHIVE`'s
`resolveUrl` only honours a build-time `VITE_SATELLITE_URL`, which the native
build does not set. So on Android the probe fails, `resolveSatellite()`
returns `'none'`, `onSatelliteAvailable(false)` fires, and the toggle is
disabled. The degradation is honest — it is just permanent.

**(c) Even with the bytes present, the read path would be wrong.** This is
the part that matters architecturally, and it is already proven in this repo.
Capacitor's `WebViewLocalServer.handleLocalRequest` (verified again at this
SHA, `node_modules/@capacitor/android/…/WebViewLocalServer.java:343-370`)
builds a `206` + `Content-Range` around a stream it **never seeks and never
truncates**:

```java
int totalRange = responseStream.available();
…
tempResponseHeaders.put("Content-Range", "bytes " + fromRange + "-" + range + "/" + totalRange);
return new WebResourceResponse(mimeType, …, statusCode, …, responseStream);
```

That is the exact defect that shipped a blank basemap in versionCode 2700001
(`Range: bytes=0-0` → body 5 904 598 bytes). It was closed for the bundled
vector archive by reading the whole file once as a Blob. Crucially, the same
handler serves `convertFileSrc()` URLs (`/_capacitor_file_/…`, dispatched
through `isLocalFile` in the same method), so **the obvious "download to disk
and point PMTiles at a file URL" design walks straight back into the
regression this project already paid for.**

A fourth, quieter reason argues against the other obvious design — just using
Cache Storage on Android, since the WebView is Chromium and the code already
exists. Cache Storage is best-effort, quota-managed storage. In a WebView
`navigator.storage.persist()` is not a promise of anything, and ~90 MB of map
data is precisely the kind of payload an eviction sweep reclaims. Losing the
satellite archive is an inconvenience in a browser; on day four of a hut-to-hut
trail it is the failure the whole product exists to prevent. Android needs
real files in app-private storage.

---

## 3. Two smaller asymmetries found while tracing

- **`useTrailReadiness` scores `basemap.downloaded`,** which reads Cache
  Storage only. On Android the vector map works offline from first launch and
  Settings still says "Not downloaded", 3 / 4 ready. That is the same
  platform-identity bug as the satellite toggle, so the availability layer is
  where it gets fixed — not by special-casing the readiness card.
- **A native build made on a machine that has run `deploy.yml`'s fetch
  locally would silently bundle ~90 MB of optional archives into the AAB.**
  `public/maps/*.pmtiles` is copied wholesale by Vite, and nothing checks. No
  test, no CI step, and `verify-native-build.mjs` does not look. This is
  currently latent only because the files are gitignored.

---

## 4. The smallest seam that should own parity

Two seams, one per axis of the asymmetry. Everything above them stays shared.

**Seam 1 — a canonical catalog (`src/map/mapCatalog.mjs`).** One frozen
declaration per asset: logical id, filename, revision (`id`/`bytes`/`sha256`),
previously shipped byte lengths, cache identity, release tag, bundled-vs-
optional, and the download grouping that makes terrain+contours one product
choice. `offlineMap.ts`, `vite.config.ts`, the deploy scripts, the Android
adapter and the tests all *derive* from it. This is the fix for §1's
five-way duplication, and it is what makes "both platforms resolve the same
revision" a checkable statement rather than a hope.

**Seam 2 — a platform archive store (`src/map/archiveStore.ts`).** One
interface — `status`, `open`, `download`, `remove` — with two
implementations: the existing Cache Storage adapter (web/PWA, unchanged
semantics) and a native adapter backed by a new one-purpose Capacitor plugin.
`OfflineMapCard`, `useTrailReadiness`, `pmtilesProtocol` and `MapView` talk
only to the store, so no screen gains an `isNativeAndroid()` branch and
MapView is not forked.

The native adapter's shape is dictated by §2(c) and (d):

- **storage**: `filesDir/map-archives/` — app-private internal storage. No
  permission, no shared storage, survives restarts and process death, not
  subject to the WebView quota manager, removed on uninstall.
- **download**: Java-side streaming from the canonical Release URL to
  `<id>.part`, hashing as it goes, 64 KB buffer — the archive is never held
  in memory, and never crosses the bridge. Verify size **and** SHA-256, then
  atomically rename and write a sidecar. A `.part` file is never openable, so
  an interrupted or corrupt download fails closed by construction.
- **read**: a `readRange(id, offset, length)` bridge method behind a
  `pmtiles.Source`. This deliberately does **not** use `convertFileSrc` or any
  HTTP range request, because §2(c) proves that path is broken; and it
  deliberately does not base64 the whole file across the bridge, because a
  61 MB archive must not become a 82 MB string. PMTiles asks for headers,
  directories and one tile at a time — kilobytes per call — and Capacitor
  serialises plugin calls on its own `CapacitorPlugins` thread, off the main
  thread.

Rejected alternatives, for the record: overriding `BridgeWebViewClient.
shouldInterceptRequest` to serve *correct* ranges for our own path prefix is
possible (`Bridge.setWebViewClient` is public) and would be faster, but it
depends on how Chromium's intercepted-request loader treats a
correctly-seeked stream — the documented failure says Chromium itself skips
to the range start, which would double-seek. That is unknowable without a
device, and this repo has already been burned once by a physical run that
looked fine. Bundling the archives in the AAB is rejected by the milestone's
own framing and by update cost. A second Android release pipeline is rejected
outright: Android downloads the same Release bytes Pages is verified against.

---

## 5. What changes in behaviour, and what must not

Gaining: terrain relief and satellite on Android as explicit downloads, with
the same card, the same states and the same copy as the PWA; SHA-256
verification on the native path; revision contracts for all four archives
rather than one; a single catalog behind the service worker, the deploy
workflow and both platforms.

Deliberately unchanged: the bundled vector archive stays bundled and stays
the airplane-mode cold-start basemap; the PWA keeps Cache Storage and its
existing byte-count contract; superseded archives keep working offline until
their replacement has downloaded successfully.

One deliberate delta, flagged for review rather than hidden: on the PWA an
undownloaded satellite archive can still be streamed from Pages over the
network, because it is same-origin. On Android the optional archives will be
**download-or-nothing** — no silent 61 MB stream over a hiker's mobile data
from inside the app shell. The user-facing states are the same set; what
differs is that "available online, not downloaded" is not offered as a
render path on the device. This matches the milestone's own rule that
selections reflect *actual local availability*, but it is a product call and
should be confirmed.
