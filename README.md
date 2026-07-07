# Fjällkompis 🏔️

**Your offline trail companion for the Kungsleden (Abisko → Nikkaluokta).**

**▶ Open the app: https://algolon.github.io/Fjallkompis/**

Fjällkompis ("mountain buddy") is a free web app for the classic hut-to-hut
week on Sweden's Kungsleden. It puts the whole trip in your pocket — the
route on an offline map, day stages with elevation profiles, a guide to every
hut and stop, daily and packing checklists — and it keeps working when the
signal disappears, which on the Kungsleden is most of the time.

> ⚠️ **Beta, and not for primary navigation.** Fjällkompis is a companion,
> not a safety device. Always carry a paper map, a compass, and know how to
> use them. GPS positions and route matching are approximate.

## What you can do with it

- **Map** — the full 105 km route and its seven day-stages on an offline
  map, with hut markers, elevation profiles, and your GPS position projected
  onto the trail: kilometres done, kilometres to the next hut, percent of
  today's stage.
- **Live tracking (beta)** — optionally follow yourself along today's stage
  while you walk: a moving position marker, live progress, and a qualified
  "you may be off route" warning if you drift away from the trail. Explicit
  start/stop, foreground-only, and nothing is recorded or uploaded.
- **Today** — one screen for the day: current stage, distance, elevation,
  progress and your daily routine checklist.
- **Stages** — the seven days at a glance, with distances, ascent/descent
  and notes; set which day you're on and everything else follows.
- **Stops** — a curated guide to all eight huts and stations (shops, saunas,
  opening periods, beds), verified against the official STF/Nikkaluokta
  information, plus space for your own notes.
- **Lists** — a hiking-specific packing list and daily checklist you can
  adapt to your own gear.
- **Settings** — offline map downloads, backup/restore of all your data,
  sources and credits.

Everything you enter stays on your phone. No account, no server, no
tracking — the app doesn't even have a backend.

## Getting started (5 minutes, at home on Wi-Fi)

1. **Open** https://algolon.github.io/Fjallkompis/ in Chrome (Android) or
   Safari (iPhone).
2. **Install it**: use the *Install app* card in Settings, or your browser's
   *Add to Home Screen*. It then opens full-screen like a normal app.
3. **Download the offline map**: Settings → *Offline map* → Download
   (~4 MB). Optionally add the satellite imagery (~42 MB) for a second map
   layer.
4. **Set your stage**: on the Stages tab, mark the day you're walking with
   *Set as current*.
5. **Check it works offline**: enable airplane mode and reopen the app — the
   map, route and all your lists should still be there.

## Best practices on the trail

- **Do the downloads at home.** Map, satellite imagery and the app update
  itself all need a connection; huts mostly don't have one.
- **Live tracking costs battery.** It keeps high-accuracy GPS running while
  the Map tab is open. Start it when you want it, stop it when you don't,
  and expect it to pause when the screen locks (that's by design — no
  background tracking).
- **Treat positions as approximate.** GPS in valleys and bad weather can be
  off by tens of metres; the app says so rather than pretending otherwise —
  an "uncertain" or "off route" message is a prompt to check the map and
  your surroundings, not a verdict.
- **Back up before and after the trip**: Settings → *Export all data* saves
  your notes, lists and progress to a file.
- **Battery discipline beats everything**: flight mode + screen mostly off
  is the difference between a phone that lasts a week of huts and one that
  dies on day two.

## Beta testers wanted 🎒

Fjällkompis is in beta and improves through real use — on the Kungsleden or
anywhere you want to try the Map tab. If something is confusing, wrong, or
just missing: **Settings → Feedback** in the app, or open an issue directly
via [Beta feedback](https://github.com/Algolon/Fjallkompis/issues/new?template=beta-feedback.yml)
(free GitHub account required). Please never include exact GPS coordinates
in public feedback.

## For developers

Vite + React + TypeScript PWA, MapLibre GL with offline PMTiles, a verified
GPX route pipeline, and no backend. All technical documentation — data
pipelines, offline architecture, map builds, testing, versioning and
deployment — lives in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Priorities: [ROADMAP.md](ROADMAP.md) · changes: [CHANGELOG.md](CHANGELOG.md).

Map data © OpenStreetMap contributors · Protomaps. Satellite imagery:
Sentinel-2 cloudless by EOX. Full credits in the app under
Settings → *Data sources & credits*.
