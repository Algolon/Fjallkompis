import { createReadStream, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// package.json is the single source of truth for the app version; it is
// injected at build time as the __APP_VERSION__ global (declared in
// src/vite-env.d.ts, re-exported as APP_VERSION from src/constants.ts).
// scripts/check-version-consistency.mjs guards this wiring in CI.
import pkg from './package.json';
// Archive identities come from the canonical catalog, never from literals
// here: the service worker's range-request caches and the app's own caches
// MUST be the same caches, and a hardcoded name is how they stop being.
import {
  MAP_ASSETS,
  OPTIONAL_MAP_ASSETS,
  mapAssetPath,
} from './src/map/mapCatalog.mjs';

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
 * Keeps the OPTIONAL map archives out of the Android app package.
 *
 * They live in `public/maps/` whenever anyone has run the deploy fetch (or
 * `npm run generate:map:*`) on this machine, and Vite copies `public/`
 * wholesale into `dist`. Nothing used to notice, so a native build made on
 * such a machine would quietly add ~90 MB of terrain, contour and satellite
 * data to the AAB — an app that is six times larger for no product decision,
 * shipped by accident. The archives are meant to be optional downloads on
 * Android exactly as they are on the web (src/map/nativeArchiveStore.ts).
 *
 * `closeBundle` rather than `generateBundle`: public-directory files are
 * copied outside the bundle graph, so they are only on disk by the end.
 * scripts/verify-native-build.mjs asserts the result independently, and both
 * Android workflows assert it again against the packaged artifact — this hook
 * is the fix, not the proof.
 */
function stripOptionalMapArchives(): Plugin {
  return {
    name: 'fjallkompis:strip-optional-map-archives',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist', 'maps');
      for (const id of OPTIONAL_MAP_ASSETS) {
        const file = join(outDir, MAP_ASSETS[id].file);
        if (existsSync(file)) {
          rmSync(file);
          this.warn(`native build: removed optional map archive ${MAP_ASSETS[id].file}`);
        }
      }
    },
  };
}

/**
 * The web-build counterpart: keeps NATIVE-ONLY optional archives out of the
 * Pages artifact. The Satellite HD shards (~2.1 GB together) live in
 * `public/maps/` on any machine that has run the HD extraction; a Pages
 * artifact that swallowed them would blow GitHub Pages' ~1 GB published-site
 * cap. Deployment's `map-archives.mjs verify` asserts their absence again —
 * this hook is the fix, that check is the proof.
 */
function stripNativeOnlyMapArchives(): Plugin {
  return {
    name: 'fjallkompis:strip-native-only-map-archives',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist', 'maps');
      for (const id of OPTIONAL_MAP_ASSETS) {
        const asset = MAP_ASSETS[id];
        if (asset.platforms.web) continue;
        const file = join(outDir, asset.file);
        if (existsSync(file)) {
          rmSync(file);
          this.warn(`web build: removed native-only map archive ${asset.file}`);
        }
      }
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

/**
 * Ships pdf.js' auxiliary decode assets INSIDE the app, on both targets.
 *
 * The in-app PDF viewer (src/pdf/pdfEngine.ts) renders Wallet documents with
 * pdfjs-dist; the library and its worker are ordinary lazy chunks, but three
 * asset families are fetched by pdf.js ON DEMAND per document: the wasm image
 * codecs (JPEG 2000 / JBIG2 / colour management), the ICC profiles, and the
 * 14 standard Type1 fonts a PDF may reference without embedding. They must be
 * same-origin static files — a CDN would break the app's offline-first
 * guarantee and leak that a user opened a document. So they are copied from
 * the SAME npm package the code comes from (version lockstep for free) into
 * `pdfjs/` in the bundle, and the dev server serves them from node_modules.
 *
 * Deliberately NOT shipped: the CJK cMaps (~1.7 MB for character encodings a
 * Kungsleden ticket wallet is very unlikely to meet — such a PDF still opens,
 * with its CJK-encoded text missing and a console warning) and the quickjs
 * sandbox (embedded-JavaScript execution, which the viewer never enables).
 */
function pdfjsAuxAssets(): Plugin {
  const families = ['wasm', 'iccs', 'standard_fonts'] as const;
  const packageRoot = resolve(process.cwd(), 'node_modules', 'pdfjs-dist');
  const excluded = (name: string) => name.startsWith('quickjs-');
  return {
    name: 'fjallkompis:pdfjs-aux-assets',
    generateBundle() {
      for (const family of families) {
        for (const name of readdirSync(join(packageRoot, family))) {
          if (excluded(name)) continue;
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${family}/${name}`,
            source: readFileSync(join(packageRoot, family, name)),
          });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/pdfjs\/(wasm|iccs|standard_fonts)\/([\w.-]+)$/);
        if (!match || excluded(match[2])) return next();
        const file = join(packageRoot, match[1], match[2]);
        if (!existsSync(file)) return next();
        res.setHeader(
          'Content-Type',
          match[2].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        );
        createReadStream(file).pipe(res);
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
    pdfjsAuxAssets(),
    ...(mode === 'native'
      ? [inertPwaRegister(), nativeBuildMarker(), stripOptionalMapArchives()]
      : [stripNativeOnlyMapArchives()]),
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
        //
        // mjs/wasm/pfb/icc: the in-app PDF viewer. The pdf.js worker ships as
        // an .mjs asset, and the on-demand decode assets under pdfjs/ (wasm
        // codecs, standard fonts, ICC profiles) must be in the precache or a
        // stored ticket could fail to render exactly where it matters — on a
        // trail with no signal.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2,webp,wasm,pfb,ttf,icc}'],
        navigateFallback: 'index.html',
        // The public privacy policy (public/privacy/index.html) is a STATIC
        // page that must not be shadowed by the React app shell. Without this,
        // every navigation is a candidate for the SPA fallback, and a reader
        // — or a Play reviewer — following the canonical privacy URL on a
        // device with the worker installed could be handed the app instead of
        // the policy. The route is denied by path only (no '/Fjallkompis/'
        // prefix) so it holds under any base the app is ever served from.
        // The page is still PRECACHED by globPatterns above, so it stays
        // readable offline.
        navigateFallbackDenylist: [/\/privacy\//],
        cleanupOutdatedCaches: true,
        // maplibre-gl makes the main chunk larger than Workbox's 2 MiB
        // default precache limit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Serve PMTiles byte-range requests from the user-downloaded FULL
        // response in each archive's own cache (RangeRequestsPlugin slices
        // it). Every cache name is READ FROM THE CATALOG, so a route here and
        // the app's own reads cannot name different caches — which they did
        // when these three were typed out by hand.
        // cacheableResponse statuses [200] ensures a network 206 partial is
        // never cached; caching individual range responses would NOT work
        // offline.
        //
        // Superseded caches are deliberately NOT wired up: Workbox picks the
        // first matching route, so one URL can only be served from one cache,
        // and a legacy archive must never look current. Legacy fallback runs
        // through the blob-backed PMTiles source instead
        // (src/map/pmtilesProtocol.ts), which is the primary offline read path
        // anyway — so a device still on the old archive keeps a working map,
        // while a plain fetch reaches the network for the current bytes.
        //
        // SATELLITE IS EXCLUDED, on purpose. It is same-origin too, but it is
        // read from its own Cache Storage blob rather than through the worker;
        // a route here would pull the whole ~59 MB file through the SW into
        // the wrong cache the first time anyone previewed Satellite online.
        runtimeCaching: (['vector', 'terrain', 'contours'] as const).map((id) => {
          const asset = MAP_ASSETS[id];
          const suffix = `/${mapAssetPath(asset)}`;
          return {
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin && request.url.endsWith(suffix),
            handler: 'CacheFirst' as const,
            options: {
              cacheName: asset.cacheName,
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          };
        }),
      },
      devOptions: {
        // Let you test PWA/offline behaviour in `npm run dev`.
        enabled: false,
      },
    })]),
  ],
}));
