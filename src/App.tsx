import { useEffect, useRef, useState } from 'react';
import { AppStoreProvider, useStore } from './store/AppStore';
import { startViewportHeightSync } from './utils/viewportHeight.mjs';
import {
  attemptPhonePortraitLock,
  readPhoneLandscape,
  watchPhoneLandscape,
} from './utils/orientationGuard.mjs';
import {
  DEFAULT_TAB,
  destinationForHash,
  hashForDestination,
} from './navigation/routes.mjs';
import { resolveNavTarget } from './navigation/resolveNavTarget.mjs';
import { RotateGuard } from './components/RotateGuard';
import {
  TabBar,
  type NavTarget,
  type SectionId,
  type TabId,
} from './components/TabBar';
import { SectionShell } from './components/SectionShell';
import {
  SectionBackdrop,
  type SectionThemeId,
} from './components/SectionBackdrop';
import { TodayScreen, type NavPayload } from './screens/TodayScreen';
import { MapScreen } from './screens/MapScreen';
import { StagesScreen } from './screens/StagesScreen';
import { StopsScreen } from './screens/StopsScreen';
import {
  GuideScreen,
  GuideShopsScreen,
  GuideTransportScreen,
} from './screens/GuideScreen';
import {
  PlanScreen,
  PlanDayScreen,
  PlanPackingScreen,
  PlanTravelScreen,
  PlanWalletScreen,
} from './screens/PlanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PwaLifecycle } from './components/PwaLifecycle';
import { INITIAL_MAP_VIEW_STAGE_ID } from './map/mapDefaults.mjs';

interface Nav {
  tab: TabId;
  /** Guide/Plan sub-destination; null is the tab's home. Part of the hash. */
  section: SectionId | null;
  /** One-shot payload consumed by the destination screen on mount. */
  payload?: NavPayload;
  /**
   * True when this destination was reached from a DIFFERENT tab. The shell
   * then suppresses the destination screen's content fade (see the <main>
   * className + section-themes.css): the persistent SectionBackdrop swaps
   * instantly on tab changes, so a content fade from 0 would expose a
   * full-strength standalone backdrop for ~200 ms — the physical-device
   * "contours over the cards" flash. Within-tab navigation keeps the fade
   * (the backdrop is the SAME surface throughout, so the fade reads as one
   * composed page). Stable for the lifetime of a destination: re-selecting
   * the current destination preserves it, so a settled screen's animation
   * state never flips without a remount.
   */
  freshTab?: boolean;
}

function Screens({
  nav,
  navigate,
  openSection,
  mapViewStageId,
  setMapViewStageId,
}: {
  nav: Nav;
  navigate: (t: NavTarget, payload?: NavPayload) => void;
  /** Guide/Plan internal navigation: home ↔ section (null = back home). */
  openSection: (tab: 'guide' | 'plan', section: SectionId | null) => void;
  mapViewStageId: string | null;
  setMapViewStageId: (stageId: string | null) => void;
}) {
  switch (nav.tab) {
    case 'today':
      return <TodayScreen onNavigate={navigate} />;
    case 'map':
      // Focused callback (not the whole router): the map's anchored stop
      // preview opens the stop's full detail in Guide → Stops & places via
      // the existing destination + one-shot payload pattern.
      return (
        <MapScreen
          viewStageId={mapViewStageId}
          onViewStageChange={setMapViewStageId}
          onOpenStop={(stopId) => navigate('huts', { stopId })}
          focus={nav.payload?.mapFocus ?? null}
        />
      );
    case 'guide':
      switch (nav.section) {
        case 'stages':
          // Today's "Stage Guide" action deep-links to the current stage's
          // open day guide (same one-shot payload pattern as Stops'
          // initialPlaceId); "View on map" deep-links to the Map.
          return (
            <SectionShell label="Guide" onBack={() => openSection('guide', null)}>
              <StagesScreen
                initialGuideStageId={nav.payload?.guideStageId ?? null}
                initialGuideStageIds={nav.payload?.guideStageIds}
                initialGuideReversed={nav.payload?.guideReversed === true}
                initialGuideReversedStageIds={nav.payload?.guideReversedStageIds}
                onNavigate={navigate}
              />
            </SectionShell>
          );
        case 'stops':
          // `placeId` (route stop OR curated off-route place — a stay's View
          // place) generalises the older stop-only `stopId`, which existing
          // Today/Map deep links still send.
          return (
            <SectionShell label="Guide" onBack={() => openSection('guide', null)}>
              <StopsScreen
                initialPlaceId={nav.payload?.placeId ?? nav.payload?.stopId ?? null}
                onNavigate={navigate}
              />
            </SectionShell>
          );
        case 'shops':
          return (
            <SectionShell label="Guide" onBack={() => openSection('guide', null)}>
              <GuideShopsScreen initialShopType={nav.payload?.lists?.shopType} />
            </SectionShell>
          );
        case 'transport':
          return (
            <SectionShell label="Guide" onBack={() => openSection('guide', null)}>
              <GuideTransportScreen
                initialEntryId={nav.payload?.lists?.transportId}
                initialContext={nav.payload?.lists?.transportContext}
                onNavigate={navigate}
              />
            </SectionShell>
          );
        default:
          return <GuideScreen onOpenSection={(s) => openSection('guide', s)} />;
      }
    case 'plan':
      switch (nav.section) {
        case 'day':
          return (
            <SectionShell label="Plan" onBack={() => openSection('plan', null)}>
              <PlanDayScreen onNavigate={navigate} />
            </SectionShell>
          );
        case 'packing':
          return (
            <SectionShell label="Plan" onBack={() => openSection('plan', null)}>
              <PlanPackingScreen />
            </SectionShell>
          );
        case 'travel':
          return (
            <SectionShell label="Plan" onBack={() => openSection('plan', null)}>
              <PlanTravelScreen deepLink={nav.payload?.lists} onNavigate={navigate} />
            </SectionShell>
          );
        case 'wallet':
          return (
            <SectionShell label="Plan" onBack={() => openSection('plan', null)}>
              <PlanWalletScreen />
            </SectionShell>
          );
        default:
          return <PlanScreen onOpenSection={(s) => openSection('plan', s)} />;
      }
    case 'settings':
      // Today Prepare's readiness card deep-links to the Trail readiness
      // section (same one-shot payload pattern as Guide/Plan sections).
      // Settings navigates OUT for exactly one thing: nothing anymore —
      // the Day plan (and its Preview) moved to Plan.
      return (
        <SettingsScreen
          initialSection={nav.payload?.settings?.section ?? null}
        />
      );
  }
}

export default function App() {
  // The provider must wrap the shell so the shell can read the active
  // direction (to reset the in-memory Map browse state when it changes).
  return (
    <AppStoreProvider>
      <AppShell />
    </AppStoreProvider>
  );
}

function AppShell() {
  // Hash-routed destination state (#/today … #/plan/packing, see
  // navigation/routes.mjs): Back/Forward work, refresh keeps the destination
  // (a refresh on #/guide/stages reopens Stages, never an empty home), and
  // every destination is bookmarkable — no router dependency, and safe on
  // the GitHub Pages project subpath. One-shot payloads stay in React memory
  // only; a restored/bookmarked URL opens the plain destination.
  const [nav, setNav] = useState<Nav>(() => {
    const dest = destinationForHash(window.location.hash);
    return dest ?? { tab: DEFAULT_TAB, section: null };
  });
  // In-memory only: direct/fresh Map opens show the full route, while a
  // stage chosen via Today or the Map selector survives tab switches until
  // the app is refreshed.
  const [mapViewStageId, setMapViewStageId] = useState<string | null>(
    INITIAL_MAP_VIEW_STAGE_ID,
  );
  // Read by the hashchange handler without re-subscribing per navigation.
  const navRef = useRef(nav);
  navRef.current = nav;

  // When the walking direction changes, the whole app re-derives from the new
  // active itinerary reactively (no reload). Two pieces of transient IN-MEMORY
  // browse state are not itinerary-derived and must be reset here so nothing
  // stale survives: the Map's browsed stage (reset to the full-route overview)
  // and any one-shot deep-link payload (dropped; the destination — tab AND
  // section — stays). Persisted data — packing, journal, stop notes, current
  // stage, downloaded maps — is untouched.
  const { routeDirection } = useStore();
  const prevDirectionRef = useRef(routeDirection);
  useEffect(() => {
    if (prevDirectionRef.current === routeDirection) return;
    prevDirectionRef.current = routeDirection;
    setMapViewStageId(INITIAL_MAP_VIEW_STAGE_ID);
    // freshTab survives: the destination did not change, so its screen's
    // animation state must not flip (see the Nav.freshTab contract).
    setNav((n) =>
      n.payload ? { tab: n.tab, section: n.section, freshTab: n.freshTab } : n,
    );
  }, [routeDirection]);

  // Keep --app-height in sync with the real canvas so the shell (and the tab
  // bar at its bottom) fills the display on both misbehaving mobile
  // platforms: Android Chrome's stale/oversized dvh after SW-update reloads,
  // background resume and rotation, and Apple standalone's under-reported
  // visualViewport under viewport-fit=cover (which otherwise leaves a blank
  // band below the tab bar). See viewportHeight.mjs for the per-platform
  // authority and the WebKit bug reference.
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
    // start destination; a legacy alias → its canonical hash) without adding
    // a history entry.
    const canonical = hashForDestination(navRef.current);
    if (window.location.hash !== canonical) {
      window.history.replaceState(null, '', canonical);
    }

    // Back/Forward (and hand-edited hashes). navigate() below also fires
    // this after setting state; the destination-equality guard makes that a
    // no-op, which is what preserves its one-shot payload.
    const onHashChange = () => {
      const dest = destinationForHash(window.location.hash);
      if (dest === null) {
        // Unknown hash typed/pasted: fall back safely, replacing the bad
        // entry rather than stacking it in history.
        window.history.replaceState(null, '', hashForDestination(navRef.current));
        return;
      }
      // A legacy alias (#/stages, #/stops, #/lists) resolved to its new
      // destination: show the canonical address without stacking history.
      const canonicalHash = hashForDestination(dest);
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(null, '', canonicalHash);
      }
      if (
        dest.tab === navRef.current.tab &&
        dest.section === navRef.current.section
      ) {
        return;
      }
      window.scrollTo(0, 0);
      setNav({
        tab: dest.tab,
        section: dest.section,
        freshTab: dest.tab !== navRef.current.tab,
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /** Set the destination + one-shot payload, then reflect it in the hash. */
  const navigateToDestination = (
    tab: TabId,
    section: SectionId | null,
    payload?: NavPayload,
  ) => {
    // Screens swap inside one document, so the previous screen's scroll
    // position would otherwise carry over to the next screen. Reset before
    // the swap; destinations that deep-link (Stops expanding a stop)
    // re-scroll themselves on mount afterwards.
    window.scrollTo(0, 0);
    setNav((prev) => ({
      tab,
      section,
      payload,
      // Cross-tab arrivals suppress the content fade; re-selecting the SAME
      // destination (identical key → no remount) preserves the flag so the
      // settled screen's animation property never changes in place — which
      // would restart the fade on an already-visible screen.
      freshTab:
        tab !== prev.tab ||
        (section === prev.section && prev.freshTab === true),
    }));
    // Push the destination onto history AFTER state is queued: the
    // resulting hashchange sees the same destination and leaves the payload
    // alone. Re-selecting the current destination must not stack duplicates.
    const hash = hashForDestination({ tab, section });
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  const navigate = (target: NavTarget, payload?: NavPayload) => {
    // One resolver maps every navigate() target — including the historical
    // internal ids screen wiring still passes — onto the five-tab shell.
    const { tab, section } = resolveNavTarget(target, payload);
    if (tab === 'map' && 'mapStageId' in (payload ?? {})) {
      setMapViewStageId(payload?.mapStageId ?? null);
    }
    // "View on map": a full-stage focus selects the Stage (whole route framed +
    // highlighted). A point/route focus DESELECTS the stage (→ overview), so the
    // stage never re-fits the camera and buries the detour — the
    // focusRoute/focusPoint bounds fit the geometry itself.
    if (tab === 'map' && payload?.mapFocus) {
      setMapViewStageId(
        payload.mapFocus.kind === 'stage' ? payload.mapFocus.stageId : null,
      );
    }
    navigateToDestination(tab, section, payload);
  };

  // Section colour identity (section-themes.css): Guide is glacier, Plan is
  // cloudberry/copper. ONE class on the shell drives every semantic token —
  // the SectionShell subnav, the home screen and all subroutes inherit it;
  // no component checks the pathname. The bottom navigation is deliberately
  // NOT themed: all ordinary tabs share one neutral active treatment, and
  // Today's spruce centre disc stays the only differentiated item. Today,
  // Map and Settings run unthemed (spruce is the neutral default).
  const sectionTheme: SectionThemeId | null =
    nav.tab === 'guide' || nav.tab === 'plan' ? nav.tab : null;

  return (
    <>
      <div
        className={`app${sectionTheme ? ` theme-${sectionTheme}` : ''}`}
        ref={shellRef}
      >
        {/* Two instances of the SAME navigation (shared route table, active
            state and handler); CSS displays exactly one per viewport. The
            rail sits before <main> so that on tablet/desktop the keyboard
            focus order matches the visual order (nav left, content right);
            the bar sits after <main>, exactly where production mobile has
            always had it. The hidden instance is display:none — out of
            layout, tab order and the accessibility tree. Tapping the active
            Guide/Plan tab from a section returns to that tab's home (the
            resolver yields section null), the standard pop-to-root idiom. */}
        <TabBar active={nav.tab} onChange={navigate} variant="rail" />
        {/* The section's contour backdrop lives OUTSIDE the keyed <main>
            remount so it persists across home ↔ subroute navigation — no
            flicker, no re-request, no first-frame resize. */}
        {sectionTheme ? <SectionBackdrop section={sectionTheme} /> : null}
        {/* key forces the fade-in animation per destination change; a
            cross-tab arrival mounts COMPOSED instead (no content fade), so
            the instantly-swapped backdrop is never exposed behind
            near-transparent UI — see Nav.freshTab. */}
        <main
          key={`${nav.tab}${nav.section ? `-${nav.section}` : ''}`}
          className={nav.freshTab ? 'main-tab-switch' : undefined}
        >
          <Screens
            nav={nav}
            navigate={navigate}
            openSection={(tab, section) => navigateToDestination(tab, section)}
            mapViewStageId={mapViewStageId}
            setMapViewStageId={setMapViewStageId}
          />
        </main>
        <TabBar active={nav.tab} onChange={navigate} variant="bar" />
        <PwaLifecycle />
      </div>
      {/* Outside .app so the shell's inert state never affects the guard. */}
      <RotateGuard active={phoneLandscape} shellRef={shellRef} />
    </>
  );
}
