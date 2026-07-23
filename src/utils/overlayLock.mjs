/**
 * Shared, reference-counted document lock for modal overlays.
 *
 * Why this exists: every overlay in the app is a top-layer surface (native
 * <dialog> or a fixed ConfirmDialog). Touch scrolling that starts on a
 * top-layer element chains DIRECTLY to the viewport's root scroller — it
 * skips `.app > main` and its `overscroll-behavior: contain` entirely — and
 * Chrome on Android fires pull-to-refresh from the root even when the
 * document has nothing to scroll. (The old `body { overscroll-behavior-y:
 * none }` rule never guarded the viewport: per spec the viewport takes
 * overscroll-behavior from the ROOT element, html.) So a downward drag on an
 * open Trip sheet could reload the page and discard the draft.
 *
 * The lock is one attribute, `data-overlay-locked`, on <html>; the styles it
 * activates live in global.css (`overflow: hidden` + `overscroll-behavior:
 * none` on html and body). Pull-to-refresh — and any other root overscroll
 * effect — is disabled ONLY while at least one overlay holds the lock;
 * normal page behaviour (including deliberate refresh) returns when the
 * last overlay releases it.
 *
 * Reference counting makes nesting safe: the Trip sheet acquires (0→1), a
 * date picker on top of it acquires again (1→2); the picker's release
 * (2→1) leaves the document locked for the sheet underneath, and only the
 * final release (1→0) unlocks and restores the scroll position. Components
 * must never toggle document styles themselves — one owner, this module.
 *
 * The document/window are injectable for unit tests; browser callers use
 * the defaults.
 */

let count = 0;
let savedScroll = null;

/** Lock the document for one overlay. Call exactly once per open overlay. */
export function acquireOverlayLock(doc = document) {
  count += 1;
  if (count > 1) return;
  const win = doc.defaultView;
  // The app shell keeps the document at 0,0 (scrolling lives in <main>),
  // but capture and restore anyway so the lock stays correct if a future
  // layout ever lets the document scroll.
  savedScroll = { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 };
  doc.documentElement.setAttribute('data-overlay-locked', '');
}

/** Release one overlay's hold; the last release restores the document. */
export function releaseOverlayLock(doc = document) {
  if (count === 0) return; // defensive: never go negative on double release
  count -= 1;
  if (count > 0) return;
  doc.documentElement.removeAttribute('data-overlay-locked');
  const restore = savedScroll;
  savedScroll = null;
  doc.defaultView?.scrollTo?.(restore?.x ?? 0, restore?.y ?? 0);
}

/** Current number of overlays holding the lock (diagnostics/tests). */
export function overlayLockCount() {
  return count;
}

/** Test-only: reset module state between cases. */
export function resetOverlayLockForTests() {
  count = 0;
  savedScroll = null;
}
