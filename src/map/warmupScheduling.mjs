/**
 * Deferred-startup scheduling for the map warm-up (pure; no platform, no
 * archive knowledge — src/map/mapWarmup.ts decides WHAT to warm and WHERE).
 *
 * The contract this module owns: warm-up work runs strictly AFTER the initial
 * UI work. Today / the normal start destination stays the startup priority,
 * so the task is handed to `requestIdleCallback` — the browser runs it when
 * the main thread has nothing better to do. Two backstops keep that honest:
 *
 *  - the idle request carries a timeout, so on a device whose main thread
 *    never reports idle during boot the warm-up still happens within a
 *    bounded window instead of never;
 *  - a host without `requestIdleCallback` (older WebView, other engines)
 *    falls back to a plain deferred `setTimeout` — later than any boot work,
 *    never blocking it.
 *
 * The host object is injectable so the scheduling policy is testable in Node
 * exactly as it runs in the WebView.
 */

/** Run the task at the latest this long after scheduling, idle or not. */
export const WARMUP_IDLE_TIMEOUT_MS = 2000;
/** Fallback delay when the host has no requestIdleCallback. */
export const WARMUP_FALLBACK_DELAY_MS = 1500;

/**
 * Schedule `task` for after the initial UI work. Returns a cancel function
 * (unused in production — the warm-up lives for the session — but it keeps
 * the primitive honest and testable).
 */
export function scheduleWarmup(task, host = globalThis) {
  if (typeof host.requestIdleCallback === 'function') {
    const id = host.requestIdleCallback(() => task(), {
      timeout: WARMUP_IDLE_TIMEOUT_MS,
    });
    return () => host.cancelIdleCallback?.(id);
  }
  const id = host.setTimeout(() => task(), WARMUP_FALLBACK_DELAY_MS);
  return () => host.clearTimeout(id);
}
