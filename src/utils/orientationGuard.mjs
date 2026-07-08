/**
 * Portrait-only phones: phone-landscape classification + best-effort lock.
 *
 * PRODUCT DECISION: Fjällkompis is a portrait-only trail companion on
 * phones. Tablets keep portrait AND landscape; desktop windows stay
 * responsive. One static web-app manifest serves every device class, and
 * its `orientation` member applies to the whole app — setting it to
 * 'portrait' would also lock installed TABLET PWAs out of landscape. So
 * the manifest stays 'any' and phone-portrait is enforced at runtime:
 *
 *   1. The RotateGuard overlay (src/components/RotateGuard.tsx), driven by
 *      the classifier below — the CANONICAL enforcement mechanism, works
 *      in browser tabs and installed PWAs alike.
 *   2. attemptPhonePortraitLock() — progressive enhancement only. The
 *      Screen Orientation API's lock() is rejected in most browsers
 *      outside installed/fullscreen contexts and is entirely absent on
 *      iOS Safari; the guard must never depend on it.
 *
 * Classification is capability- and space-based — never user-agent based:
 *
 *   phone landscape  =  landscape aspect (width > height)
 *                     AND coarse primary pointer  (touch device)
 *                     AND no hover capability     (rules out touch laptops)
 *                     AND height < 500px          (phone-short viewport)
 *
 * Width alone cannot distinguish device classes (a 932px-wide landscape
 * phone is wider than a 768px portrait tablet), so viewport HEIGHT is the
 * space signal: landscape phones are ≈ 320–440px tall, while even small
 * touch tablets are ≥ 600px tall in landscape (e.g. 1024×600) — so a
 * coarse-pointer tablet is never misclassified by pointer type alone.
 * The 500px threshold deliberately matches the adaptive shell's
 * min-height gate in global.css: below it, only the compact layout (or
 * this guard) can apply. A short DESKTOP browser window (fine pointer or
 * hover support) is never guarded — it falls back to the compact layout.
 *
 * Plain .mjs with an injectable window so node --test drives the exact
 * production logic (same pattern as viewportHeight.mjs).
 */

/** Viewport height below which a landscape viewport is phone-class. */
export const PHONE_LANDSCAPE_MAX_HEIGHT = 500;

/**
 * Pure classifier — the single source of truth for "phone landscape".
 * @param {{ width: number, height: number, coarsePointer: boolean, canHover: boolean }} env
 */
export function isPhoneLandscape({ width, height, coarsePointer, canHover }) {
  return (
    width > height &&
    coarsePointer === true &&
    canHover !== true &&
    height < PHONE_LANDSCAPE_MAX_HEIGHT
  );
}

/** Read the current environment and classify it. */
export function readPhoneLandscape(win = globalThis.window) {
  return isPhoneLandscape({
    width: win.innerWidth,
    height: win.innerHeight,
    coarsePointer: win.matchMedia?.('(pointer: coarse)').matches === true,
    canHover: win.matchMedia?.('(hover: hover)').matches === true,
  });
}

/**
 * Watch for phone-landscape changes. Calls onChange(boolean) immediately
 * and again whenever orientation, viewport size or input capabilities
 * change. Returns a stop() function that removes every listener.
 */
export function watchPhoneLandscape(onChange, win = globalThis.window) {
  const notify = () => onChange(readPhoneLandscape(win));

  win.addEventListener('resize', notify);
  win.addEventListener('orientationchange', notify);
  // Input capabilities can change at runtime (e.g. keyboard/mouse attached
  // to a tablet); media-query change events cover that.
  const mqls = ['(pointer: coarse)', '(hover: hover)']
    .map((q) => win.matchMedia?.(q))
    .filter((m) => m && typeof m.addEventListener === 'function');
  for (const m of mqls) m.addEventListener('change', notify);

  notify();

  return function stop() {
    win.removeEventListener('resize', notify);
    win.removeEventListener('orientationchange', notify);
    for (const m of mqls) m.removeEventListener('change', notify);
  };
}

/**
 * Progressive enhancement: try to lock installed PHONE PWAs to portrait.
 *
 * Attempted at most once per app start, and only when ALL of:
 *   - running standalone/installed (display-mode: standalone);
 *   - phone-class device: coarse pointer, no hover, and the SCREEN's
 *     smaller dimension is under the phone threshold (tablets are ≥ 600px
 *     on their short side, so they are never locked);
 *   - the Screen Orientation API with lock() actually exists.
 *
 * Failures are expected (browser support varies widely; iOS has no
 * lock()) and are swallowed silently — no retries, no console noise. The
 * RotateGuard remains the canonical enforcement either way.
 *
 * @returns {boolean} true if a lock attempt was issued (not: succeeded).
 */
export function attemptPhonePortraitLock(win = globalThis.window) {
  try {
    const mm = (q) => win.matchMedia?.(q).matches === true;
    if (!mm('(display-mode: standalone)')) return false;
    if (!mm('(pointer: coarse)') || mm('(hover: hover)')) return false;

    const screen = win.screen;
    const shortSide = Math.min(
      screen?.width ?? Infinity,
      screen?.height ?? Infinity,
    );
    if (!(shortSide < PHONE_LANDSCAPE_MAX_HEIGHT)) return false;

    const orientation = screen?.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return false;

    const result = orientation.lock('portrait-primary');
    // Not every implementation returns a promise; guard the .catch too.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}
