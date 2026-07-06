/**
 * Progressive PWA install state.
 *
 * Captures the (non-standard, Chromium-only) `beforeinstallprompt` event so
 * Settings can offer a native "Install" action when the browser supports it,
 * and degrades to plain "Add to Home Screen" guidance elsewhere (Safari/iOS,
 * Firefox). Also tracks standalone/installed mode reactively so the UI updates
 * itself after an install without a manual refresh. All listeners are cleaned
 * up on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal shape of the beforeinstallprompt event (not in the DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's non-standard flag.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallState {
  /** True once the app is running installed (standalone display mode). */
  installed: boolean;
  /** True when a native install prompt has been captured and can be shown. */
  canPrompt: boolean;
  /** Trigger the captured native prompt. No-op returns 'unavailable'. */
  promptInstall: () => Promise<InstallOutcome>;
}

export function useInstallPrompt(): InstallState {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => detectStandalone());
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // Stop Chromium's default mini-infobar; we surface our own button.
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };

    const onAppInstalled = () => {
      deferredRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => setInstalled(detectStandalone());

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    mql?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      mql?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const evt = deferredRef.current;
    if (!evt) return 'unavailable';
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // A deferred prompt can only be used once.
    deferredRef.current = null;
    setCanPrompt(false);
    return outcome;
  }, []);

  return { installed, canPrompt, promptInstall };
}
