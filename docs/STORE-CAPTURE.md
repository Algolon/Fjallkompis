# Google Play Store capture

The Store harness regenerates clean, deterministic screenshots of the real responsive Fjallkompis UI. It uses a separate `store-capture` Vite build, imports the externally supplied sanitized complete backup through the product restore flow, loads the catalog-pinned optional map archives into browser storage, navigates to named scenes, waits for fonts plus the Map's post-load ready state and a loaded, stationary MapLibre instance, runs privacy/content/overflow assertions, and writes PNGs plus `manifest.json` under the ignored `artifacts/store-capture/` directory.

The backup is deliberately not tracked or copied into `dist`. The harness accepts only the privacy-audited SHA-256 currently pinned in `scripts/lib/store-capture.mjs`; changing demo input is an intentional reviewed tooling change.

The current privacy sanitizer changed the four Wallet document IDs without renaming their opaque attachment paths, which the production restore validator correctly refuses as an integrity mismatch. The harness deterministically repairs only those ZIP paths in memory before handing the bytes to the real restore UI. It does not modify state, metadata, attachment bytes, or the external source file.

## Run

Chrome must be installed, or install Playwright Chromium with `npx playwright install chromium`.

```sh
STORE_DEMO_BACKUP=/safe/path/fjallkompis-store-demo-sanitized.fjallkompis.zip npm run capture:store
```

Equivalent explicit form:

```sh
npm run capture:store -- --backup /safe/path/fjallkompis-store-demo-sanitized.fjallkompis.zip
```

Use `--output <directory>`, `--skip-build`, or `--no-captions` for local iteration. A normal run builds with `vite --mode store-capture`, starts `vite preview`, uses a fresh isolated browser context per profile, resets all prior state by construction, and stops the preview process when done. Normal `npm run build`, application startup, runtime state, and Android packaging are unchanged. The MapLibre handle exists only in the capture build and is statically removed from the normal production build.

## Profiles

| Profile | CSS viewport | Device scale factor | PNG output | Layout exercised |
| --- | ---: | ---: | ---: | --- |
| Phone | 360×640 | 3 | 1080×1920 | compact bottom navigation |
| 7-inch tablet | 810×1440 | 2 | 1620×2880 | responsive tablet rail |
| 10-inch tablet | 1080×1920 | 1.8 | 1944×3456 | wide tablet rail/content |

Every output is exact portrait 9:16, stays under 8 MB, and meets the stronger 1080-pixel promotional floor. The two tablets render genuinely different CSS viewports rather than enlarged phone pixels.

## Scenes and selection

The canonical clean set is `01-today`, `02-map-terrain`, `03-map-satellite`, `04-stage-guide`, `05-packing`, and `06a-trail-readiness`. `06b-wallet` is an evidence candidate so reviewers can compare the two final-story options. The recommended order is the canonical numeric order above. Trail Readiness is recommended over Wallet for the sixth Store slot: it communicates the complete offline/preparation promise immediately and avoids spending a core slot on document management.

The harness also generates restrained Phone-only caption comparisons for Today, Terrain, and Stage Guide under `captioned/phone/`. Clean screenshots remain canonical. Clean is recommended for the first listing pass because Fjallkompis already has strong in-product headings and the clean set is more truthful, easier to maintain, and visually calmer. The caption generator remains available if listing conversion tests later justify it.

## First-candidate tablet audit

Both tablet profiles use the real responsive rail. Content stays in bounded readable columns, cards keep proportionate controls and typography, Map composition uses the extra canvas rather than stretching phone pixels, and the harness found no horizontal overflow. The 10-inch Today view changes to a genuine split card composition. Portrait document/list screens deliberately leave more empty space below their bounded content; that is honest current behavior, not cosmetically filled by the capture tooling, and it is not a usability blocker for this candidate set.

The final-Map repeatability check on base `eebb86ad9fdf6047f365333f4c9d3220f7ac0899` produced the same 21 clean filenames, dimensions, profile metadata and privacy metadata twice in the same browser version. Sixteen PNGs were byte-identical; five differed at the PNG-byte level from normal browser rasterization variation.

## Privacy and integrity contract

Capture stops unless the external file hash exactly matches the audited sanitized demo backup. It scans backup JSON strings, archive entry names, visible DOM text, output names, and the generated manifest for email addresses, plausible personal phone numbers, private filesystem paths, account/device identifiers, private notes, QR/barcode wording, and non-DEMO booking/ticket/passenger references. It also requires exactly four sanitized Wallet documents. Scene checks reject loading UI, missing expected content, visible warning states, open modal/popover surfaces, and horizontal page overflow.

The checks do **not** perform OCR on screenshots or Wallet image attachments and cannot prove that every arbitrary personal name is absent. For this pinned input, the attachment contents were additionally reviewed before capture: the images/PDFs are visibly marked DEMO, use “Demo Hiker” and synthetic references, and contain no QR/barcode. The pinned hash makes that manual review reproducible for every later UI-only recapture.

No backup file, Wallet attachment, generated screenshot, or map archive is committed by this workflow. The optional archive files are ignored local inputs verified against the catalog revision before capture. Normal production startup never loads demo state, the capture workflow does not touch version/release metadata, and it does not dispatch Android or Play releases.

## Feature graphic proposal

For a later 1024×500 feature graphic, use one calm central composition: a cropped Terrain map with the route clearly visible, paired with the Fjallkompis mark and a small Today-card cue. Avoid a three-screen collage. A suitable optional headline is “Your Kungsleden companion, offline.” The clean Terrain and Today captures are the source references; the final graphic should be generated separately rather than promoted from a screenshot crop without review.
