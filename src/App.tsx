import { useState } from 'react';
import { AppStoreProvider } from './store/AppStore';
import {
  FirstLaunchLoader,
  shouldShowFirstLaunchLoader,
} from './components/FirstLaunchLoader';
import { TabBar, type TabId } from './components/TabBar';
import { TodayScreen, type NavPayload } from './screens/TodayScreen';
import { MapScreen } from './screens/MapScreen';
import { StagesScreen } from './screens/StagesScreen';
import { StopsScreen } from './screens/StopsScreen';
import { ListsScreen } from './screens/ListsScreen';
import { JournalScreen } from './screens/JournalScreen';
import { SettingsScreen } from './screens/SettingsScreen';

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
    case 'journal':
      return <JournalScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

export default function App() {
  // Simple in-memory tab state. A router is intentionally omitted to keep the
  // prototype dependency-light; trade-off is no per-tab deep links / back nav.
  const [nav, setNav] = useState<Nav>({ tab: 'today' });
  // Decided once per App mount (App never remounts on tab changes), gated to
  // once per browser session inside the helper.
  const [showIntro] = useState(shouldShowFirstLaunchLoader);

  const navigate = (tab: TabId, payload?: NavPayload) => setNav({ tab, payload });

  return (
    <AppStoreProvider>
      <div className="app">
        {/* key forces the fade-in animation per tab change */}
        <main key={nav.tab}>
          <Screens nav={nav} navigate={navigate} />
        </main>
        <TabBar active={nav.tab} onChange={navigate} />
      </div>
      {showIntro ? <FirstLaunchLoader /> : null}
    </AppStoreProvider>
  );
}
