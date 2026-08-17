# PDF modal lightbox + natural pinch — evidence run

UX refinement of the in-app PDF viewer after physical feedback on 2700011:
the viewer now presents as a **lightbox layered over the originating
screen** (dimmed backdrop, rounded surface, visible outer margin) instead
of a full-screen takeover, and pinch zoom anchors the content under the
fingers with **no snap** when the sharp pdf.js re-render lands.

Scripted mobile Chromium (412×915, touch) against the real `--mode native`
bundle, using **CDP-synthesised touch pinches** (`Input.synthesizePinchGesture`
— real TouchEvents through the app's own gesture code). Machine-read
assertions in `results.json`:

| claim | measured |
| --- | --- |
| modal overlays the Wallet, 12 px visible margin, 22 px radius, `rgba(27,42,39,.45)` dim | `modal.*` |
| pinch ×2.48 about an off-centre point: content under the fingers stays put | focal drift **−0.08 px / +0.50 px** |
| release → sharp re-render with **no visible jump** | re-render shift **0.00 / 0.00 px**, layout delta 0 |
| re-render actually sharpens | canvas 723 → 1681 device px |
| pan while zoomed, bounded | scroller pans exactly, clamps at origin |
| pinch-out returns to fit-width | width ratio 1.000, scrollLeft 0 |
| backdrop tap closes; Wallet state intact | `backdropClose` |
| close button + Escape close | `buttonAndEscapeClose` |
| corrupt PDF: honest error + Save a copy, in the modal | `7-corrupt-modal.png` |
| image tickets keep their own sheet | `imageRegression` |
| desktop/tablet: centred modal, 172 px backdrop each side | `8-desktop-centred-modal.png` |
| zero popups / `window.open` | `popups: 0` |

**Known emulation gap:** this headless Chromium's CDP *touch scroll*
synthesis is inert even on a plain `overflow: auto` div (verified against a
synthetic page), so one-finger touch panning was exercised through the same
scroller with wheel deltas — identical scroll pipeline and bounds. Real
one-finger pan and pinch feel remain on the Samsung physical-validation
list.
