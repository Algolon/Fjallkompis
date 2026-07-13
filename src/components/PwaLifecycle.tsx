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
 *    browser tab. Chromium shows a native "Install now"; Safari/iOS and
 *    Firefox (no native prompt) get concise Add-to-Home-Screen guidance
 *    straight away. A top-right close button and "Later" both dismiss it.
 *  - "Offline ready" once, the first time the app has finished precaching.
 *    `offlineReady` is only raised on first activation, so ordinary relaunches
 *    of an already-installed app don't nag.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
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
  // Minimal fallback flag: set only if the captured native prompt is
  // unexpectedly unavailable when the user taps "Install now", so the toast
  // degrades to manual instructions + Settings instead of leaving a dead
  // button. Normal Safari/iOS/Firefox (canPrompt === false) never needs it.
  const [nativePromptFailed, setNativePromptFailed] = useState(false);

  const dismissInstallNudge = () => {
    writeInstallNudgeDismissed();
    setInstallDismissed(true);
  };

  const runInstallPrompt = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') dismissInstallNudge();
    // 'dismissed' flips canPrompt false (the deferred prompt is single-use),
    // which already surfaces the manual fallback on re-render; 'unavailable'
    // does not, so force the fallback here rather than leave a dead button.
    else if (outcome === 'unavailable') setNativePromptFailed(true);
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
        <div
          className="pwa-toast pwa-toast--install"
          role="alertdialog"
          aria-labelledby="pwa-install-title"
        >
          <button
            type="button"
            className="pwa-toast__close"
            onClick={dismissInstallNudge}
            aria-label="Close installation prompt"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
          <h2 id="pwa-install-title" className="pwa-toast__title">
            Install Fjällkompis on this device?
          </h2>
          <p className="pwa-toast__sub">
            For the best experience, install Fjällkompis as an app. It opens
            full-screen and keeps the route available offline once it has
            loaded.
          </p>
          {canPrompt && !nativePromptFailed ? null : (
            <p className="pwa-toast__sub">
              Use your browser’s Share or menu button, then choose Add to Home
              Screen or Install app. On iPhone and iPad, use Safari’s Share
              button.
            </p>
          )}
          <div className="pwa-toast__actions">
            {canPrompt && !nativePromptFailed ? (
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
              onClick={dismissInstallNudge}
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
