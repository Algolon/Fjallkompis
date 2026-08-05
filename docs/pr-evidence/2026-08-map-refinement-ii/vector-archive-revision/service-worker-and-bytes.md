# Service-worker and cache-name proof

Generated from the production build in this branch (`npm run build`).

## Cache names in the generated service worker (`dist/sw.js`)

```
fjallkompis-offline-contours-v1
fjallkompis-offline-map-v2
fjallkompis-offline-terrain-v1
```

The vector cache is the CURRENT revision only. Superseded vector cache names in `dist/sw.js`:

```
fjallkompis-offline-map-v1 occurrences: 0
```

## Cache names in the app bundle

```
fjallkompis-offline-contours-v1
fjallkompis-offline-map-v1
fjallkompis-offline-map-v2
fjallkompis-offline-satellite-v1
fjallkompis-offline-terrain-v1
```

The bundle carries `fjallkompis-offline-map-v1` as the declared LEGACY cache
(read-only fallback, pruned after a successful update); the service worker does not.

## Range-request route

The generated route, from `dist/sw.js` (minified):

```js
```

The URL pattern still matches the bare public path, so the Cache Storage key the
app writes is exactly what the range handler looks up. Only `cacheName` moved.

## Archive bytes

```
committed  public/maps/kungsleden.pmtiles  5904598 bytes  sha256 17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51
built      dist/maps/kungsleden.pmtiles    5904598 bytes  sha256 17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51
declared   VECTOR_ARCHIVE_REVISION         5904598 bytes  sha256 17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51
superseded (pre-PR #104, git 719ae68)      5603107 bytes  sha256 c1fc1c5ec2ad721596ed3079d7b45a858cd1887a17586f1d3fdaa1b8bfdc031b
```
