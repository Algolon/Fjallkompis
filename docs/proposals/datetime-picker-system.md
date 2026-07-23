# App-owned date & time picker system — Stage 1

**Status:** Stage 1 prototype in review (draft PR #69, not merged, no
release). Refinement pass 1 (2026-07-23, owner preview feedback) applied —
see the addendum at the end of this document.
**Owner decision context:** PR #68 root-caused the Android/Samsung time-picker
overflow (the OS dialog's `Wissen | Annuleren | Instellen` action row running
off screen) as an OS/browser-dialog layout bug that page CSS cannot reach, and
deliberately did not claim a fix. This iteration is the commissioned next
step: evaluate and prototype an app-owned picker system that takes the broken
OS dialog out of the loop entirely. It supersedes the "keep native" policy of
PR #68; the policy fence (`tests/native-picker-policy.test.mjs`) has been
rewritten to pin the new hybrid policy instead of silently deleted.

---

## 1. Current-field inventory (audit result)

Every date/time input in the app, as of `main` @ 0571537 (v0.24.0):

| # | Field | Component | Type | Optional | Min/max | Validation |
|---|---|---|---|---|---|---|
| 1 | Travel date | `TripItemSheet` (transport) | `date` | yes | none | shape-only at read time (`isTripDate`) |
| 2 | Departure | `TripItemSheet` (transport) | `time` | yes | none | shape+range at read time (`isTripTime`) |
| 3 | Arrival | `TripItemSheet` (transport) | `time` | yes | none | shape+range at read time |
| 4 | Check-in | `TripItemSheet` (stay) | `date` | yes | none | shape + pair-order (`isStayDateOrderValid`, inline error) |
| 5 | Check-out | `TripItemSheet` (stay) | `date` | yes | none | as above; normaliser drops an unorderable check-out |
| 6 | Document date | `WalletEditorSheet` | `date` | yes | none | shape-only at read time (walletModel `DATE_RE`) |

There are **no** other date/time inputs: no route, Settings, journal or
tracking field takes date/time from the user. (Verified facts dates such as
`lastVerified` are editorial constants, not inputs.)

**Storage format** — unchanged and non-negotiable:

- date: `'YYYY-MM-DD'` (tripModel `DATE_RE = /^\d{4}-\d{2}-\d{2}$/`, walletModel same)
- time: `'HH:mm'` 24-hour (tripModel `TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/`)
- Trip items live in `PersistentState.trip` (schema v6); wallet document dates
  in the `fjallkompis-wallet` IndexedDB records. **No schema bump is needed or
  made** — the audit confirmed the pickers emit byte-identical shapes.

**Parsing/formatting behaviour (pre-existing):**

- All sorting/comparison is plain ISO **string** comparison
  (`tripModel.compareByDate`, `dateGroup`, wallet sort) — timezone-safe.
- All display parsing builds local dates as `new Date(\`${iso}T00:00:00\`)`
  (`format.ts formatDateLong/formatVerifiedDate`, `TripView`), never the bare
  `new Date('YYYY-MM-DD')` UTC form. **No UTC date-shift bug exists anywhere**
  in the app; the audit specifically looked for one.
- `todayIso()` (format.ts) derives today's local ISO date correctly via the
  timezone offset.
- One latent gap the new utils close: the storage regex accepts non-existent
  days (`2026-02-31`). The read-time normaliser keeps such a value; the new
  `parseIsoDate` rejects it, so the pickers degrade a malformed stored value
  to "no selection" instead of rendering an impossible day.

**Locale assumptions:** UI copy is English; `formatDateLong` uses the browser
locale for month/weekday names (display only), `formatVerifiedDate` pins
`en-GB`. The native pickers were the only OS-localized surface — the source of
the Dutch labels in the bug report.

**Dialog/focus infrastructure available for reuse:**

- Native `<dialog>` everywhere: `.sheet` bottom sheet (centred ≥760×500),
  `.credential-viewer` centred modal (STF card), RotateGuard.
- Established patterns: `showModal()` on mount, capture opener →
  `opener?.focus()` on unmount, `onClose` for Escape, backdrop-click via
  `e.target === dialogRef.current`, ConfirmDialog's local Tab trap.
- Test conventions: `node:test` + source-scan contract fences + pure-model
  unit suites; no DOM test runner.

**Reusable-architecture conclusion:** all six fields can share one
`DateField` and one `TimeField` component (closed field + dialog). The
`.credential-viewer` centred-modal presentation is the right dialog shell; the
`.sheet` slide-up is wrong for a picker (form-opening connotation, and the
pickers open *from within* a sheet).

## 2. Architecture recommendation

**Date — Option B (calendar grid), chosen.**
- Option A (day/month/year selects) was rejected: three `<select>`s still open
  OS-rendered popup lists on Android (same class of surface as the broken
  dialog, same theming problem), give no week context for picking a travel
  day, and read as a bureaucratic form. It remains the right *fallback shape*
  if a device problem with the grid ever surfaces.
- Option C (native fallback retained alongside): adopted **as the rollout
  posture rather than a runtime switch** — stay + wallet fields simply stay
  native until the pilot passes the owner's device check, so the proven
  fallback shape stays alive in the codebase without ever showing two
  competing controls for one field.

**Time — Options 1+2 combined (direct numeric fields with steppers), chosen.**
- Direct two-box HH:mm entry is the primary path (numeric keyboard, fastest
  for known times like 10:10).
- ± steppers ride along because they cost little visual weight (four 44px
  square buttons) and make touch adjustment one-handed. Verdict from the
  prototype: keep them — the dialog still reads as calm, and they double as
  the accessible coarse-adjust mechanism.
- Option 3 (hour/minute `<select>`s) rejected: a 60-entry native dropdown on
  Android is exactly the OS surface being escaped, and slower than typing.
- No analog clock, no wheels (per the task; nothing justified them).

## 3. Date-picker interaction specification

`DateField` (closed field) + `DateFieldDialog` in `src/components/DateField.tsx`.

Closed field: a `button.input.picker-field` inside the standard `label.field`
(the dialog itself renders as a *sibling* of the label — a label forwards
clicks to its control, so a dialog inside it would re-trigger the opener).
Shows `Wed 22 Jul 2026` or `Not set`; `aria-haspopup="dialog"`; calendar icon.

Dialog (centred native `<dialog>`, all sizes):

- One-month grid, Monday-first, weekday headers `MO…SU`, leading/trailing
  blanks; 4–6 rows, every day exactly once (fenced by utility tests).
- Header: `‹` previous / `›` next month buttons (44px), month title
  ("July 2026", `aria-live="polite"`).
- Opens on the stored value's month with that day selected; on empty or
  malformed value, on today's month with nothing selected.
- Today: glacier inset ring + `aria-current="date"`. Selected: cloudberry
  fill + `aria-selected`.
- Tapping a day selects it; **Set commits** (`onChange('YYYY-MM-DD')`),
  **Clear commits ''**, **Cancel/Escape/backdrop commit nothing**. The
  dialog's only mutation path is Set/Clear — fenced by contract test.
- Keyboard (APG grid pattern): roving tabindex; ←/→ ±1 day, ↑/↓ ±1 week
  (crossing month/year boundaries moves the view), Home/End Monday/Sunday of
  the focused week, PageUp/PageDown ±1 month (Shift: ±1 year) with day
  clamped to month length (31 Jan → 28 Feb), Enter/Space select, Escape
  cancels. Mouse month-paging never steals focus from the nav buttons.
- Month/year boundaries, leap years and month lengths come from the pure
  module (§7), not from `Date` string parsing.
- No ranges, no min/max (no current field has them; deliberately out of scope).

## 4. Time-picker interaction specification

`TimeField` + `TimeFieldDialog` in `src/components/TimeField.tsx`. 24-hour only.

- Two 2-digit boxes (hour, minute), `inputmode="numeric"` (numeric mobile
  keyboard), digits-only filter, select-all on focus, `––` placeholder.
- ▲/▼ steppers per column: hour ±1 wrapping 23↔0; minutes ±5, snapped to the
  next multiple in the pressed direction from odd values (32▲→35, 32▼→30),
  wrapping 55▲→0. Typed values stay exact — snapping only happens on stepper
  presses. On an empty field the first press *materialises* a start value
  (hour 12, minutes 00) without stepping, so the tap that makes a number
  appear never also changes it.
- ↑/↓ arrows on the inputs step; Enter attempts Set; blur zero-pads a valid
  single digit (`7` → `07`).
- Validation before commit: hour must be 0–23 to enable Set; a value like
  `77` shows an inline `role="alert"` error ("Minutes go from 00 to 59."),
  sets `aria-invalid` + `aria-describedby`, and disables Set. An empty minute
  box commits as `:00` (typing "14" then Set gives `14:00`); Clear is the way
  to commit "no time". Committed shape is always zero-padded `HH:mm`.
- Minute step stays 1 for typed input — the current product has no step
  constraint and the pickers must not invent one.

## 5. Visual wireframes (as built)

Both dialogs sit on the deep-spruce credential-like surface
(`--spruce-700`, light ink `#eef3ec`), `--r-lg` corners, the
credential-viewer's scale-from-centre entrance (disabled under
prefers-reduced-motion), hairline light rim, no heavy glass.

```
DATE                              TIME
Travel date                       Departure

[‹]      July 2026        [›]        [▲]        [▲]
MO  TU  WE  TH  FR  SA  SU
         1   2   3   4   5         [ 11 ] : [ 30 ]
 6   7   8   9  10  11  12
13  14  15  16  17  18  19           [▼]        [▼]
20  21  22 (23) [24] 25  26
27  28  29  30  31                (error line, if any)

[ Clear ] [ Cancel ] [Set date]   [ Clear ] [ Cancel ] [Set time]
```

`(23)` = today (glacier inset ring), `[24]` = selected (cloudberry fill,
white numeral). Set is the only cloudberry action (disabled = 45% opacity);
Clear/Cancel are translucent ghost buttons on the dark surface. Focus rings
use the glacier-soft tint (visible on spruce; the standard `--glacier-700`
ring stays on light surfaces). Closed fields keep the exact `.input` skin
with an ink-faint icon, so forms look unchanged until a field is opened.

The action row is `flex-wrap: wrap` with `white-space: normal` buttons —
verified with the literal Dutch labels from the bug report (`Wissen`,
`Annuleren`, `Tijd instellen`): they wrap onto two rows inside the dialog,
nothing overflows. That layout freedom is the structural fix the OS dialog
lacked.

## 6. Accessibility specification

- Native `<dialog>.showModal()`: top-layer focus trap, Escape, `::backdrop`,
  page inert — the app's established modal contract.
- Initial focus: date → the focused day button (selected day, else today);
  time → the hour box, pre-selected.
- Focus return to the opener on close (captured at mount, restored in the
  unmount cleanup — same as every app dialog).
- Date grid: `role="grid"` labelled by the month heading, `role="row"`,
  weekday `role="columnheader"` with full-name `aria-label`, day buttons
  `role="gridcell"` with `aria-label` "Thursday 23 July 2026",
  `aria-selected`, `aria-current="date"`, roving tabindex.
- Time: labelled group ("Departure, 24-hour time"); inputs labelled
  "Hour (00–23)" / "Minutes (00–59)"; steppers labelled ("Minutes up
  (5-minute steps)"); errors `role="alert"` + `aria-invalid` +
  `aria-describedby`; colon decorative.
- Touch targets: day cells are gapless full-tile hit areas 44px tall —
  ≥44px wide from 375px viewports, 42.9px at 360, 37.1px at 320 (the
  documented small-phone compromise; zero dead space between tiles). All
  steppers/nav buttons 44×44. Actions use the app's 46px `.btn`.
- Text scaling: the app is px-sized throughout (system stack, no rem scale);
  the picker follows the app convention. The structural risk at large text —
  the action row — wraps instead of overflowing; Android font-scale boosts
  text without breaking the layout. A dedicated large-text pass belongs to
  the production stage on the real device.

## 7. Utility/data-model decisions

New pure module `src/utils/dateTimeField.mjs` (+ `.d.mts`), zero deps:

- calendar: `isLeapYear`, `daysInMonth`, `buildMonthGrid` (Monday-first),
  `addMonths`, `addDays`, `clampDay`, `weekdayIndex`
- ISO: `parseIsoDate` (strict — shape **and** real calendar day),
  `isRealIsoDate`, `toIsoDate`, `pad2`
- display: `formatMonthTitle`, `formatDateFieldLabel`, `formatDayAria` —
  **fixed English** names (decision below)
- time: `parseIsoTime`, `parseHourText`/`parseMinuteText`, `isValidHour`/
  `isValidMinute`, `toIsoTime`, `stepHour`, `stepMinute`

Conventions: `month`/`day` are 1-based; JS `Date` is used only via numeric
constructors (local, calendar-safe) — the UTC string-parse form is banned in
the module header; stored wire shapes are untouched. `tripModel`/`walletModel`
validators are byte-identical to before (fenced).

**Localization decision:** the picker uses the app's English with fixed name
tables — deterministic offline, in tests, and immune to the OS-locale
mismatch that produced Dutch labels inside an English app. Stored values stay
ISO. Explicit localization stays a possible later feature; no translation
framework now (per task).

## 8. Prototype implementation details

- `src/components/DateField.tsx` — `DateField` + `DateFieldDialog`
- `src/components/TimeField.tsx` — `TimeField` + `TimeFieldDialog`
- `src/utils/dateTimeField.mjs` / `.d.mts` — pure helpers
- `src/styles/global.css` — marked section "App-owned date & time picker
  dialogs (Stage 1 prototype)" at the end of the file
- Integration (the real state/form flow): `TripItemSheet` transport fields —
  Travel date, Departure, Arrival — replaced with
  `<DateField/>`/`<TimeField/>`. The components take `value`/`onChange` with
  exactly the native inputs' string contract, so the sheet's draft state,
  `clean()` on save, validation and persistence are untouched. Stay and
  wallet fields deliberately stay native in Stage 1.
- No fake trip data is committed anywhere: the pickers mutate only the
  sheet's draft state; persistence still happens solely through the existing
  Save action. Verification used the live form without saving.

**Bug found and fixed during verification (the key Stage 1 lesson):** React's
synthetic event system re-bubbles the natively-non-bubbling `close` event
through the *component* tree. The picker dialogs render inside
`TripItemSheet`'s `<dialog onClose={…setEditor(null)}>` — so closing a picker
also closed the whole transport sheet under it. Fix: the picker dialogs call
`e.stopPropagation()` in `onClose` (and `onCancel`) before notifying their
caller. This is now a fenced contract
(`tests/date-time-picker-ui.test.mjs`) and a rule any future nested-dialog
component must follow.

## 9. Responsive findings (measured, dev build)

| Viewport | Dialog width | Day cell | Fits, no overflow |
|---|---|---|---|
| 320×568 | 282px | 37.1×44 | yes (actions wrap to 2 rows) |
| 360×560 | 322px | 42.9×44 | yes |
| 375×667 | 337px | 45×44 | yes |
| 390×844 | 352px | 47.1×44 | yes |
| 1280×800 | 392px | 47.1×44 | yes, centred |

Centred modal at every size (`min(392px, 100vw − 32px)`, time dialog
`min(340px, …)`); the calendar bleeds 6px into the body padding per side to
buy cell width on small phones; no horizontal page scroll anywhere; long
Dutch action labels wrap inside the dialog (§5).

## 10. Tests / typecheck / build

- `tests/date-time-field.test.mjs` — 15 pure-utility tests: leap years
  (incl. 1900/2000/2100), month lengths, Monday-first alignment against
  known anchors, grid completeness, month/day arithmetic across year
  boundaries, strict ISO parsing (rejects `2026-02-30`, `2027-02-29`),
  zero-padding round-trips, English labels, 24h boundaries (`24:00`,
  `12:60` rejected), typed-text parsing, stepper wrap/snap/materialise.
- `tests/date-time-picker-ui.test.mjs` — 11 contract tests: native dialog
  modal contract per component, only-Set/Clear-commit, stop-propagation
  fence, APG keys present, roving tabindex/aria, numeric inputmode, no
  analog artifacts, transport wiring + unchanged storage regexes, schema
  stays v6, no `showPicker()` anywhere in src, action-row wrap rules,
  44px touch targets.
- `tests/native-picker-policy.test.mjs` — rewritten policy fence (§ intro).
- `tests/trip-view.test.mjs` — native-input assertion updated to the new
  policy split.
- **Full suite: 620/620 pass. `tsc -b` clean. Production build clean**
  (no version bump — the bump belongs to the production PR, per repo
  convention).

## 11. Risks and trade-offs

- **Real-device confirmation pending.** The entire point is the owner's
  Samsung; the preview harness cannot reproduce OS dialog behaviour. Stage-1
  sign-off requires the device pass (Trip → Add transport → all three
  fields).
- **Nested-dialog top-layer stacking** works in Chromium (verified); the
  stop-propagation fence guards the React re-bubbling hazard. Any future
  dialog-in-dialog component must copy that rule.
- **320px cell width** (37px) is below the 44px ideal in one dimension;
  mitigated by gapless tiles and 44px height. Native pickers on such devices
  were no better.
- **English-only names** are a product decision, not a limitation of the
  data (ISO stored). OS-localized users lose the localized picker they had —
  the owner's explicit preference given the app is English.
- **Steppers add four buttons** to the time dialog; measured verdict was
  calm, but the owner may prune them after device use.
- **The synthetic-key limitation of the preview pane** means real Escape and
  Enter activation were exercised via the equivalent code paths plus unit
  fences, not real key events. Device/desktop manual pass covers this.

## 12. Recommended production rollout

1. **First (this pilot, after device approval):** transport Travel date,
   Departure, Arrival — already wired.
2. **Second:** stay Check-in/Check-out (same `DateField`; keep the existing
   pair-order validation exactly where it is — it lives on the draft, not in
   the picker) and the Documents date in `WalletEditorSheet`.
3. **Fallback posture:** no runtime native fallback control. The native
   `<input type="date">` shape remains the documented fallback (trivially
   restorable per field), and `color-scheme: light` stays for any UA surface.
   If a device-specific grid failure ever appears, Option A (selects) is the
   designed fallback, not the OS popup.
4. After full rollout, collapse the policy fence's "stay native" clauses and
   bump the version in the production PR (target 0.25.0).

## 13. Production-implementation prompt

See §13 of this document in the PR body, or use directly:

> Fjällkompis production rollout of the app-owned date/time pickers
> (Stage 1: docs/proposals/datetime-picker-system.md, branch
> `claude/datetime-picker`). The owner has device-approved the transport
> pilot. Tasks: (1) replace the stay Check-in/Check-out native date inputs in
> TripItemSheet with `DateField` (dialog titles "Check-in"/"Check-out"),
> keeping `isStayDateOrderValid` validation and its inline error untouched on
> the draft state; (2) replace the Documents date input in WalletEditorSheet
> with `DateField` (title "Document date"); (3) update
> tests/native-picker-policy.test.mjs to assert zero native date/time inputs
> remain and that DateField/TimeField are the only pickers, and update
> trip-view/wallet fences accordingly; (4) leave `color-scheme: light`, the
> ISO storage shapes and schema v6 untouched — no migration; (5) verify: full
> suite, typecheck, build, browser pass at 320/360/375/390/desktop incl.
> keyboard grid nav, focus return, Escape/Cancel non-mutation, and stay
> check-out-before-check-in error still firing; (6) bump to 0.25.0 with
> CHANGELOG + ROADMAP entries per repo convention; (7) open a PR (draft until
> the owner's device pass on stay+wallet fields). Do not add min/max, ranges,
> steppers to dates, or any localization framework. Remember the
> stop-propagation rule for dialogs nested in sheets.

---

*Verification transcript highlights (2026-07-23): commit/cancel/clear flows,
APG keyboard nav (ArrowRight, PageDown month change, Home→Monday), focus
return to trigger, validation errors, Dutch-label wrap, and viewport fits
were all exercised live in the preview harness; environmental throttling of
the hidden pane was distinguished from app behaviour by instrumented probes —
which is how the React close-re-bubbling bug (§8) was caught and fixed.*

---

## Addendum — refinement pass 1 (2026-07-23, after owner preview approval)

The owner approved the overall look and behaviour in the Claude preview and
requested two focused corrections before the real-device test.

### A. Text-selection policy

**Audit finding:** the app has had the desired policy since 2026-07-12 —
`html { user-select: none; -webkit-touch-callout: none }` with an
`input, textarea, [contenteditable]` restore — but it never reached any
native `<dialog>`: top-layer elements do not take the propagated used
`user-select` value from the document, so inside a modal dialog `auto`
resolves to `text` again (measured in Chromium: every element in both the
trip sheet and the pickers computed `text` while identical content outside
dialogs computed `none`). The problem was therefore **systemic to every
dialog surface** (sheets, Add-item chooser, credential viewer, image viewer,
RotateGuard, both pickers) — the new pickers merely made it visible.

**Policy (one central rule, no scattered opt-outs):**

- default: `html, dialog` → `user-select: none` (+ `-webkit-`),
  `-webkit-touch-callout: none`;
- editable restore (unchanged, declared after the default): `input`,
  `textarea`, `[contenteditable]` → `user-select: text`, callout default —
  typing, copy/paste and Shift+Arrow selection keep working everywhere,
  including inside dialogs;
- one deliberate extra exception: `dialog img` keeps the platform
  long-press callout — saving/sharing your own stored ticket or STF card
  from the viewers is a feature, and the viewers are dialogs.

**Copyable-content audit:** trip notes and booking references are never
rendered as static text — they are only visible inside the edit sheet's
inputs, which are selectable; the copy path is the editor. Links are
tappable, not copy-targets. So no `.selectable` utility exists yet; the
fence documents that it should be introduced the day static user-authored
text appears. Fenced by `tests/text-selection-policy.test.mjs` (central
rule, editable restore order, image exception, no scattered rules, no
inline `userSelect` in components).

**Verified:** computed styles across dialog chrome = `none`, inputs =
`text`; a real pointer drag across the whole calendar selects nothing;
input range selection works. Real long-press cannot be produced by the
browser tooling — computed-style + drag evidence stand in; the long-press
feel check belongs to the Samsung pass.

### B. Stable-top calendar positioning

**Why whole-dialog centring was rejected:** months span 4–6 grid rows
(February 2027 = 4, September 2026 = 5, August 2026 = 6). A vertically
centred dialog re-centres on every month change, so the title, month
navigation and weekday header all jump by half the height delta — repeated
navigation feels spatially unstable (owner's screenshots).

**Decision — Option A, top anchor:** the date dialog keeps horizontal
centring but anchors its top edge at
`--picker-top: clamp(20px, env(safe-area-inset-top) + 8dvh, 88px)`
(vh fallback line for browsers without dvh), growing downward for longer
months; `max-height: calc(100dvh − --picker-top − 16px)` with the existing
internal body scroll keeps short viewports usable. Option B (fixed six-row
body) was not needed: measured whitespace on 4-row months would be ~88px of
dead grid, visibly worse than a stable header with a naturally shorter
card.

**The TimeField stays fully centred, deliberately:** its height never
varies, so centring is already stable there and calmer for a small dialog —
the top anchor exists to absorb variable height, which the time dialog does
not have. Recorded in the CSS next to the override and fenced.

**Measured stability (375×667, real next-month taps + keyboard PageDown):**

| Month | Rows | Dialog top | Title top | Prev/next top | Weekday top | Action row top | Height |
|---|---|---|---|---|---|---|---|
| February 2027 | 4 | 53.4 | 85.9 | 119.4 | 173.4 | 393.4 | 403 |
| July 2026 | 5 | 53.4 | 85.9 | 119.4 | 173.4 | 437.4 | 447 |
| September 2026 | 5 | 53.4 | 85.9 | 119.4 | 173.4 | 437.4 | 447 |
| August 2026 | 6 | 53.4 | 85.9 | 119.4 | 173.4 | 481.4 | 491 |

Header/navigation/weekday coordinates are identical to the decimal; only
the action row and total height move, downward only. Top offsets at other
sizes: 320×568 → 45px, 660×360 (short landscape) → 29px with internal
scroll and the action row reachable, 1280×800 → 64px; the page behind never
scrolls.

### C. Backdrop consistency (unchanged, re-confirmed)

Backdrop click still cancels (no commit), inside-clicks never close, focus
returns to the field trigger, and the nested-close stop-propagation guard
(§8) is untouched — all still fenced. Positioning contract added to
`tests/date-time-picker-ui.test.mjs` (top-anchor variables, no full
centring for the date dialog, the time dialog's documented centring
exception, no fixed calendar height, internal scroll present).
