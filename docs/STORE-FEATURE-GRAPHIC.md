# Google Play feature graphic

The feature-graphic generator creates three evidence-backed Google Play candidates from the privacy-checked Store screenshot set. Generated assets live in the ignored `artifacts/store-feature-graphics/` directory; they are listing assets only and never enter `dist` or the Android package.

## Generate

First generate the audited Store sources, then compose the candidates:

```sh
STORE_DEMO_BACKUP=/safe/path/fjallkompis-store-demo-sanitized.fjallkompis.zip npm run capture:store
npm run generate:store-feature-graphics
```

Use `--source` and `--output` to keep experiments separate. The generator requires the Store manifest's pinned backup SHA-256 and `visible-dom-pass` source status for Today, Terrain Map and Trail Readiness. It writes `manifest.json` with the source base SHA, source backup hash, dimensions and byte size of each candidate.

## Concepts

1. `01-today-hero.png` — the recommended graphic: a calm Today crop beside the concise promise “Your hike, ready offline.” It most directly matches the app's day-by-day companion value without over-explaining.
2. `02-offline-maps.png` — Terrain Map as the hero, for a map-first listing experiment.
3. `03-companion-overview.png` — Today plus Trail Readiness, for a broader but still spacious product overview.

Every PNG is exactly 1024×500 and the generator rejects files above 15,000,000 bytes. Text is fixed, deliberately limited, and checked against the same privacy-pattern rules as Store capture metadata. The source captures are sanitized-demo output; no backup contents or generated graphics are committed.
