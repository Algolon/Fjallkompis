# Fjällkompis 🏔️

**Your offline hiking companion for the Kungsleden (Abisko → Nikkaluokta).**

**▶ Open Fjällkompis: https://algolon.github.io/Fjallkompis/**

Fjällkompis ("mountain buddy") is a free offline hiking companion for the
classic hut-to-hut week on Sweden's Kungsleden. It complements your maps and
navigation tools by bringing the trail information hikers use most into one
place: the route on an offline map, day stages with elevation profiles and a
compact guide to each day, a guide to every hut and stop, and a packing list.
It keeps working when the signal disappears, which on the Kungsleden is most
of the time.

The same link works in the browser on your **phone, tablet and computer**:
plan at a desk with a big map and roomy lists, then carry the same companion on
your phone while hiking. On phones Fjällkompis is portrait-only (it will ask
you to rotate back); tablets work in portrait and landscape. Installing it as
a PWA is optional on every device. Your personal data (lists, notes and
progress) lives locally in each browser — opening the link on a second device
starts empty; use Settings → Export/Import to move your data across (see below).

> ⚠️ **Beta hiking companion.** Fjällkompis is designed to complement — not
> replace — appropriate maps, a compass and sound outdoor judgement. Always
> carry suitable navigation tools and know how to use them. GPS positions and
> route matching are approximate.

## What you can do with it

- **Map** — the full 105 km route and its seven day-stages on an offline
  topographic map, with hut markers, elevation profiles, and your GPS position
  projected onto the trail: kilometres done, kilometres to the next hut and
  percent of today's stage.
- **Live tracking (beta)** — optionally follow yourself along today's stage
  while you walk: a moving position marker, live progress, and a qualified
  "you may be off route" warning if you drift away from the trail. Explicit
  start/stop, foreground-only, and nothing is recorded or uploaded.
- **Today** — one screen for the day: current stage, distance, elevation,
  journey progress and tonight's stop.
- **Stages** — the seven days at a glance, with GPX-derived distances and
  ascent/descent plus an expandable day guide per stage (what to expect,
  trail character, highlights, things to plan for — researched against
  official sources, with hedged wording because conditions vary); set which
  day you're on and everything else follows.
- **Stops** — a curated guide to all eight huts and stations (shops, saunas,
  opening periods, beds), verified against the official STF/Nikkaluokta
  information, plus space for your own notes.
- **Lists** — a hiking-specific packing list you can adapt to your own gear,
  plus offline **Shop info** (where you can resupply, and the STF cabin-shop
  assortments with 2025 reference prices) and **Transport** (the buses, boats
  and train for this route as static 2026 planning snapshots, with
  expired-timetable warnings — never live status).
- **Settings** — trail-readiness checks, offline map downloads, feedback,
  backup/restore of your data, sources and credits.

Everything you enter stays on your phone. No account, no server, no tracking —
Fjällkompis does not have a backend.

## Getting started (5 minutes, at home on Wi-Fi)

1. **Open** https://algolon.github.io/Fjallkompis/ — Chrome (Android),
   Safari (iPhone/iPad), or any modern browser on a tablet or computer.
2. **Optionally install it**: use the *Install* section in Settings, or your
   browser's *Add to Home Screen* / *Install*. It then opens full-screen like a
   native app. Fjällkompis also works in a regular browser tab.
3. **Download the offline map**: Settings → *Offline maps* → Download
   (~5.3 MB). Optionally add Terrain relief (~25 MB) for hillshade and
   contours, and Satellite imagery (~59 MB) for a second map layer.
4. **Set your stage**: on the Stages tab, mark the day you're walking with
   *Set as current*.
5. **Check it works offline**: enable airplane mode and reopen Fjällkompis —
   the map, route and all your lists should still be there.

## Best practices on the trail

- **Do the downloads at home.** Map, satellite imagery and updates all need a
  connection; huts mostly don't have one.
- **Live tracking costs battery.** It keeps high-accuracy GPS running while
  the Map tab is open. Start it when you want it, stop it when you don't,
  and expect it to pause when the screen locks (that's by design — no
  background tracking).
- **Treat positions as approximate.** GPS in valleys and bad weather can be
  off by tens of metres; Fjällkompis says so rather than pretending otherwise
  — an "uncertain" or "off route" message is a prompt to check your map,
  navigation tools and surroundings, not a verdict.
- **Back up before and after the trip**: Settings → *Export all data* saves
  your notes, lists and progress to a file. The same file moves your data
  to another device: export on one, import on the other. Opening Fjällkompis
  on a new device never copies data by itself — there is no account and
  nothing is synced — and offline maps are downloaded per device.
- **Battery discipline beats everything**: flight mode + screen mostly off
  is the difference between a phone that lasts a week of huts and one that
  dies on day two.

## Beta testers wanted 🎒

Fjällkompis is still under active development and improves through real use —
on the Kungsleden or anywhere you want to test its offline hiking workflow. If
something is confusing, wrong or missing, use **Settings → Beta testing** in
Fjällkompis, or open an issue directly through
[Beta feedback](https://github.com/Algolon/Fjallkompis/issues/new?template=beta-feedback.yml)
(free GitHub account required). Please never include exact GPS coordinates in
public feedback.

## For developers

Vite + React + TypeScript PWA, MapLibre GL with offline PMTiles, a verified GPX
route pipeline, and no backend. All technical documentation — data pipelines,
offline architecture, map builds, testing, versioning and deployment — lives
in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Priorities:
[ROADMAP.md](ROADMAP.md) · changes: [CHANGELOG.md](CHANGELOG.md).

Map data © OpenStreetMap contributors · Protomaps. Satellite imagery:
Sentinel-2 cloudless by EOX. Full credits in Fjällkompis under Settings →
*Data sources*.