# Trail Cockpit, step 1 — viewport workspace: measured evidence

Captured headlessly (Chrome for Testing, deviceScaleFactor 2) against the dev
server at `#/map`, default state, after the map style settled. `main overflow`
is `main.scrollHeight − main.clientHeight` — the shell's only scroll region.
Screenshots in this folder are the same runs, downscaled to logical size.

| Viewport | Map before | Map after | main overflow before | after | map share of `main` | primary nav | native fullscreen control |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | 286×460 | 320×286.7 | 583 px | **0 px** | 89.8% → 56% | bar, visible | 1 → 0 |
| 375×667 | 341×460 | 375×342.2 | 451 px | **0 px** | 75.3% → 56% | bar, visible | 1 → 0 |
| 390×844 | 356×501.2 | 390×448 | 315 px | **0 px** | 63.6% → 56.9% | bar, visible | 1 → 0 |
| 430×932 | 396×544.4 | 430×536 | 199 px | **0 px** | 62.1% → 61.2% | bar, visible | 1 → 0 |
| 760×500 | 626×460 | 676×280 | 472 px | **0 px** | 92% → 56% | rail, visible | 1 → 0 |
| 768×1024 | 634×560 | 684×684 | 48 px | **0 px** | 54.7% → 66.8% | rail, visible | 1 → 0 |
| 1024×768 | 517×517 | 600×768 | 14 px | **0 px** | 67.3% → 100% | rail, visible | 1 → 0 |
| 1280×800 | 549×549 | 792×800 | 14 px | **0 px** | 68.6% → 100% | rail, visible | 1 → 0 |

Document scrolling was 0 px before and after (the shell has always been
bounded); the regression this step fixes is `<main>`, which scrolled on
**every** supported viewport — up to 583 px on the smallest phone, i.e. more
than the map's own height was hidden below the fold.

Zero console errors at every viewport, before and after.

## How to read the "map share" column

`.mapview` height ÷ `main` height. On compact viewports the map now fills
everything the temporary control dock leaves (the dock is capped at
`min(44%, 340px)` and scrolls internally), which is why the share reads ~56%
while the *workspace* is 100% of `main`. The dock is step-1 placement only:
step 2 replaces it with the scope pill, the map control stack and a compact
status dock, and the map's visible share grows accordingly.

On landscape tablet/desktop the map already reaches 100% of `main` — the map
is the full-height surface and the dock is a fixed 340 px column beside it.

## Interaction checks (dev server, 375×812)

- stage chip → `aria-pressed` moves to Day 3, `Full route` clears, camera fits
  the stage (screenshot in this folder's step-1 set);
- hut marker → anchored stop preview opens with facilities;
- Escape → preview closes;
- dock scrolls internally; the shell does not move.
