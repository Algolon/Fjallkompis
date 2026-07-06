/**
 * Settings → app install + PWA status.
 *
 * Reactive replacement for the old one-shot `pwaStatus()` string: it tracks
 * standalone/installed mode, service-worker control and the captured install
 * prompt, so the card updates itself after an install or worker activation
 * without a manual refresh.
 *
 * Install UI degrades gracefully:
 *  - already installed → show installed status, no button;
 *  - native prompt available (Chromium) → "Install Fjällkompis";
 *  - otherwise (Safari/iOS, Firefox) → concise Add-to-Home-Screen guidance;
 *  - never a dead or fake install button.
 */
import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

function useServiceWorkerControlled(): boolean {
  const [controlled, setControlled] = useState(
    () => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
  );
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onChange = () => setControlled(!!navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  return controlled;
}

function statusText(installed: boolean, swControlled: boolean): string {
  if (installed && swControlled) return 'Installed · offline-ready';
  if (installed) return 'Installed (service worker starting…)';
  if (swControlled) return 'Offline-ready (in browser tab)';
  return 'Browser tab';
}

export function InstallCard() {
  const { installed, canPrompt, promptInstall } = useInstallPrompt();
  const swControlled = useServiceWorkerControlled();
  const [note, setNote] = useState<string | null>(null);

  const onInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') setNote('Installing… you can launch it from your home screen.');
    else if (outcome === 'dismissed') setNote('Install dismissed. You can try again any time.');
  };

  return (
    <div className="card">
      <span className="card-title">Install app</span>

      <div className="row-between" style={{ marginTop: 10 }}>
        <span className="muted">Status</span>
        <span style={{ textAlign: 'right', maxWidth: '60%' }}>
          {statusText(installed, swControlled)}
        </span>
      </div>

      {installed ? (
        <p className="card-sub" style={{ marginTop: 10 }}>
          Fjällkompis is installed on this device and runs offline once the
          route (and, optionally, the offline map) have loaded.
        </p>
      ) : canPrompt ? (
        <>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={onInstall}>
            Install Fjällkompis
          </button>
          <p className="card-sub" style={{ marginTop: 8 }}>
            Adds an app icon and lets Fjällkompis run full-screen and offline.
          </p>
        </>
      ) : (
        <p className="card-sub" style={{ marginTop: 10, lineHeight: 1.5 }}>
          To install: open your browser’s <strong>Share</strong> or menu (⋮ / ▾)
          and choose <strong>Add to Home Screen</strong>. On iPhone/iPad use
          Safari’s Share button. Fjällkompis then runs full-screen and offline.
        </p>
      )}

      {note ? (
        <p className="card-sub" style={{ marginTop: 10 }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
