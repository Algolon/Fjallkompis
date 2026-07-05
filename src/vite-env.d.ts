/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Absolute URL of the satellite raster PMTiles archive (hosted off-repo as a
   * versioned GitHub Release asset in production). When unset, the app falls
   * back to the same-origin maps/ path (dev only). See src/map/offlineMap.ts.
   */
  readonly VITE_SATELLITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
