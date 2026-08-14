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
  registerPlugin,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * The app's own one-method native plugin (android/…/BootPlugin.java): the
 * single channel by which the web layer tells the Android shell that the
 * first usable frame is painted, so the splash may be released. It carries no
 * data and has no other methods on purpose. Off Android this proxy is never
 * called — signalNativeAppReady() returns early.
 */
const NativeBoot = registerPlugin<{ appReady(): Promise<void> }>('Boot');

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
 * Jump every finite entrance animation inside the shell straight to its end.
 *
 * The app shell fades each destination in (`.screen { animation: fade … }`,
 * opacity 0 → 1). That is right for navigation and wrong for the very first
 * frame under the boot veil: the veil's own fade-out and the screen's fade-in
 * would overlap, both surfaces would be part-transparent at the same moment,
 * and the flat launch background would show through the pair. Finishing the
 * animation is preferable to suppressing it — nothing has to be un-suppressed
 * afterwards, so the next navigation animates completely normally, with no
 * class to remove and no risk of re-triggering a fade on a settled screen.
 *
 * Infinite animations (the tracking-pill blink, the status pulse) are skipped
 * rather than finished: they are decorative, they never drive page opacity,
 * and `finish()` throws on an unbounded effect.
 */
function settleShellEntranceAnimations(): void {
  const shell = document.querySelector('.app');
  if (!shell || typeof shell.getAnimations !== 'function') return;
  for (const animation of shell.getAnimations({ subtree: true })) {
    const timing = animation.effect?.getComputedTiming();
    if (!timing || timing.iterations === Infinity || timing.duration === Infinity) {
      continue;
    }
    try {
      animation.finish();
    } catch {
      // A refusing animation simply keeps running; it is never the surface
      // the veil is handing over to.
    }
  }
}

/**
 * Tell the native shell the app is ready to be revealed.
 *
 * THE ONLY LAUNCH SURFACE IS THE ANDROID SPLASH. It is held on screen by
 * MainActivity's keep-on-screen condition until this signal arrives, and the
 * platform then runs its own exit. There is deliberately no HTML loading
 * screen of any kind: a logo drawn inside the WebView cannot line up with the
 * one the system draws, because the splash occupies the full window while the
 * WebView is inset by the navigation bar on devices that pad it — two
 * coordinate spaces, and a mark that visibly jumped between them. Do not
 * reintroduce a web-side veil, spinner or fade to "help" this.
 *
 * WHEN "READY" IS, and why each step earns its frame:
 *   1. two rAFs — wait for React's first commit to actually be painted;
 *   2. settle the shell's entrance animations, so the first screen is fully
 *      OPAQUE rather than mid-fade — otherwise the splash would lift off a
 *      half-transparent app and the launch background would show through;
 *   3. one more rAF — let that opaque frame reach the screen;
 *   4. only then signal, so the splash exits over finished UI.
 *
 * `onPageFinished` is deliberately NOT the signal: it fires when the document
 * has loaded, which on this app is well before React has mounted anything
 * worth looking at.
 *
 * Nothing here waits on a clock. A no-op off Android, where the platform owns
 * its own launch.
 */
export function signalNativeAppReady(): void {
  if (!isNativeAndroid()) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      settleShellEntranceAnimations();
      requestAnimationFrame(() => {
        void NativeBoot.appReady().catch((error: unknown) => {
          // Non-fatal: MainActivity's fail-safe releases the splash anyway,
          // so a failed signal costs a slower reveal, never a hung app.
          console.error('[fjällkompis] native app-ready signal failed', error);
        });
      });
    });
  });
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
 * FULL-SCREEN OVERLAYS AND ANDROID BACK. The app's sheets and dialogs do not
 * close on hardware Back (a tracked follow-up — see docs/ANDROID.md), and for
 * a half-height form that is a tolerable seam. A FULL-SCREEN surface is not:
 * when a document covers the whole shell, Back navigating the invisible app
 * underneath would be a trap. So a full-screen overlay may register an
 * interceptor here; the back subscription consults the most recent one FIRST
 * and only falls through to history when no interceptor claims the press.
 * This is deliberately a narrow runtime hook, not a second navigation system:
 * the overlay answers "did you consume Back?", nothing more, and off Android
 * the registration is a no-op (browsers route hardware/gesture Back to modal
 * dialogs natively via their own close semantics).
 */
type BackInterceptor = () => boolean;
const backInterceptors: BackInterceptor[] = [];

export function interceptAndroidBack(handler: BackInterceptor): () => void {
  if (!isNativeAndroid()) return () => {};
  backInterceptors.push(handler);
  return () => {
    const at = backInterceptors.lastIndexOf(handler);
    if (at >= 0) backInterceptors.splice(at, 1);
  };
}

/** The newest interceptor wins — overlays stack, the top one owns Back. */
function consumeBackViaInterceptor(): boolean {
  for (let i = backInterceptors.length - 1; i >= 0; i -= 1) {
    try {
      if (backInterceptors[i]()) return true;
    } catch (error) {
      console.error('[fjällkompis] back interceptor failed', error);
    }
  }
  return false;
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
 * plumbing. Tracked as follow-up in docs/ANDROID.md. The one exception is
 * full-screen overlays, which register through interceptAndroidBack above —
 * a covered shell must never navigate invisibly.
 */
export function subscribeAndroidBackButton(): () => void {
  if (!isNativeAndroid()) return () => {};

  const handle = App.addListener('backButton', () => {
    // A full-screen overlay (the in-app PDF viewer) claims Back before the
    // history fallback — closing the surface IS the navigation.
    if (consumeBackViaInterceptor()) return;
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
