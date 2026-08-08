# Branding parity — visual evidence

Rendered from the committed assets by the branding toolkit
(`scripts/lib/png.mjs`), so each sheet shows the artwork that is actually in
the tree, not a mockup. Everything here is derived from
`assets/brand/fjallkompis-mark-512.png`.

| Sheet | What it shows |
| --- | --- |
| `android-adaptive-masks.png` | The adaptive icon composed the way Android composes it — a 108dp layer cropped to the central 72dp — under circle, squircle (Samsung One UI-style), rounded-square, square and teardrop masks. **The compass points survive every mask**; this is what the 16% foreground inset buys. |
| `android-legacy-square-vs-round.png` | Legacy API 24–25 icons at xxhdpi on a transparency checkerboard: square `ic_launcher` beside the now genuinely circular `ic_launcher_round`. Before this PR the right-hand tile was a byte-identical copy of the left one. |
| `android-splash.png` | The native splash as API 31+ composes it: the launch colour `#dce4d8` with the mark at 196dp centred. Artwork only — the splash *lifecycle* is unchanged and remains fenced in `tests/native-runtime.test.mjs`. |
| `pwa-icons.png` | Installed-PWA representation: `icon-192` (transparent, purpose `any`), the maskable icon under circle and squircle masks, and the plated Apple touch icon. |
| `small-size-legibility.png` | Favicon (top) and launcher icon (bottom) at 16, 24, 32, 48, 64 and 96px. |

## Read the small sizes honestly

At **16px** the mountain-and-compass detail collapses into a dark roundel: the
mark reads as a shape and a colour, not as a mountain. It is legible and
clearly Fjallkompis in context, but it is not crisp. From **24px** upward the
silhouette resolves, and from 32px the mountain is unambiguous.

This is a property of the approved mark — a detailed illustration inside a
circular badge — and not something icon derivation can fix. Improving it would
mean a simplified small-size variant of the logo, i.e. a redesign, which is out
of scope here. Recorded so the trade-off is a decision rather than an oversight.

## Not covered here

These sheets are renders of the committed assets. They are **not** a substitute
for:

- the packaged AAB check (`scripts/verify-packaged-branding.mjs`, wired into
  the Android release workflow — it needs a release dispatch to run);
- physical validation on the Samsung: the real launcher mask, the real splash
  handoff, and the first React frame after it.
