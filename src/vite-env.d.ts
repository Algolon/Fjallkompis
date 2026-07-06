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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
