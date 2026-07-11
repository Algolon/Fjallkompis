/**
 * Progressive PWA install state.
 *
 * Captures the (non-standard, Chromium-only) `beforeinstallprompt` event so
 * Settings can offer a native "Install" action when the browser supports it,
 * and degrades to plain "Add to Home Screen" guidance elsewhere (Safari/iOS,
 * Firefox). The captured browser prompt is shared across every app surface
 * (Settings, readiness and the global beta install nudge), so one component
 * cannot accidentally consume the only prompt event before another sees it.
 * Standalone/installed mode is tracked reactively so the UI updates itself
 * after an install without a manual refresh.
 */
import { useCallback, useEffect, useState } from 'react';

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

type Snapshot = Pick<InstallState, 'installed' | 'canPrompt'>;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedSnapshot = detectStandalone();
let canPromptSnapshot = false;
let listenersInstalled = false;
const subscribers = new Set<() => void>();

function emitInstallState() {
  for (const subscriber of subscribers) subscriber();
}

function snapshot(): Snapshot {
  return {
    installed: installedSnapshot,
    canPrompt: canPromptSnapshot,
  };
}

function ensureInstallListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  const onBeforeInstallPrompt = (e: Event) => {
    // Stop Chromium's default mini-infobar; the app surfaces deliberate
    // install actions in Settings and in the beta readiness toast.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    canPromptSnapshot = true;
    emitInstallState();
  };

  const onAppInstalled = () => {
    deferredPrompt = null;
    canPromptSnapshot = false;
    installedSnapshot = true;
    emitInstallState();
  };

  const mql = window.matchMedia?.('(display-mode: standalone)');
  const onDisplayModeChange = () => {
    installedSnapshot = detectStandalone();
    emitInstallState();
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  mql?.addEventListener?.('change', onDisplayModeChange);
}

export function useInstallPrompt(): InstallState {
  const [state, setState] = useState<Snapshot>(() => snapshot());

  useEffect(() => {
    ensureInstallListeners();
    const subscriber = () => setState(snapshot());
    subscribers.add(subscriber);
    subscriber();

    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const evt = deferredPrompt;
    if (!evt) return 'unavailable';
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // A deferred prompt can only be used once.
    deferredPrompt = null;
    canPromptSnapshot = false;
    emitInstallState();
    return outcome;
  }, []);

  return { ...state, promptInstall };
}
