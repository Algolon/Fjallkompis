import { useEffect, useState } from 'react';

/**
 * Tracks navigator.onLine. Note: "online" only means the device has a network
 * interface up, not that the internet is reachable — good enough as a hint,
 * and the app works fully offline regardless.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
