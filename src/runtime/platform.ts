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
import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from '@capacitor/core';
import { App } from '@capacitor/app';

/** Which shell is hosting the React app right now. */
export type Runtime = 'web' | 'pwa' | 'native-android';

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

/**
 * Native-only shell setup. A no-op in the browser and the installed PWA, so
 * main.tsx can call it unconditionally.
 *
 * INSETS are NOT configured here: Capacitor's SystemBars plugin injects
 * `--safe-area-inset-top/right/bottom/left` onto <html> on every window-inset
 * change (rotation, keyboard, gesture ↔ three-button switch), because Android
 * WebView does not reliably populate `env(safe-area-inset-*)`. capacitor.config.ts
 * asks for that with `insetsHandling: 'css'`; global.css consumes the
 * variables. There is nothing for this function to do about geometry.
 *
 * What it DOES own is per-bar icon contrast, which no static config can express
 * because the two bars sit on opposite surfaces:
 *
 *   - the status bar sits on the dark spruce backdrop  → DARK  (light icons);
 *   - the navigation bar sits on the light tab-bar row → LIGHT (dark icons).
 *
 * ('DARK' in Capacitor's vocabulary means "light content on a dark
 * background", which is why the two look inverted here.)
 */
export async function initializeNativeShell(): Promise<void> {
  if (!isNativeAndroid()) return;

  try {
    await SystemBars.setStyle({
      style: SystemBarsStyle.Dark,
      bar: SystemBarType.StatusBar,
    });
    await SystemBars.setStyle({
      style: SystemBarsStyle.Light,
      bar: SystemBarType.NavigationBar,
    });
  } catch (error) {
    // Non-fatal: the app is fully usable with the platform's default icon
    // contrast; only the brand chrome reads slightly worse.
    console.error('[fjällkompis] system-bar style setup failed', error);
  }
}

/**
 * True when the app has a previous entry of its OWN to go back to.
 *
 * The Navigation API's `canGoBack` answers exactly the question Android Back
 * needs: is there a preceding entry in *this* document's contiguous
 * same-origin history? `history.length` cannot answer it (it never shrinks,
 * and counts entries that predate the app), which is why it is only the
 * fallback for a WebView old enough to lack the API.
 */
function canGoBackWithinApp(): boolean {
  const nav = (window as unknown as { navigation?: { canGoBack?: boolean } })
    .navigation;
  if (typeof nav?.canGoBack === 'boolean') return nav.canGoBack;
  return window.history.length > 1;
}

/**
 * Wire the Android hardware/gesture Back button to the app's existing hash
 * history. Returns an unsubscribe function; a no-op off-Android.
 *
 * WHY THIS IS REQUIRED, not an enhancement: @capacitor/app registers an
 * always-enabled OnBackPressedCallback that CONSUMES every back press. With
 * no JS listener it calls `webView.goBack()` when it can and otherwise does
 * nothing at all — so without this subscription, Back is a dead button at the
 * start of history rather than the exit the user expects.
 *
 * Behaviour:
 *   - app history remains  → history.back(), so the app's own hash routing
 *     decides the destination. #/guide/stages → Guide, #/plan/packing → Plan,
 *     and Back/Forward keep working exactly as they do in the browser. This
 *     is deliberately NOT a second navigation system: it delegates to the one
 *     in src/navigation/routes.mjs rather than reimplementing "up".
 *   - no app history left  → minimize. The activity is moved to the
 *     background with its state intact, the standard Android root-of-task
 *     behaviour; `exitApp()` would force-kill the process, discarding an
 *     in-progress form for no reason.
 *
 * KNOWN LIMITATION (spike): an open sheet, dialog or picker does NOT close on
 * Back — it navigates the shell underneath instead. The app's overlays are a
 * mix of native <dialog> elements and role="dialog" containers with their own
 * Escape handling, and unifying them is a product change, not wrapper
 * plumbing. Tracked as follow-up in docs/ANDROID.md.
 */
export function subscribeAndroidBackButton(): () => void {
  if (!isNativeAndroid()) return () => {};

  const handle = App.addListener('backButton', () => {
    if (canGoBackWithinApp()) {
      window.history.back();
      return;
    }
    void App.minimizeApp();
  });

  let cancelled = false;
  void handle.catch((error: unknown) => {
    console.error('[fjällkompis] back-button subscription failed', error);
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    void handle.then((listener) => listener.remove()).catch(() => {});
  };
}
