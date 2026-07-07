/**
 * App-shell viewport-height sync.
 *
 * The shell (.app in global.css) is sized with `100dvh`, which is correct
 * CSS-only behaviour — except that Android Chrome (browser and installed
 * PWA) can leave dvh/vh stale after the page reload that applies a
 * service-worker update, and after resuming from background. Because the
 * shell has a bounded height and `overflow: hidden`, a stale-too-tall value
 * pushes the in-flow tab bar below the visible viewport with no way to
 * scroll it back — only a full restart re-created correct metrics.
 *
 * The fix: mirror the *measured* visible-viewport height into the
 * `--app-height` custom property, refreshed on every lifecycle event where
 * the browser is known to have settled new metrics. CSS keeps 100dvh/100vh
 * as fallbacks, so this is a corrective backstop, not a replacement.
 *
 * Which metric to trust: after the buggy reload the layout viewport itself
 * can be oversized (the page pans against the real screen and innerHeight
 * reports the oversized value), so `visualViewport.height` — what the user
 * can actually see — is the primary source. `innerHeight` is the fallback
 * for two cases where the visual viewport diverges for *legitimate*
 * reasons that must NOT resize the shell:
 *   - a text control is focused: the on-screen keyboard shrinks only the
 *     visual viewport (Android's default `resizes-visual`), and sizing the
 *     shell to it would reflow the whole app on every keyboard toggle;
 *   - pinch-zoom is active (scale ≠ 1, e.g. Firefox Android ignores
 *     user-scalable=no): the visual viewport is a magnified crop, not the
 *     app's available height.
 *
 * Plain .mjs with an injectable window so node --test can drive it without
 * a DOM (same pattern as routeProgress.mjs / stateMigration.mjs).
 */

export const APP_HEIGHT_VAR = '--app-height';

const EDITABLE_TAG = /^(input|textarea|select)$/i;

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
