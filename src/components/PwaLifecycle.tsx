/**
 * Global PWA lifecycle UX.
 *
 * This is the single service-worker registration path for the app. The
 * vite-plugin-pwa config uses `registerType: 'prompt'` + `injectRegister: null`
 * (see vite.config.ts), so nothing registers the worker automatically — the
 * official React integration below does it once, here.
 *
 * Non-blocking toasts:
 *  - "Update available" when a new worker is waiting. The user chooses when to
 *    apply it; we NEVER reload without a deliberate tap, because in-memory
 *    screen state (e.g. an in-progress form) would be lost on a surprise
 *    reload.
 *  - "Install Fjällkompis" during beta when the app is still running in a
 *    browser tab. Chromium gets the native install prompt; Safari/iOS and
 *    Firefox get direct Add-to-Home-Screen guidance.
 *  - "Offline ready" once, the first time the app has finished precaching.
 *    `offlineReady` is only raised on first activation, so ordinary relaunches
 *    of an already-installed app don't nag.
 */
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const INSTALL_NUDGE_DISMISSED_KEY = 'fjallkompis.installNudgeDismissed.v1';

function readInstallNudgeDismissed(): boolean {
  try {
    return sessionStorage.getItem(INSTALL_NUDGE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeInstallNudgeDismissed() {
  try {
    sessionStorage.setItem(INSTALL_NUDGE_DISMISSED_KEY, '1');
  } catch {
    // Non-fatal: the in-memory state below still dismisses this session.
  }
}

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
  const { installed, canPrompt, promptInstall } = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(readInstallNudgeDismissed);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  const dismissInstallNudge = () => {
    writeInstallNudgeDismissed();
    setInstallDismissed(true);
  };

  const runInstallPrompt = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') dismissInstallNudge();
    if (outcome === 'unavailable') setInstallHelpOpen(true);
  };

  const openInstallSettings = () => {
    dismissInstallNudge();
    window.location.hash = '#/settings';
  };

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

  const showInstallNudge = !installed && !installDismissed && !needRefresh;

  if (!offlineReady && !needRefresh && !showInstallNudge) return null;

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
      ) : showInstallNudge ? (
        <div className="pwa-toast" role="alertdialog" aria-label="Install app">
          <p className="pwa-toast__msg">
            Install Fjällkompis on this device before beta testing offline.
          </p>
          {installHelpOpen || !canPrompt ? (
            <p className="pwa-toast__sub">
              Use your browser’s Share or menu button, then choose Add to Home
              Screen or Install app. On iPhone and iPad, use Safari’s Share
              button.
            </p>
          ) : null}
          <div className="pwa-toast__actions">
            {canPrompt && !installHelpOpen ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runInstallPrompt()}
              >
                Install now
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={openInstallSettings}
              >
                Open Settings
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={
                canPrompt && !installHelpOpen
                  ? () => setInstallHelpOpen(true)
                  : dismissInstallNudge
              }
            >
              {canPrompt && !installHelpOpen ? 'How?' : 'Later'}
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
