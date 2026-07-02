import { useState } from 'react';
import { AppStoreProvider } from './store/AppStore';
import { TabBar, type TabId } from './components/TabBar';
import { TodayScreen } from './screens/TodayScreen';
import { MapScreen } from './screens/MapScreen';
import { StagesScreen } from './screens/StagesScreen';
import { HutsScreen } from './screens/HutsScreen';
import { ChecklistScreen } from './screens/ChecklistScreen';
import { JournalScreen } from './screens/JournalScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function Screens({
  tab,
  setTab,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
}) {
  switch (tab) {
    case 'today':
      return <TodayScreen onNavigate={setTab} />;
    case 'map':
      return <MapScreen />;
    case 'stages':
      return <StagesScreen />;
    case 'huts':
      return <HutsScreen />;
    case 'checklist':
      return <ChecklistScreen />;
    case 'journal':
      return <JournalScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

export default function App() {
  // Simple in-memory tab state. A router is intentionally omitted to keep the
  // prototype dependency-light; trade-off is no per-tab deep links / back nav.
  const [tab, setTab] = useState<TabId>('today');

  return (
    <AppStoreProvider>
      <div className="app">
        {/* key forces the fade-in animation per tab change */}
        <main key={tab}>
          <Screens tab={tab} setTab={setTab} />
        </main>
        <TabBar active={tab} onChange={setTab} />
      </div>
    </AppStoreProvider>
  );
}
