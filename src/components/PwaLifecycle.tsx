/**
 * Global PWA lifecycle UX.
 *
 * This is the single service-worker registration path for the app. The
 * vite-plugin-pwa config uses `registerType: 'prompt'` + `injectRegister: null`
 * (see vite.config.ts), so nothing registers the worker automatically — the
 * official React integration below does it once, here.
 *
 * Two non-blocking toasts:
 *  - "Update available" when a new worker is waiting. The user chooses when to
 *    apply it; we NEVER reload without a deliberate tap, because in-memory
 *    screen state (e.g. an in-progress form) would be lost on a surprise
 *    reload.
 *  - "Offline ready" once, the first time the app has finished precaching.
 *    `offlineReady` is only raised on first activation, so ordinary relaunches
 *    of an already-installed app don't nag.
 */
import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaLifecycle() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // Non-fatal: the app still runs online without a worker.
      console.error('[fjällkompis] service worker registration failed', error);
    },
  });

  // Auto-dismiss the transient "offline ready" confirmation; the update
  // prompt is intentionally sticky until the user acts on it.
  const dismissRef = useRef<number | null>(null);
  useEffect(() => {
    if (!offlineReady) return;
    dismissRef.current = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => {
      if (dismissRef.current) window.clearTimeout(dismissRef.current);
    };
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="pwa-toast-region" role="status" aria-live="polite">
      {needRefresh ? (
        <div className="pwa-toast" role="alertdialog" aria-label="Update available">
          <p className="pwa-toast__msg">A new version of Fjällkompis is available.</p>
          <div className="pwa-toast__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void updateServiceWorker(true)}
            >
              Update now
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setNeedRefresh(false)}
            >
              Later
            </button>
          </div>
        </div>
      ) : offlineReady ? (
        <div className="pwa-toast">
          <p className="pwa-toast__msg">Fjällkompis is ready for offline use.</p>
          <div className="pwa-toast__actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOfflineReady(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
