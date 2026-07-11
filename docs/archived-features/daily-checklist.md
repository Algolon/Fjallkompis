# Archived feature: Daily checklist

**Status: archived** (removed from the active product, recoverable from Git
history). Archived ≠ temporarily hidden: no dormant checklist code, store API
or data ships in the app, and nothing re-enables it with a flag. Restoring it
is a fresh product/design decision, not a revert.

## What it did

A per-day routine checklist of ~16 fixed items in five categories (Morning,
On Trail, Evening, Safety, Food & Water). Users ticked items during the day
and reset the list manually each morning (deliberately no auto-reset). Ticks
persisted locally as an `itemId → boolean` map (`checklist`) in the single
localStorage blob.

## Where it appeared

- **Lists** — a Daily/Packing segmented control; the Daily view had category
  cards, per-category counts, an overall progress meter and a reset button.
- **Today** — a "Daily list" navigation card with an n/total count and a
  progress bar, deep-linking to Lists in daily mode.
- **Settings** — copy referencing checklist contents (diagnostics exclusions,
  reset-all confirmation).
- **Store/state** — `toggleChecklistItem`, `resetDailyChecklist`,
  `checklistCheckedCount`, `checklistTotal`, `checklistPercent` on the app
  store; `checklist` in `PersistentState` (schema v2); seed data in
  `src/data/checklist.ts`.

## Why it was removed

The fixed, generic routine list saw no meaningful iteration since the
prototype and diluted the product's route-specific focus (see ROADMAP product
identity). Its Today card competed for space with genuinely stage-specific
information, and the roadmap's "custom list portability and templates" idea
is a better future home for user-defined recurring lists than a hard-coded
one. Removed in the same release that made Stages a day-by-day trail guide,
which is where the "what does today look like" value now lives.

## When and how it was archived

- **Release:** 0.18.0 (2026-07-11), archived in
  [PR #44](https://github.com/Algolon/Fjallkompis/pull/44).
- **Last commit with the feature intact:** `d1278e8` (main, 2026-07-11) —
  recover the implementation from there.
- **Key historical files:** `src/data/checklist.ts` (seed data),
  `src/screens/ListsScreen.tsx` (DailyView), `src/screens/TodayScreen.tsx`
  (Daily list card), `src/store/AppStore.tsx` (checklist actions/selectors),
  `src/types/index.ts` (Checklist* types, `PersistentState.checklist`),
  `src/utils/stateMigration.mjs` (schema v2 with `checklist`).

## Persisted user data

Schema v3 (`src/utils/stateMigration.mjs`) drops the `checklist` map during
normalisation. Old v1/v2 payloads — localStorage or import files — still load,
migrate and save without errors; only the checklist ticks are discarded. All
other personal data (current stage, packing, stop notes, journal) is
preserved, covered by `tests/state-migration.test.mjs` and
`tests/device-transfer.test.mjs`.

## Do not restore casually

If a daily-routine capability is wanted again, treat it as a new feature:
re-decide scope (fixed seed list vs user-defined templates — see the roadmap's
list-portability item), re-design its place on Today/Lists, and bump the
persisted schema again rather than resurrecting the v2 `checklist` map.
