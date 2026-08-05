# Tonight-card verification artifacts

Browser-verification captures and measurements for the Tonight metadata
hierarchy hotfix (branch `claude/tonight-card-metadata-layout-ycsnl6`).

All captures were taken against the **built production candidate**
(`npm run build` + `vite preview`) in headless Chromium, with app state
seeded through the normal persisted-state (`fjallkompis:state`) and wallet
IndexedDB paths — no component mocking.

- `before-*.png` — main @ `ba92a1d` (merge of PR #89)
- `after-*.png` — this branch
- `before-results.json` / `after-results.json` — the measured values per
  scenario: viewport, horizontal overflow, Tonight card / title /
  metadata-row bounding rectangles, facility icon count, quick-action
  rectangles, overlap check and the scroll-container
  `scrollHeight`/`clientHeight` pair.

> **Captures withdrawn 2026-08-05.** Every capture in which the membership
> quick access is on screen (scenarios A, B, B2, B3 and E) showed the STF
> roundel, which this repository has no licence to redistribute. Those PNGs
> were deleted; the D1 and D3 captures and **all** measured values in the
> two `results.json` files are untouched, so the numbers this verification
> actually turned on remain complete. The membership button no longer uses
> that mark — see `fix: remove unlicensed placeholder imagery`.

Scenario key:

| Key | Scenario |
| --- | --- |
| A   | Travel day, dated linked STF Abisko Stay, membership + ticket quick actions |
| B   | Hiking day ending at STF Abiskojaure, explicit canonical Stop overnight, membership quick action |
| B2  | Hiking day, dated **unlinked** personal Stay titled "STF Abiskojaure" (reproduces the user-observed bare card) |
| B3  | Hiking day, dated personal Stay **linked** to `abiskojaure` |
| D1  | STF Tjäktja ("No shop" absence treatment) |
| D3  | Nikkaluokta (village — no STF prefix) |
| E   | Generic off-route personal Stay (plain Stay card, no invented metadata) |
