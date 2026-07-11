import { useEffect, useRef, useState } from 'react';
import { AppStoreProvider } from './store/AppStore';
import { startViewportHeightSync } from './utils/viewportHeight.mjs';
import {
  attemptPhonePortraitLock,
  readPhoneLandscape,
  watchPhoneLandscape,
} from './utils/orientationGuard.mjs';
import { DEFAULT_TAB, hashForTab, tabForHash } from './navigation/routes.mjs';
import { RotateGuard } from './components/RotateGuard';
import { TabBar, type TabId } from './components/TabBar';
import { TodayScreen, type NavPayload } from './screens/TodayScreen';
import { MapScreen } from './screens/MapScreen';
import { StagesScreen } from './screens/StagesScreen';
import { StopsScreen } from './screens/StopsScreen';
import { ListsScreen } from './screens/ListsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PwaLifecycle } from './components/PwaLifecycle';
import { INITIAL_MAP_VIEW_STAGE_ID } from './map/mapDefaults.mjs';

interface Nav {
  tab: TabId;
  /** One-shot payload consumed by the destination screen on mount. */
  payload?: NavPayload;
}

function Screens({
  nav,
  navigate,
  mapViewStageId,
  setMapViewStageId,
}: {
  nav: Nav;
  navigate: (t: TabId, payload?: NavPayload) => void;
  mapViewStageId: string | null;
  setMapViewStageId: (stageId: string | null) => void;
}) {
  switch (nav.tab) {
    case 'today':
      return <TodayScreen onNavigate={navigate} />;
    case 'map':
      // Focused callback (not the whole router): the map's anchored stop
      // preview opens the stop's full detail in Huts & Stations via the
      // existing destination + one-shot payload pattern.
      return (
        <MapScreen
          viewStageId={mapViewStageId}
          onViewStageChange={setMapViewStageId}
          onOpenStop={(stopId) => navigate('huts', { stopId })}
        />
      );
    case 'stages':
      return <StagesScreen />;
    case 'huts':
      return <StopsScreen initialStopId={nav.payload?.stopId ?? null} />;
    case 'checklist':
      // Historical internal tab id — the user-facing destination is 'Lists'
      // (#/lists), which is the packing list since the Daily checklist was
      // archived (docs/archived-features/daily-checklist.md).
      return <ListsScreen />;
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
  // In-memory only: direct/fresh Map opens show the full route, while a
  // stage chosen via Today or the Map selector survives tab switches until
  // the app is refreshed.
  const [mapViewStageId, setMapViewStageId] = useState<string | null>(
    INITIAL_MAP_VIEW_STAGE_ID,
  );
  // Read by the hashchange handler without re-subscribing per navigation.
  const navRef = useRef(nav);
  navRef.current = nav;

  // Keep --app-height in sync with the measured viewport so the shell (and
  // the tab bar at its bottom) survives stale dvh after SW-update reloads,
  // background resume, and orientation changes. See viewportHeight.mjs.
  useEffect(() => startViewportHeightSync(), []);

  // Phones are portrait-only (product decision). The classifier is
  // capability- and space-based, never user-agent based; while the guard
  // is up the app tree stays mounted (nav, screen state, GPS/tracking and
  // the MapLibre instance all survive rotation). See orientationGuard.mjs.
  const shellRef = useRef<HTMLDivElement>(null);
  const [phoneLandscape, setPhoneLandscape] = useState(() =>
    readPhoneLandscape(),
  );
  useEffect(() => watchPhoneLandscape(setPhoneLandscape), []);
  // Best-effort portrait lock for installed phone PWAs — progressive
  // enhancement only; the RotateGuard is the canonical enforcement.
  useEffect(() => {
    attemptPhonePortraitLock();
  }, []);

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
    if (tab === 'map' && 'mapStageId' in (payload ?? {})) {
      setMapViewStageId(payload?.mapStageId ?? null);
    }
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
      <div className="app" ref={shellRef}>
        {/* Two instances of the SAME navigation (shared route table, active
            state and handler); CSS displays exactly one per viewport. The
            rail sits before <main> so that on tablet/desktop the keyboard
            focus order matches the visual order (nav left, content right);
            the bar sits after <main>, exactly where production mobile has
            always had it. The hidden instance is display:none — out of
            layout, tab order and the accessibility tree. */}
        <TabBar active={nav.tab} onChange={navigate} variant="rail" />
        {/* key forces the fade-in animation per tab change */}
        <main key={nav.tab}>
          <Screens
            nav={nav}
            navigate={navigate}
            mapViewStageId={mapViewStageId}
            setMapViewStageId={setMapViewStageId}
          />
        </main>
        <TabBar active={nav.tab} onChange={navigate} variant="bar" />
        <PwaLifecycle />
      </div>
      {/* Outside .app so the shell's inert state never affects the guard. */}
      <RotateGuard active={phoneLandscape} shellRef={shellRef} />
    </AppStoreProvider>
  );
}
