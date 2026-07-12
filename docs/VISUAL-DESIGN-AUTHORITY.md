# Fjällkompis visual design authority

Operational rules for the arctic-fjäll design system. This document records
the *conventions and semantic roles* the interface must keep — it does not
catalogue every CSS value (tokens live in `src/styles/global.css`, whose
`:root` block is the single source of truth for actual values).

Origin: Design Review #1 (v0.18 pre-field), decisions D5, D6 and D8
(`docs/design-reviews/2026-07-v0.18-pre-field-review.md`).

## Palette roles

| Family | Tokens | Role |
|---|---|---|
| Stone / paper surfaces | `--stone-bg`, `--paper`, `--paper-2`, `--paper-bright` | The landscape the UI sits on: app background → cards/controls → grouped inners → inputs/active segments. New surfaces join this ramp; they do not invent new whites. |
| Ink | `--ink-strong` … `--ink-faint` | All text. De-emphasis steps down the ramp; it does not change hue. |
| Spruce | `--spruce`, `--spruce-700` | Brand anchor: hero, active navigation/segment states, primary buttons. |
| Cloudberry | `--cloudberry`, `--cloudberry-soft` | **Now / do this**: the current day, the primary in-context action, active accents. Used sparingly — its meaning depends on scarcity. |
| Glacier | `--glacier`, `--glacier-700`, `--glacier-soft` | **Cool / technical / spatial**: secondary actions, links, ready-state, GPS. |
| Danger | `--danger`, `--danger-soft` (+ off-route literals) | Warnings. Muted sienna, never alarm-red. |

## Semantic colour roles — success is not one colour

Positive states are deliberately **separate semantic roles**. One token must
not be reused for every positive state:

- `--good` — *generic success / completion*: packed items, ticked checks,
  meter fills, readiness ticks. A warm moss green that harmonises with the
  paper surfaces it always sits on.
- `--journey-complete` — *journey progress completed* (Today's day dots
  only). A spruce-hue green, because the journey row sits beside the spruce
  hero and reads as brand history, not as a checklist tick.
- Glacier-soft "Ready" — *prepared but not finished* (packing).
- Cloudberry — *current*, which is not a success state at all.
- On-route status text pills (`#46603f` on `#dfe9db`) — the **tint variant**
  of the success family for text-on-tint contexts; `--good` is its **fill
  variant**. They are siblings, not interchangeable.

When a new positive state appears, pick (or mint) the role that matches its
meaning — do not default to `--good`.

## Action versus metadata (the fill convention)

Established by the Today stage block (Stage Guide, View Route, highlight
chips) — the current exemplar:

- **Solid filled surfaces are actions.** Cloudberry = primary/in-context,
  glacier = secondary/spatial, spruce = anchor/primary in forms and nav.
- **Paper + line surfaces are calm controls** (standard buttons, map
  selector chips): tappable, but not shouting.
- **Quiet pills — translucent glass or `paper-2` with a hairline — are
  non-interactive metadata** (stage-highlight chips, stat pills, status
  pills). They get no hover, no pressed state, no pointer affordance.
- Interactive and non-interactive elements must not share a treatment that
  creates ambiguity. Icon, label wording, shape, focus-visible and pressed
  states should all reinforce interactivity, never colour alone.
- Exceptions require an explicit contextual reason recorded in a comment
  (current known exception: the Stages "Set as current" outline pill, whose
  verb label carries the affordance — deferred refinement D4).

Do not redesign existing components solely to force conformity; apply the
convention when a component is touched for a user-facing reason.

## Surfaces, spacing and shape

- **Spacing philosophy:** the app's rhythm is 16px screen/card padding,
  14px stacking gaps, 18px under screen headers, with purposeful micro-steps
  (3/4/6/8/10/12) inside components. There is no rigid 4-point grid;
  consolidate minor drift (odd 7px gaps, one-off values) **only when touching
  the relevant component for a user-facing reason** (Design Review #1, D7).
- **Shape hierarchy:** `--r-sm` (10px) workhorse buttons/inputs, `--r-md`
  (16px) cards, `--r-lg` (22px) hero/sheets, `999px` pills for chips and
  inline/floating controls, circles for journey dots. Rectangular = form
  workhorse; pill = inline control or metadata.
- **Typography:** system stack only (offline, no font flash); `tnum` on all
  numeric data; hierarchy = eyebrow (12/600/caps) → h1 (26/700) → card title
  (15–16.5/700) → body (14) → support (12.5–13.5) → micro-labels
  (≤11.5/700/caps). Prefer sizes already in use before adding new ones.
- **Iconography:** lucide, tree-shaken, offline. Stroke 1.8 for decorative
  and facility icons, 2–2.2 for UI emphasis; sizes cluster on 13/15/16/18.
  Icons support a text label; they do not replace it.

## Map palette — sanctioned exception (D8)

The Map may use an accessibility- and terrain-driven palette that is not
identical to the interface brand palette. Stage identity uses a
colour-blind-safe set (`STAGE_COLORS`, Okabe-Ito) because identifying seven
routes on muted terrain **requires** saturation the Nordic interface palette
deliberately avoids. Rules:

- map colours carry explicit semantic roles (stage identity, GPS, overview,
  breadcrumb trail — see `src/map/mapStyle.ts`);
- route legibility and field safety outrank visual sameness with cards and
  controls;
- the map stays *compatible* with the product identity through its terrain
  basemap and the paper UI around it — do not "brandify" the data colours,
  and do not let map data colours leak into interface controls.

## Accessibility constraints

- Text labels accompany icons; colour is never the only carrier of meaning.
- Non-interactive metadata carries non-interactive semantics (list items,
  no buttons/tabindex/roles).
- Focus-visible outlines on every interactive element (glacier-700 outline
  convention).
- Filled-control text: keep ≥ 4.5:1 where practical; the established
  white-on-cloudberry/glacier pairings (~3.3–3.6:1 at bold 13px) are under
  field observation (Design Review #1, D3) — do not add *new* pairings below
  4.5:1.
- Touch targets: ≥ 40px for primary actions, ≥ 44px preferred; never below
  ~34px effective.
- Long-press must not trigger native text selection outside editable fields.

## Anti-drift guidance

- New colours enter through `:root` tokens with a named role — no literals
  in component rules without a comment explaining the exception.
- Reuse the established scales (spacing steps, radii, type sizes, icon
  strokes) before inventing near-duplicates (no more half-pixel font sizes).
- The default browser link blue must never appear (global link rules +
  `tests/design-system.test.mjs` fence this).
- When a convention needs to change, change it through a Design Authority
  decision, not component by component.
