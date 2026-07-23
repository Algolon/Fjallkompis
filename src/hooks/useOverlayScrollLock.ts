import { useEffect } from 'react';
import { acquireOverlayLock, releaseOverlayLock } from '../utils/overlayLock.mjs';

/**
 * Hold the shared document lock (src/utils/overlayLock.mjs) while an overlay
 * is showing: freezes root scrolling and disables pull-to-refresh until the
 * LAST overlay releases it — reference-counted, so nested overlays (a picker
 * above the Trip sheet) never unlock the page early.
 *
 * Usage:
 *  - overlays that mount when opening (sheets, pickers, ConfirmDialog):
 *    call `useOverlayScrollLock()` — the mount/unmount lifecycle is the lock
 *    lifecycle, so every close path (Escape, backdrop, buttons, route
 *    change, error unmount) releases through the effect cleanup;
 *  - always-mounted overlays driven by a flag (CreditsSheet, ContextHelp,
 *    RotateGuard): pass that flag as `active`.
 */
export function useOverlayScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    acquireOverlayLock();
    return () => releaseOverlayLock();
  }, [active]);
}
