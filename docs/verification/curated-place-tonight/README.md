# Curated off-route Place Tonight verification

Captures for the STF Kiruna curated-place Tonight card hotfix (branch
`fix/curated-place-tonight-metadata`), taken against the built production
candidate (`npm run build` + `vite preview`) in headless Chromium, state
seeded through the normal persisted-state and wallet IndexedDB paths.

Scenario: Day 8 of 9 shown on Today, personal Stay titled `STF Kiruna` with
`linkedPlaceId: 'stf-kiruna'` covering the night, STF membership marked for
Today and one linked ticket on a same-day Travel item.

- `kiruna-375x667.png` / `kiruna-320x667.png` — the Tonight row
- `kiruna-375x667-place.png` — after tapping the card: the STF Kiruna
  Journey Place open in Stops & places (navigated with `placeId`)
- `results.json` — measured values (title/metadata rectangles, icon count,
  overflow, overlap, quick-action rectangles, scroll-container heights)
