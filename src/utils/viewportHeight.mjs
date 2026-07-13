/**
 * App-shell viewport-height sync.
 *
 * The shell (.app in global.css) is sized with `100dvh`, which is correct
 * CSS-only behaviour — except on two mobile platforms where the CSS units
 * misreport and the bounded `overflow: hidden` shell then can't recover.
 * This helper mirrors an authoritative height into the `--app-height`
 * custom property, refreshed on every lifecycle event where the browser is
 * known to have settled new metrics. CSS keeps 100dvh/100vh as fallbacks,
 * so this is a corrective backstop, not a replacement. The right authority
 * differs by platform, so the two cases are handled separately:
 *
 * 1. ANDROID CHROME (browser and installed PWA) can leave dvh/vh — and,
 *    after the reload that applies a service-worker update or a resume from
 *    background, even the layout viewport itself — stale and OVERSIZED. A
 *    too-tall shell pushes the in-flow tab bar below the visible viewport
 *    with no way to scroll it back; only a full restart re-created correct
 *    metrics. Here `visualViewport.height` — what the user can actually
 *    see — is the trustworthy source, because the layout viewport (and thus
 *    `innerHeight`) reports the oversized value. `innerHeight` is the
 *    fallback for two cases where the visual viewport diverges for
 *    *legitimate* reasons that must NOT resize the shell:
 *      - a text control is focused: the on-screen keyboard shrinks only the
 *        visual viewport (Android's default `resizes-visual`), and sizing
 *        the shell to it would reflow the whole app on every keyboard toggle;
 *      - pinch-zoom is active (scale ≠ 1, e.g. Firefox Android ignores
 *        user-scalable=no): the visual viewport is a magnified crop, not the
 *        app's available height.
 *
 * 2. APPLE HOME-SCREEN STANDALONE (installed iOS/iPadOS web app) has the
 *    OPPOSITE bug. With `viewport-fit=cover`, WebKit's `visualViewport.height`
 *    reports the display height MINUS the safe-area insets, even though the
 *    standalone canvas spans the full display (WebKit bug 254868). Trusting
 *    it there UNDER-sizes the shell by the notch + home-indicator (~85px on
 *    a 390×844 iPhone), leaving a stone-coloured blank band beneath the tab
 *    bar. WebKit's documented workaround is `100vh`, which in standalone mode
 *    resolves to the true full-screen canvas — there is no collapsible
 *    browser chrome, so `100vh`'s usual phantom-scroll weakness (case 1's
 *    "includes space behind the chrome") cannot apply. So in Apple standalone
 *    we hand authority back to CSS by writing the literal `100vh` token
 *    rather than a pixel snapshot: WebKit keeps resolving the live canvas
 *    across rotation with no re-measure, and we never capture a stale
 *    `innerHeight`. `innerHeight` measures the same full canvas here, but the
 *    token is self-maintaining and is the metric WebKit's report recommends.
 *
 * The discriminator is `navigator.standalone === true` — Apple-proprietary
 * and true ONLY in an iOS/iPadOS home-screen web app (`false` in mobile
 * Safari's browser tab, `undefined` on Android). `(display-mode: standalone)`
 * is deliberately NOT used: it also matches Android's installed PWA, which
 * must keep case 1's visualViewport protection.
 *
 * Plain .mjs with an injectable window so node --test can drive it without
 * a DOM (same pattern as routeProgress.mjs / stateMigration.mjs).
 */

export const APP_HEIGHT_VAR = '--app-height';

/** WebKit's standalone-mode full-canvas workaround (see the header, case 2). */
export const STANDALONE_HEIGHT = '100vh';

const EDITABLE_TAG = /^(input|textarea|select)$/i;

/**
 * True only in an Apple home-screen (installed) web app. `navigator.standalone`
 * is `true` in an iOS/iPadOS standalone PWA, `false` in mobile Safari, and
 * `undefined` everywhere else (Android Chrome's standalone PWA included), so it
 * is the exact discriminator for "the Apple platform with the viewport-fit=cover
 * bug" without any user-agent sniffing.
 */
function isAppleStandalone(win) {
  return win.navigator?.standalone === true;
}

/** True while the focused element can summon the on-screen keyboard. */
function textInputFocused(doc) {
  const el = doc.activeElement;
  return Boolean(
    el && (EDITABLE_TAG.test(el.tagName ?? '') || el.isContentEditable === true),
  );
}

/**
 * Start syncing. Returns a stop() function that removes all listeners and
 * clears the property (restoring the pure-CSS dvh/vh sizing).
 */
export function startViewportHeightSync(win = globalThis.window) {
  const doc = win.document;
  const root = doc.documentElement;

  const measure = () => {
    // Apple standalone (case 2): CSS 100vh is the full-canvas authority;
    // visualViewport.height is known to under-report behind the safe-area
    // insets. Write the token, not a pixel value, and let WebKit resolve it.
    if (isAppleStandalone(win)) {
      root.style.setProperty(APP_HEIGHT_VAR, STANDALONE_HEIGHT);
      return;
    }
    // Android / all browser-mode mobile (case 1): trust the measured visible
    // viewport, with innerHeight fallbacks for keyboard and pinch-zoom.
    let h = win.innerHeight;
    const vv = win.visualViewport;
    if (
      vv &&
      typeof vv.height === 'number' &&
      // scale is 1 (or unreported) — not a pinch-zoomed crop
      (!vv.scale || Math.abs(vv.scale - 1) < 0.02) &&
      !textInputFocused(doc)
    ) {
      h = vv.height;
    }
    if (typeof h === 'number' && Number.isFinite(h) && h > 0) {
      root.style.setProperty(APP_HEIGHT_VAR, `${Math.round(h)}px`);
    }
  };

  const update = () => {
    measure();
    // Chrome can report a stale innerHeight at the instant pageshow /
    // visibilitychange fires and settle one frame later; re-measure then.
    win.requestAnimationFrame?.(measure);
  };

  // Re-measure only when returning to the foreground; a hidden document can
  // report bogus dimensions.
  const onVisibilityChange = () => {
    if (doc.visibilityState === 'visible') update();
  };

  update();
  win.addEventListener('resize', update);
  win.addEventListener('orientationchange', update);
  win.addEventListener('pageshow', update);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  // On some Android builds browser-chrome changes only fire on the visual
  // viewport. The handler still reads innerHeight, so keyboard-only visual
  // resizes write the same value back (a no-op).
  const vv = win.visualViewport ?? null;
  vv?.addEventListener('resize', update);

  return function stop() {
    win.removeEventListener('resize', update);
    win.removeEventListener('orientationchange', update);
    win.removeEventListener('pageshow', update);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    vv?.removeEventListener('resize', update);
    root.style.removeProperty(APP_HEIGHT_VAR);
  };
}
