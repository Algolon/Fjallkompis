import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell configuration — Android spike only.
 *
 * SCOPE. This wraps the SAME web build that ships to GitHub Pages; there is
 * no second application. React screens, trail content, stores and business
 * rules are shared verbatim, and every platform difference lives behind
 * src/runtime/platform.ts. iOS is deliberately absent from this spike.
 *
 * APPLICATION ID. `com.algolon.fjallkompis` is PROVISIONAL. On Android the
 * application id is the app's permanent identity: once a build carrying this
 * id is distributed publicly (Play Store or otherwise), changing it creates a
 * DIFFERENT app — users would not be offered an update, they would be offered
 * a second install alongside the first, with its own storage sandbox and no
 * migration path. Nothing here has been published, so the id is still free to
 * change; that window closes at first public release. See docs/ANDROID.md.
 *
 * webDir is `dist` — the SHARED Vite output directory. Which build produced
 * it matters: only `npm run build:native` emits assets the WebView can load
 * (relative base, no service worker). `npm run cap:sync:android` refuses to
 * sync a web/Pages build; see scripts/assert-native-build.mjs.
 */
const config: CapacitorConfig = {
  appId: 'com.algolon.fjallkompis',
  appName: 'Fjällkompis',
  webDir: 'dist',
  android: {
    // The window colour behind the WebView, seen only in the moment before
    // the first paint. Reuses the manifest's established launch surface
    // (background_color in vite.config.ts) so the native launch matches the
    // installed PWA's rather than flashing white.
    backgroundColor: '#dce4d8',
  },
  plugins: {
    SystemBars: {
      // Android WebView does not reliably populate env(safe-area-inset-*)
      // for the system bars, so Capacitor injects --safe-area-inset-* CSS
      // variables instead. global.css consumes them ONLY under
      // html[data-runtime='native-android'], leaving browser/PWA env()
      // behaviour untouched. This is Capacitor's default; it is stated
      // explicitly because the whole edge-to-edge design depends on it.
      insetsHandling: 'css',
      // Per-bar contrast is set at runtime in src/runtime/platform.ts: the
      // status bar sits on the dark spruce backdrop (light icons) and the
      // navigation bar on the light tab-bar surface (dark icons). One
      // static style here could only serve one of the two.
      style: 'DEFAULT',
      hidden: false,
    },
  },
};

export default config;
