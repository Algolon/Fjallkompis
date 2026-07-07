import { useEffect, useState } from 'react';
import { AppStoreProvider } from './store/AppStore';
import { startViewportHeightSync } from './utils/viewportHeight.mjs';
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
  // Simple in-memory tab state. A router is intentionally omitted to keep the
  // prototype dependency-light; trade-off is no per-tab deep links / back nav.
  const [nav, setNav] = useState<Nav>({ tab: 'today' });

  // Keep --app-height in sync with the measured viewport so the shell (and
  // the tab bar at its bottom) survives stale dvh after SW-update reloads,
  // background resume, and orientation changes. See viewportHeight.mjs.
  useEffect(() => startViewportHeightSync(), []);

  const navigate = (tab: TabId, payload?: NavPayload) => {
    // Screens swap inside one document, so the previous tab's scroll
    // position would otherwise carry over to the next screen. Reset before
    // the swap; destinations that deep-link (Stops expanding a stop)
    // re-scroll themselves on mount afterwards.
    window.scrollTo(0, 0);
    setNav({ tab, payload });
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
