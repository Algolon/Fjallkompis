# Today mode pill refinement + native picker audit

Status: implemented (this branch) — 2026-07-23
Owner request: refine the Prepare | On route header capsule (smaller,
lighter, liquid-glass), decide on icons, and root-cause the Android
date/time popup overflow photographed on Omar's device.

## 1. Mode pill — what changed and why

The v0.23 capsule worked but read flatter and heavier than the panes it
sits above: it used the opaque glass fill (`--glass-fill-opaque`) with the
card-scale `--glass-shadow`, and none of the layers that make Journey /
Tonight feel like glass (hairline rim, top catch-light, backdrop lift).

| Property | Before | After |
| --- | --- | --- |
| Total height | 44px (40px tabs + 2px padding) | 34px (30px tabs + 2px padding) |
| Label | 13px / 600 | 12px / 600, +0.01em tracking |
| Tab padding | 0 13px (0 10px ≤340px) | 0 12px (0 10px ≤340px) |
| Fill | opaque pane, no blur | `--glass-fill-light` + blur/saturate/brightness backdrop lift |
| Edge | none | hairline inset rim + 1px top catch-light (same tokens as `.today-glass`) |
| Outer shadow | card-scale `--glass-shadow` (16/40px drops) | control-scale `0 1px 2px / 0 5px 14px` |
| Selected tab shadow | `--shadow` | tighter `0 1px 2px` |
| Unselected ink | `--ink-soft` | `#3f4f45` (the darkened-on-glass step `.today-glass .card-sub` already uses — the translucent pane is brighter than the old opaque fill) |

Deliberately NOT copied from the cards: the lower-edge inner shade
(`inset 0 -12px 20px -16px`) — card-scale depth that turns into visible
murk at 36px — and the card radius/shadow geometry. The pill is a control,
not a content pane; it borrows the material, not the body.

Touch safety: each tab keeps a 44px vertical hit target via an invisible
`::after` extension (`inset: -7px 0` — vertical only, so the boundary
between the two tabs stays exact; 30px tab + 2×7px = 44px). The header
row's 44px rhythm is unchanged; the smaller capsule centers inside it.

Density correction (owner device feedback, same iteration): 36px still
read slightly tall next to the title on-device; the capsule dropped to
34px (tabs 32→30px, vertical only — typography, horizontal padding and
all glass layers untouched). Compared side by side at 320/360/390: the
2px sits the control closer to badge weight without thinning the labels'
breathing room (9px above/below the 12px line vs 10px before).

## 2. Icon decision — text-only stands

Re-evaluated for the new compact capsule, and rejected again:

- Width: two 14px glyphs + 4px gaps ≈ +36px on a ~150px control (~24%
  wider) at exactly the header position where 320px viewports have the
  least slack beside the 26px title.
- Meaning: "Prepare" and "On route" are already self-describing; a
  clipboard and a footprints glyph would restate, not add. Icons earn
  width when they replace text (they can't here — the modes are too
  abstract to carry icon-only) or disambiguate similar labels (not the
  case).
- Calm hierarchy: at 12px text / 32px tabs, added glyphs raise the
  control's visual weight and compete with the title — the opposite of
  this refinement's goal.

`tests/today-prepare.test.mjs` continues to fence the text-only contract.

## 3. Android date/time popup — root cause and honest limits

**Bug:** on Omar's Samsung device (Dutch locale) the time dialog's action
row — keyboard toggle + Wissen + Annuleren + Instellen — overflows the
screen; the date dialog handles the same width pressure by stacking its
buttons vertically.

**Root cause:** the dialog is rendered by the browser/OS (One UI-style
picker), not by the page. The app's fields are plain native
`<input type="date|time">` (TripItemSheet, WalletEditorSheet) with no
wrapper and no popup-affecting CSS; nothing in the page — viewport meta,
sheet layout, font sizing — participates in that dialog's layout. The
overflow is an OS/browser layout bug with long Dutch button labels
(likely amplified by device display/font scale): the time picker keeps
its four actions on one row where the date picker correctly stacks.

**Fix status: not web-fixable.** No CSS, attribute or wrapper reaches the
dialog's internals. Mitigations that were considered and rejected:
`required` (drops the Wissen button but lies about optional fields);
shadow-part pseudo-element hacks (don't apply to these dialogs and are the
classic half-themed trap); replacing the pickers with custom UI (a product
decision, not a bug fix — see below). The dialog's own keyboard-entry
toggle remains the built-in escape hatch, and the underlying value flow is
unaffected — the bug is cosmetic-to-annoying, not data-corrupting.

**What WAS shipped:** `color-scheme: light` (meta + `:root`). The app is
light-only; declaring it is the one standards-based lever a page has over
UA surfaces. Browsers that honour it (Chrome on Android does for its
pickers) render the dialog in its light theme, which both matches the app
better and — in the light variants — tends to use the stacked/roomier
button layouts. No guarantee on Samsung Internet's forced-dark mode; this
is a hint, not control.

**Branding recommendation:** the native popup should remain native. The
page reliably owns: the closed field (`.input` — already on the house
style), the surrounding sheet, and the light/dark scheme hint. It does
not own: dialog corner radius, dialog colours, button layout, typography.
Attempting deeper theming means shipping a custom picker — a deliberate
product/engineering decision that trades OS accessibility, locale
handling and muscle memory for visual control, and is not justified by
this bug. If the Samsung overflow proves genuinely obstructive in field
use (Instellen unreachable AND keyboard entry unacceptable), that is the
point to scope a custom Fjällkompis picker as its own iteration.

Fenced by `tests/native-picker-policy.test.mjs`.
