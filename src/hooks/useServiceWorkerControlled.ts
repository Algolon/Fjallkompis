import { useEffect, useState } from 'react';

/**
 * Whether a service worker is currently controlling this page.
 *
 * Reactive rather than a one-shot read: it re-renders on `controllerchange`,
 * so a caller sees the worker take control without a manual refresh.
 *
 * This is a TECHNICAL fact with exactly one consumer left — the Settings →
 * Data sources "Copy technical details" report. It is deliberately not shown
 * as a user-facing readiness state: "app shell" and "browser tab" describe
 * the delivery mechanism, not whether a hiker's trail data is on the device.
 * Offline maps answers that question.
 */
export function useServiceWorkerControlled(): boolean {
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
