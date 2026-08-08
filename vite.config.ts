import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// package.json is the single source of truth for the app version; it is
// injected at build time as the __APP_VERSION__ global (declared in
// src/vite-env.d.ts, re-exported as APP_VERSION from src/constants.ts).
// scripts/check-version-consistency.mjs guards this wiring in CI.
import pkg from './package.json';
// The vector basemap's CURRENT archive revision owns its cache name. Imported
// rather than repeated so the service worker's range-request cache and the app
// can never drift onto different caches (see src/map/archiveRevision.mjs).
import { VECTOR_ARCHIVE_CACHE } from './src/map/archiveRevision.mjs';

/**
 * TWO BUILD TARGETS, ONE APPLICATION.
 *
 *   vite build                 → the GitHub Pages / PWA build (default mode).
 *   vite build --mode native   → the Capacitor Android WebView build.
 *
 * They differ in exactly two ways, and nothing else:
 *
 *   1. BASE PATH. Pages serves the app from the project subpath
 *      /Fjallkompis/; the Capacitor WebView serves it from the ROOT of
 *      https://localhost, always — Capacitor has no notion of a path prefix.
 *      '/' is therefore the correct native base, and it is also the only
 *      SAFE one.
 *
 *      A relative './' base was tried first and rejected on evidence: the
 *      three contour backdrops (Today, Guide, Plan) 404'd at
 *      /assets/images/…/contours.svg. Those screens pass their URL through a
 *      CSS CUSTOM PROPERTY (`--screen-bg-image: url("…")`), and a relative
 *      url() inside a custom property is resolved against the stylesheet
 *      where the var() is substituted — global.css, which ships as
 *      /assets/index-*.css — not against the document. A root-absolute base
 *      is immune to that whole class of resolution surprise, which also
 *      covers `new URL(x, import.meta.url)` and any future CSS-side asset.
 *
 *      With '/', src/map/offlineMap.ts's
 *      `new URL(BASE_URL + path, location.origin)` yields
 *      https://localhost/maps/… , and the PMTiles archives, contour
 *      backdrops and STF roundel all resolve with no app-code change.
 *
 *   2. SERVICE WORKER. The native shell must have NONE. A worker inside the
 *      WebView would add a second, invisible cache layer in front of assets
 *      the APK already ships, and its update prompt is meaningless when the
 *      app updates through the Play Store / an APK install. So the native
 *      build drops VitePWA entirely and resolves the plugin's virtual
 *      registration module to an inert stub, which is what guarantees that
 *      no `registerSW`/`navigator.serviceWorker.register` call can reach the
 *      native bundle at all. PwaLifecycle is additionally not mounted at
 *      runtime (see src/App.tsx) — belt and braces, deliberately.
 *
 * Everything else — React screens, trail content, stores, business rules,
 * the manifest and theme colours of the web build — is untouched and shared.
 * scripts/verify-native-build.mjs enforces 1 and 2 against the real output.
 */

/** The virtual module vite-plugin-pwa provides; absent from the native build. */
const PWA_REGISTER_ID = 'virtual:pwa-register/react';

/**
 * Native-build stand-in for `virtual:pwa-register/react`.
 *
 * src/components/PwaLifecycle.tsx imports that module statically, and the
 * native build has no VitePWA plugin to provide it. Rather than fork the
 * component (it stays the single web/PWA lifecycle implementation), the
 * native build resolves the specifier to this inert shape: the hook returns
 * permanently-false flags and a no-op updater, so even if the component were
 * mounted it would register nothing and render nothing.
 */
function inertPwaRegister(): Plugin {
  const resolved = `\0${PWA_REGISTER_ID}`;
  return {
    name: 'fjallkompis:inert-pwa-register',
    enforce: 'pre',
    resolveId(id) {
      return id === PWA_REGISTER_ID ? resolved : null;
    },
    load(id) {
      if (id !== resolved) return null;
      return `export function useRegisterSW() {
  return {
    offlineReady: [false, () => {}],
    needRefresh: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
export function registerSW() {
  return async () => {};
}
`;
    },
  };
}

/**
 * Stamps the native build's output so the wrong bundle can never be synced.
 *
 * Both targets write to the SAME `dist` directory (Capacitor's webDir), so
 * whichever build ran last wins. Syncing a Pages build into the APK would
 * produce an app that looks correct at build time and then fails on the
 * device — every asset 404s under /Fjallkompis/ and a service worker tries
 * to register. scripts/assert-native-build.mjs refuses to sync unless this
 * marker is present, so that mistake fails loudly at the desk instead of
 * quietly in Omar's hand.
 */
function nativeBuildMarker(): Plugin {
  return {
    name: 'fjallkompis:native-build-marker',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '.native-build',
        source: `${pkg.version}\n`,
      });
    },
  };
}

// NOTE: the web `base` matches the GitHub Pages project subpath
// (https://algolon.github.io/Fjallkompis/). If you later move to Netlify or a
// custom domain served from the root, change this to '/'.
export default defineConfig(({ mode }) => ({
  base: mode === 'native' ? '/' : '/Fjallkompis/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    ...(mode === 'native' ? [inertPwaRegister(), nativeBuildMarker()] : []),
    ...(mode === 'native' ? [] : [VitePWA({
      // Prompt-style updates: a new service worker waits until the user taps
      // "Update now" in the in-app toast, so we never reload out from under an
      // unsaved change (see src/components/PwaLifecycle.tsx). Registration is
      // handled explicitly in React via virtual:pwa-register/react, so the
      // plugin must NOT also inject its own registration script.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Fjallkompis — Kungsleden hiking companion',
        short_name: 'Fjallkompis',
        description:
          'An offline hiking companion for the Kungsleden, bringing route, stage, hut and packing information together alongside your navigation tools.',
        lang: 'en',
        // Keep installed-PWA brand chrome spruce. The manifest has no
        // independent Android navigation-bar colour member, so the OS-owned
        // bottom bar is intentionally not conflated with this theme colour.
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
            // slices it). The cache name comes from the archive-revision
            // contract, so it is the CURRENT revision's cache and nothing
            // else. cacheableResponse statuses [200] ensures a network 206
            // partial is never cached — caching individual range responses
            // would NOT work offline.
            //
            // A superseded cache is deliberately NOT wired up here: Workbox
            // picks the first matching route, so one URL can only be served
            // from one cache, and a legacy archive must never look current.
            // Legacy fallback runs through the blob-backed PMTiles source
            // instead (src/map/pmtilesProtocol.ts), which is the primary
            // offline read path anyway — so a device still on the old
            // archive keeps a working map, while a plain fetch reaches the
            // network for the current bytes rather than stale ranges.
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
              cacheName: VECTOR_ARCHIVE_CACHE,
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
    })]),
  ],
}));
