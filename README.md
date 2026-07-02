# Fjällkompis 🏔️

An offline-first, mobile-first **trail companion PWA** for a solo hut-to-hut hike
on the Kungsleden (Abisko → Nikkaluokta). Planning, daily overview, checklist,
route awareness, and journaling — all stored locally on your device.

> ⚠️ **Prototype. Not for primary navigation.** Route coordinates are
> approximate placeholders. Replace them with verified GPX before any real-world
> use, and always carry proper map, compass, and an offline navigation/safety
> device.

## Stack

- Vite + React 18 + TypeScript
- No backend, no auth — data persists in `localStorage`
- PWA via `vite-plugin-pwa` (Workbox): installable + works offline after first load
- Custom dependency-free SVG route map (no external tile providers)

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Build & preview the production PWA (service worker is only active in a build):

```bash
npm run build
npm run preview
```

Type-check only:

```bash
npm run typecheck
```

### Test offline / install
1. `npm run build && npm run preview`
2. Open the preview URL, then in Chrome DevTools → Application → Service Workers,
   confirm it’s activated. Toggle “Offline” and reload — the app still works.
3. On a phone, open the deployed URL and use “Add to Home Screen”.

## Deploy

- **GitHub Pages (automatic):** every push to `main` runs
  `.github/workflows/deploy.yml`, which builds and deploys `dist/` to
  https://algolon.github.io/Fjallkompis/. Requires Settings → Pages →
  Source: **GitHub Actions** (one-time setup).
- **Netlify:** build command `npm run build`, publish directory `dist` — but
  first change `base` in `vite.config.ts` from `/Fjallkompis/` to `/`.

## What’s real vs. placeholder

| Area | Status |
|---|---|
| App shell, 7 tabs, navigation | ✅ working |
| Today / Stages / Huts / Checklist / Journal / Settings | ✅ working, persisted |
| Export / import / reset (JSON) | ✅ working |
| Offline + installable PWA | ✅ working (after a build) |
| Geolocation + Haversine distance to next hut | ✅ working |
| **Route coordinates** | 🟡 approximate placeholders — replace with GPX |
| **Distances / times per stage** | 🟡 rough estimates |
| Map | 🟡 simplified SVG projection, no basemap/terrain |

## Project structure

```
fjallkompis/
├─ index.html
├─ vite.config.ts          # React + PWA (manifest, Workbox SW)
├─ tsconfig*.json
├─ public/icons/           # generated PWA icons + favicon
└─ src/
   ├─ main.tsx  App.tsx     # entry + tab shell
   ├─ constants.ts
   ├─ types/index.ts        # all domain types
   ├─ data/                 # seed data (huts, stages, checklist)
   ├─ utils/                # geo (Haversine + projection), format, storage, export
   ├─ store/AppStore.tsx    # context: persisted state + actions + selectors
   ├─ hooks/                # useGeolocation, useOnlineStatus
   ├─ components/           # TabBar, RouteMap, Icons, ui primitives
   └─ screens/              # one file per tab
```

## Design notes

Arctic-fjäll palette (glacier stone, spruce, cloudberry amber, glacial teal),
system fonts only (keeps it offline, no font flash), large touch targets, and
the SVG route map as the recurring signature element. Respects
`prefers-reduced-motion`.

## Next iteration

1. **Verified GPX import** — parse a real `.gpx`, derive waypoints + true stage
   distances, drop the placeholder coordinates.
2. **MapLibre GL + PMTiles** — a single offline basemap file (contours/terrain)
   served locally; no tile servers, no bulk OSM downloads.
3. **Elevation profile** — per-stage climb/descent from GPX elevation.
4. **Real route progress** — project your GPS onto the route polyline for
   “% of stage done” instead of straight-line distance.
5. **Installable-PWA polish** — custom install prompt, update toast on new
   service worker, richer offline states.
```
