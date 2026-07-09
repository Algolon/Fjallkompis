/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * App version injected at build time from package.json (see the `define`
 * block in vite.config.ts). Never hard-code a version literal elsewhere —
 * scripts/check-version-consistency.mjs fails the build if one appears.
 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Optional build-time override for the satellite archive URL, for
   * alternative hosting (the host must send CORS headers and support Range
   * requests). Production does not need it: deploy.yml injects the verified
   * GitHub Release asset into the Pages build, so the archive is served
   * same-origin from maps/. See src/map/offlineMap.ts.
   */
  readonly VITE_SATELLITE_URL?: string;
  /**
   * Optional Thunderforest Map Tiles API key for the ONLINE-ONLY
   * "Thunderforest Outdoors" comparison basemap (never offline, never the
   * default). Absent → the option is unavailable and no Thunderforest
   * request is made. Local dev: .env.local (git-ignored); production: the
   * VITE_THUNDERFOREST_API_KEY repository secret injected by deploy.yml.
   * NOTE: build-time injection does not keep the key secret at runtime —
   * the built app exposes it in tile-request URLs (docs/DEVELOPMENT.md).
   */
  readonly VITE_THUNDERFOREST_API_KEY?: string;
  /**
   * Gates the TEMPORARY map-comparison selector in production builds
   * ('true' → visible; anything else → normal production map only). Dev
   * builds default to visible. Not sensitive — a repository VARIABLE in
   * deploy.yml, deliberately separate from the API key.
   */
  readonly VITE_ENABLE_MAP_BENCHMARK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
