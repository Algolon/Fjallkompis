/**
 * The ONE place that knows which shell the app is running in.
 *
 * Rule for this module: screens and stores must never ask "am I on Android?".
 * They ask nothing at all — every platform difference is either resolved here
 * (back button, system bars) or expressed as CSS scoped under the root marker
 * this module sets. If you find yourself adding a second `isNativeAndroid()`
 * call inside a screen, the behaviour belongs here instead.
 *
 * DETECTION. `Capacitor.getPlatform()` / `isNativePlatform()` is Capacitor's
 * own runtime detection: the native bridge injects a global before any app
 * code runs, so this is a fact about the host, not a guess. There is
 * deliberately NO user-agent sniffing anywhere in this file — the Android
 * WebView's UA string is a browser UA, and every heuristic built on it
 * eventually misfires on some device or some Chrome release.
 *
 * The web and installed-PWA cases keep the app's existing, established
 * detection (`display-mode: standalone`), so nothing about browser or PWA
 * behaviour changes because this file exists.
 */
import { Capacitor } from '@capacitor/core';

/** Which shell is hosting the React app right now. */
export type Runtime = 'web' | 'pwa' | 'native-android';

/**
 * Brand chrome behind the STATUS bar in the native shell. Same spruce as the
 * PWA's `theme_color` / `<meta name="theme-color">`, quoted here because CSS
 * custom properties are not readable from TypeScript at module scope and the
 * native backdrop must not drift from the web one. Kept in sync by
 * tests/native-runtime.test.mjs.
 */
export const NATIVE_STATUS_BAR_BACKDROP = '#2f4a3d';

let cachedRuntime: Runtime | null = null;

/**
 * Resolve the host once. Capacitor's platform is fixed for the lifetime of
 * the document, and `display-mode` is only read as a fallback for the two web
 * cases, so caching cannot go stale in a way that matters.
 */
export function getRuntime(): Runtime {
  if (cachedRuntime) return cachedRuntime;

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    cachedRuntime = 'native-android';
    return cachedRuntime;
  }

  const standalone =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  cachedRuntime = standalone ? 'pwa' : 'web';
  return cachedRuntime;
}

/** True only inside the Capacitor Android shell. */
export function isNativeAndroid(): boolean {
  return getRuntime() === 'native-android';
}

/**
 * Stamp the runtime onto <html> BEFORE the first paint.
 *
 * Every native-only style rule is scoped under `html[data-runtime='native-android']`
 * (see "Native Android shell" in global.css), so this attribute is what makes
 * those rules apply — and its absence in a browser or installed PWA is what
 * guarantees none of them can leak there. It is set from main.tsx before
 * `createRoot().render()` so the shell never paints one frame with browser
 * insets and then reflows into native ones.
 *
 * Safe to call more than once; writing the same value is a no-op.
 */
export function markRuntimeOnDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.runtime = getRuntime();
}
