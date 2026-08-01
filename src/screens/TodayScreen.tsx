import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { TodayPrepare } from '../components/TodayPrepare';
import { TodayOnRoute } from '../components/TodayOnRoute';
import { resolveTodayArrivalStay } from '../plan/todayArrivalStay.mjs';
import { readTodayMode, saveTodayMode } from '../utils/todayMode.mjs';
import type { TodayMode } from '../utils/todayMode.mjs';
import type { TabId } from '../components/TabBar';
import type { LatLng } from '../types';
import type { ListsDeepLink } from './ListsScreen';
import type { SettingsDeepLinkSection } from './SettingsScreen';

export interface NavPayload {
  /** Stops & places: open this route stop (existing Today/Map deep links). */
  stopId?: string;
  /**
   * Stops & places: open this Journey Place — route stop OR curated
   * off-route place (a linked stay's View place). Generalises `stopId`;
   * when both are present the place id wins.
   */
  placeId?: string;
  mapStageId?: string | null;
  /** Stages: open (and scroll to) this stage's day guide on arrival. */
  guideStageId?: string;
  /**
   * Stages: the opened guide was reached from a planned leg that walks the
   * stage in the OPPOSITE direction. The card then carries a contextual
   * note saying so — the canonical guide itself is never rewritten or
   * presented as editorially reversed (direction-aware guide content is a
   * documented deferral). Presentation context only: the screen still
   * reads no plan data.
   */
  guideReversed?: boolean;
  /** Lists: one-shot deep link into a sub-section (from a Stop's chips). */
  lists?: ListsDeepLink;
  /** Settings: one-shot deep link opening a section (Prepare's readiness card). */
  settings?: { section: SettingsDeepLinkSection };
  /**
   * Map: one-shot "View on map" focus for an experience (from Stages). Geometry
   * comes only from VERIFIED sources — a point, an owner GPX detour route, or the
   * whole Stage (route-wide). The Map shows a temporary highlight; it does NOT
   * enable a persistent experience layer.
   */
  mapFocus?: {
    kind: 'point' | 'route' | 'stage';
    stageId: string;
    label: string;
    coord?: LatLng;
    track?: LatLng[];
    start?: LatLng;
    destination?: LatLng;
    note?: string;
  };
}

type Navigate = (t: TabId, payload?: NavPayload) => void;

/**
 * Decorative topographic-contour background (local SVG, PWA-precached).
 * Subtlety (stroke opacity/width) is baked into the asset; see
 * public/images/today/README.md for how it was produced.
 */
const TODAY_BG_SRC = `${import.meta.env.BASE_URL}images/today/contours.svg`;

/**
 * The two Today contexts. Prepare first (it precedes the hike), On route
 * second — the pre-existing day view and the default when nothing is
 * remembered. The compact header control carries full visible labels
 * (measured to fit beside the title at 320px); no icons — re-evaluated for
 * the 36px glass capsule and rejected again: 14px glyphs + gaps add ~36px
 * of width for meaning the words already carry, and at this size icons
 * compete with the title instead of quieting the control.
 */
const MODE_TABS: { id: TodayMode; label: string }[] = [
  { id: 'prepare', label: 'Prepare' },
  { id: 'onroute', label: 'On route' },
];

export function TodayScreen({ onNavigate }: { onNavigate: Navigate }) {
  // `plannedDays` is EMPTY until the user creates a Day plan. That is the
  // canonical default state, and On route then renders its original,
  // date-independent stage view — no dates, no activity indicators, nothing
  // inferred from trip data or the clock.
  const {
    currentStage,
    routeDirection,
    plannedDays,
    currentPlannedDay: resolvedPlannedDay,
    state,
  } = useStore();
  // The store owns Preview/manual/date resolution. This final presentation
  // fallback can only add one unambiguous linked arrival Stay; it never reads
  // the clock, scans isCurrent or writes Day-plan state.
  const currentPlannedDay = resolveTodayArrivalStay(
    resolvedPlannedDay,
    plannedDays,
    state.trip,
  );

  // Manual mode only — remembered per device (non-versioned UI preference,
  // see utils/todayMode.mjs), never switched by dates, GPS or trip phase.
  const [mode, setMode] = useState<TodayMode>(() => readTodayMode(window.localStorage));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectMode = (next: TodayMode) => {
    setMode(next);
    saveTodayMode(window.localStorage, next);
  };
  // Horizontal tablist keyboard support: arrows move focus AND selection
  // (selection follows focus — the standard segmented-tabs pattern), with a
  // roving tabindex so the control is one Tab stop.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = MODE_TABS.findIndex((t) => t.id === mode);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (current + 1) % MODE_TABS.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + MODE_TABS.length) % MODE_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODE_TABS.length - 1;
    if (next === null || next === current) return;
    e.preventDefault();
    selectMode(MODE_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="screen today-screen">
      {/* Decorative contour layer: behind everything, unmounts with this
          screen. Base colour and sizing live in CSS on the same element. */}
      <div
        className="today-bg"
        aria-hidden
        style={{ '--today-bg-image': `url("${TODAY_BG_SRC}")` } as CSSProperties}
      />

      {/* Prepare | On route lives IN the title row as the header accessory —
          a compact capsule of semantic tabs (never an on/off switch). Both
          modes stay available at all times; no separate selector row. */}
      <ScreenHeader
        eyebrow="Kungsleden"
        title="Today"
        action={
          <div
            className="today-mode"
            role="tablist"
            aria-label="Today view"
            onKeyDown={onTablistKeyDown}
          >
            {MODE_TABS.map((t, i) => (
              <button
                key={t.id}
                id={`today-tab-${t.id}`}
                role="tab"
                aria-selected={mode === t.id}
                aria-controls={`today-panel-${t.id}`}
                tabIndex={mode === t.id ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className="today-mode__tab"
                onClick={() => selectMode(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {mode === 'prepare'
          ? 'Your trip preparation at a glance.'
          : 'Your day at a glance. Everything here works offline.'}
      </ScreenHeader>

      {mode === 'prepare' ? (
        <div
          role="tabpanel"
          id="today-panel-prepare"
          aria-labelledby="today-tab-prepare"
        >
          <TodayPrepare onNavigate={onNavigate} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="today-panel-onroute"
          aria-labelledby="today-tab-onroute"
        >
          <TodayOnRoute
            day={currentPlannedDay}
            plannedDays={plannedDays}
            currentStage={currentStage}
            routeDirection={routeDirection}
            trip={state.trip}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}
