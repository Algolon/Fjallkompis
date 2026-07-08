import { useEffect, useRef, useState } from 'react';
import { AppStoreProvider } from './store/AppStore';
import { startViewportHeightSync } from './utils/viewportHeight.mjs';
import { DEFAULT_TAB, hashForTab, tabForHash } from './navigation/routes.mjs';
import { TabBar, type TabId } from './components/TabBar';
import { TodayScreen, type NavPayload } from './screens/TodayScreen';
import { MapScreen } from './screens/MapScreen';
import { StagesScreen } from './screens/StagesScreen';
import { StopsScreen } from './screens/StopsScreen';
import { ListsScreen } from './screens/ListsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PwaLifecycle } from './components/PwaLifecycle';

interface Nav {
  tab: TabId;
  /** One-shot payload consumed by the destination screen on mount. */
  payload?: NavPayload;
}

function Screens({
  nav,
  navigate,
}: {
  nav: Nav;
  navigate: (t: TabId, payload?: NavPayload) => void;
}) {
  switch (nav.tab) {
    case 'today':
      return <TodayScreen onNavigate={navigate} />;
    case 'map':
      return <MapScreen />;
    case 'stages':
      return <StagesScreen />;
    case 'huts':
      return <StopsScreen initialStopId={nav.payload?.stopId ?? null} />;
    case 'checklist':
      return <ListsScreen initialMode={nav.payload?.listsMode} />;
    case 'settings':
      return <SettingsScreen />;
  }
}

export default function App() {
  // Hash-routed tab state (#/today … #/settings, see navigation/routes.mjs):
  // Back/Forward work, refresh keeps the destination, and primary
  // destinations are bookmarkable — no router dependency, and safe on the
  // GitHub Pages project subpath. One-shot payloads stay in React memory
  // only; a restored/bookmarked URL opens the plain destination.
  const [nav, setNav] = useState<Nav>(() => ({
    tab: tabForHash(window.location.hash) ?? DEFAULT_TAB,
  }));
  // Read by the hashchange handler without re-subscribing per navigation.
  const navRef = useRef(nav);
  navRef.current = nav;

  // Keep --app-height in sync with the measured viewport so the shell (and
  // the tab bar at its bottom) survives stale dvh after SW-update reloads,
  // background resume, and orientation changes. See viewportHeight.mjs.
  useEffect(() => startViewportHeightSync(), []);

  useEffect(() => {
    // Normalise the address bar on load ('' or an unknown hash → the actual
    // start tab) without adding a history entry.
    const canonical = hashForTab(navRef.current.tab);
    if (window.location.hash !== canonical) {
      window.history.replaceState(null, '', canonical);
    }

    // Back/Forward (and hand-edited hashes). navigate() below also fires
    // this after setting state; the tab-equality guard makes that a no-op,
    // which is what preserves its one-shot payload.
    const onHashChange = () => {
      const tab = tabForHash(window.location.hash);
      if (tab === null) {
        // Unknown hash typed/pasted: fall back safely, replacing the bad
        // entry rather than stacking it in history.
        window.history.replaceState(null, '', hashForTab(navRef.current.tab));
        return;
      }
      if (tab === navRef.current.tab) return;
      window.scrollTo(0, 0);
      setNav({ tab });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (tab: TabId, payload?: NavPayload) => {
    // Screens swap inside one document, so the previous tab's scroll
    // position would otherwise carry over to the next screen. Reset before
    // the swap; destinations that deep-link (Stops expanding a stop)
    // re-scroll themselves on mount afterwards.
    window.scrollTo(0, 0);
    setNav({ tab, payload });
    // Push the destination onto history AFTER state is queued: the
    // resulting hashchange sees the same tab and leaves the payload alone.
    // Re-selecting the current tab must not stack duplicate entries.
    if (window.location.hash !== hashForTab(tab)) {
      window.location.hash = hashForTab(tab);
    }
  };

  return (
    <AppStoreProvider>
      <div className="app">
        {/* key forces the fade-in animation per tab change */}
        <main key={nav.tab}>
          <Screens nav={nav} navigate={navigate} />
        </main>
        <TabBar active={nav.tab} onChange={navigate} />
        <PwaLifecycle />
      </div>
    </AppStoreProvider>
  );
}
