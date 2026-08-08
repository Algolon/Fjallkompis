# Fjallkompis branding — the source of truth

**Change the Fjallkompis identity here.** The PWA and the Android app derive
every icon from this directory and are verified against it in CI. There is no
second master; if you find yourself editing a PNG under `public/icons/` or
`android/app/src/main/res/`, you are editing a generated file and CI will
notice.

## The master

| File | What it is |
| --- | --- |
| `fjallkompis-mark-512.png` | The approved Fjallkompis mark — a compass star behind a mountain roundel. 512×512, transparent background. **Everything else is derived from this.** |
| `brand.contract.mjs` | The machine-readable contract: brand colours, and every derived icon with its size, framing and plate. |
| `play-store-icon-512.png` | Generated. The file to upload in Play Console (see below). |

### One honest limitation

The master is a **raster**, not a vector. The repository has never contained an
SVG/AI master, and none was reconstructed for this contract — redrawing or
AI-recreating the mark would be a redesign wearing the old logo's clothes.

512×512 is therefore the ceiling for every derived size. That is sufficient for
every contract we currently have (the largest consumer, the Play Store listing
icon, is exactly 512×512), but it leaves no headroom. **If a genuine vector
master is ever produced it belongs here**, replacing the PNG as `master` in the
contract, and every derived size should be regenerated from it.

## Changing the identity

```bash
# 1. replace assets/brand/fjallkompis-mark-512.png
# 2. regenerate every PWA and Android icon from it
npm run generate:brand
# 3. confirm the tree matches the contract
npm test
```

`npm run generate:brand` rewrites only what has actually drifted, and re-running
it changes nothing. The read-only form — `node scripts/generate-brand-assets.mjs`
— reports drift and exits non-zero without touching the tree; that is what CI
runs, via `tests/branding-parity.test.mjs`.

## What is derived, and why each is framed differently

The mark spans **94%** of the master's canvas. Each platform reframes it to suit
a different masking contract — this is the part that is easy to get wrong, so it
is stated explicitly rather than left to a scale factor:

| Consumer | Size | Mark spans | Plate | Why |
| --- | --- | --- | --- | --- |
| `public/icons/icon-512.png` | 512 | 94% | — | Byte-identical copy of the master. Manifest `purpose: any`. |
| `public/icons/icon-192.png` | 192 | 94% | — | Manifest `purpose: any`. |
| `public/icons/icon-maskable-512.png` | 512 | 80% | `#e9edeb` | Manifest `purpose: maskable`. The spec reserves the outer 10% per side for the platform's mask; a transparent maskable icon renders as a black square on some launchers. |
| `public/icons/apple-touch-icon.png` | 180 | 90% | `#e9edeb` | iOS composites touch icons onto **black** rather than honouring alpha, so it must be plated. Its squircle is gentler than Android's circle, so 90% rather than 80%. |
| `public/icons/favicon.png` | 64 | 100% | — | Nothing masks a favicon and it is read at 16px, so the mark is bled to the edge for legibility. |
| `android/…/drawable-nodpi/fjallkompis_mark.png` | 512 | 94% | — | Byte-identical copy of the master. Adaptive-icon foreground **and** launch splash mark. Android cannot reference a PNG outside `res/`, which is why the bytes are duplicated rather than shared. |
| `android/…/mipmap-*/ic_launcher.png` | 48–192 | 80% | `#e9edeb` | Legacy square launcher, API 24–25 only. Drawn as supplied — no mask, no background — hence the plate. |
| `android/…/mipmap-*/ic_launcher_round.png` | 48–192 | 80% | `#e9edeb` | Legacy **round** launcher, API 24–25 only. Round-icon launchers draw this resource without applying a mask of their own, so it ships already circular. |
| `assets/brand/play-store-icon-512.png` | 512 | 80% | `#e9edeb` | Play Console listing. See below. |

From **API 26** the adaptive icon wins and the `mipmap-*` PNGs are never drawn.
The adaptive icon is not a PNG at all: `mipmap-anydpi-v26/ic_launcher.xml`
composes `@color/ic_launcher_background` with `@drawable/ic_launcher_foreground`,
which insets the master by 16% so the mark lands inside the 66.7% safe zone that
every launcher mask — including Samsung One UI's generous squircle — crops to.
That 80%/16% pairing is why API 25 and API 26+ present the mark at the same size.

## The Play Store listing icon

Upload **`assets/brand/play-store-icon-512.png`** in Play Console under
*Grow → Store presence → Main store listing → App icon*.

It is generated, so do not hand-edit it. It is deliberately **not** the same
thing as the Android launcher icon even though they share the identity:

- Play requires exactly 512×512, a full-bleed square, **no transparency**, and
  ≤1 MB. This file is opaque RGBA at 512×512 and ~105 KB.
- Play applies its own rounding to the listing icon, so the mark is inset to
  80% for the same reason the maskable icon is.
- An adaptive launcher icon is a *layered* resource with a 108dp foreground
  designed to be masked and parallaxed by the launcher. Handing Play that
  foreground would produce a mark floating at the wrong scale; handing Android
  this flat square would forfeit adaptive masking. They are separate contracts.

Nothing here uploads to Play. That step is manual and deliberate.
