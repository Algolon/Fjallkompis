import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// package.json is the single source of truth for the app version; it is
// injected at build time as the __APP_VERSION__ global (declared in
// src/vite-env.d.ts, re-exported as APP_VERSION from src/constants.ts).
// scripts/check-version-consistency.mjs guards this wiring in CI.
import pkg from './package.json';

// NOTE: `base` matches the GitHub Pages project subpath
// (https://algolon.github.io/Fjallkompis/). If you later move to Netlify or a
// custom domain served from the root, change this to '/'.
export default defineConfig({
  base: '/Fjallkompis/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // Prompt-style updates: a new service worker waits until the user taps
      // "Update now" in the in-app toast, so we never reload out from under an
      // unsaved change (see src/components/PwaLifecycle.tsx). Registration is
      // handled explicitly in React via virtual:pwa-register/react, so the
      // plugin must NOT also inject its own registration script.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Fjällkompis — Kungsleden trail companion',
        short_name: 'Fjällkompis',
        description:
          'Offline-first hut-to-hut trail companion for the Kungsleden. Prototype — not for primary navigation.',
        lang: 'en',
        theme_color: '#2f4a3d',
        background_color: '#dce4d8',
        display: 'standalone',
        // 'any' is DELIBERATE, not an oversight: this one static manifest
        // serves every device class, and its orientation member applies to
        // the whole app — 'portrait' here would also lock installed TABLET
        // PWAs out of landscape. Phones are portrait-only by product
        // decision, enforced at runtime instead: the RotateGuard overlay
        // (canonical) plus a best-effort screen.orientation.lock() for
        // installed phone PWAs. See src/utils/orientationGuard.mjs.
        orientation: 'any',
        // Scope/start_url pinned to the GitHub Pages project subpath (base).
        scope: '/Fjallkompis/',
        start_url: '/Fjallkompis/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built app shell + assets (incl. the generated route
        // JSON, which is bundled into the JS) so the app works fully offline
        // after the first successful load. The .pmtiles basemap and the raw
        // .gpx are deliberately NOT precached: the map is an explicit
        // download managed in Settings (separate cache), and the GPX is
        // already baked into the bundle as JSON.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webp}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // maplibre-gl makes the main chunk larger than Workbox's 2 MiB
        // default precache limit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Serve PMTiles byte-range requests from the user-downloaded
            // FULL response in the offline-map cache (RangeRequestsPlugin
            // slices it). Cache name must match OFFLINE_MAP_CACHE in
            // src/map/offlineMap.ts. cacheableResponse statuses [200]
            // ensures a network 206 partial is never cached — caching
            // individual range responses would NOT work offline.
            //
            // Scoped to the VECTOR basemap only. The satellite archive is
            // also same-origin (deploy.yml injects the verified Release asset
            // into dist/maps, so Pages serves it from the app's own origin),
            // but it is read from its own Cache Storage blob (not via the
            // SW), so this rule must not intercept it — otherwise online
            // satellite streaming would pull the whole 42 MB file through
            // the SW into the wrong cache.
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin && request.url.endsWith('/maps/kungsleden.pmtiles'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fjallkompis-offline-map-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Terrain relief, same mechanism as the vector basemap: byte
            // ranges served from the user-downloaded FULL response. Cache
            // names must match TERRAIN_ARCHIVE / CONTOURS_ARCHIVE in
            // src/map/offlineMap.ts.
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin && request.url.endsWith('/maps/kungsleden-terrain.pmtiles'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fjallkompis-offline-terrain-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin && request.url.endsWith('/maps/kungsleden-contours.pmtiles'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fjallkompis-offline-contours-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Let you test PWA/offline behaviour in `npm run dev`.
        enabled: false,
      },
    }),
  ],
});
