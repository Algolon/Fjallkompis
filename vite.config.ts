import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// NOTE: `base` matches the GitHub Pages project subpath
// (https://algolon.github.io/Fjallkompis/). If you later move to Netlify or a
// custom domain served from the root, change this to '/'.
export default defineConfig({
  base: '/Fjallkompis/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Fjällkompis — Kungsleden trail companion',
        short_name: 'Fjällkompis',
        description:
          'Offline-first hut-to-hut trail companion for the Kungsleden. Prototype — not for primary navigation.',
        lang: 'en',
        theme_color: '#2f4a3e',
        background_color: '#e9edeb',
        display: 'standalone',
        orientation: 'portrait',
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
            urlPattern: /\.pmtiles$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fjallkompis-offline-map-v1',
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
