// Single source of truth is package.json: Vite injects its "version" field
// at build time as __APP_VERSION__ (see vite.config.ts + src/vite-env.d.ts).
export const APP_VERSION = __APP_VERSION__;
