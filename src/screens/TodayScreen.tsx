import { type CSSProperties } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { TodayOnRoute } from '../components/TodayOnRoute';
import { resolveTodayArrivalStay } from '../plan/todayArrivalStay.mjs';
import type { NavTarget } from '../components/TabBar';
import type { LatLng, ShopCategory, TransportContext } from '../types';

/**
 * Lists-era section ids — still the deep-link payload vocabulary for the
 * sections that used to live under Lists. The navigation resolver
 * (navigation/resolveNavTarget.mjs) maps them onto their vNext owners:
 * shops/transport → Guide, trip → Plan (Travel & stays), packing → Plan.
 */
export type ListsSection = 'packing' | 'shops' | 'transport' | 'trip';

/**
 * One-shot deep-link payload into a Lists-era sub-section (from a Stop's
 * Shop / transport chips, a stop's Track stay action, or Guide → Transport's
 * Trip launches). In-memory only — a fresh visit or refresh opens the plain
 * destination.
 */
export interface ListsDeepLink {
  section?: ListsSection;
  /** Shops opens this shop-TYPE category (from a Stop's Shop chip). */
  shopType?: ShopCategory;
  transportId?: string;
  transportContext?: TransportContext;
  /** Trip opens this item's editor (from a place's View stay action). */
  tripItemId?: string;
  /** Trip opens a prefilled Stay form for this Journey Place (Track stay). */
  trackStayPlaceId?: string;
  /** Trip opens a prefilled personal transport form (Transport's Add to Trip). */
  addTransportEntryId?: string;
}

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
  /** Stages: open every guide belonging to a combined planned hiking day. */
  guideStageIds?: string[];
  /**
   * Stages: the opened guide was reached from a planned leg that walks the
   * stage in the OPPOSITE direction. The card then carries a contextual
   * note saying so — the canonical guide itself is never rewritten or
   * presented as editorially reversed (direction-aware guide content is a
   * documented deferral). Presentation context only: the screen still
   * reads no plan data.
   */
  guideReversed?: boolean;
  /** Combined-day equivalent of guideReversed, keyed by physical stage id. */
  guideReversedStageIds?: string[];
  /** Lists: one-shot deep link into a sub-section (from a Stop's chips). */
  lists?: ListsDeepLink;
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
    /** Separate verified tracks; never joined with synthetic connectors. */
    tracks?: LatLng[][];
    start?: LatLng;
    destination?: LatLng;
    note?: string;
  };
}

type Navigate = (t: NavTarget, payload?: NavPayload) => void;

/**
 * Decorative topographic-contour background (local SVG, PWA-precached).
 * Subtlety (stroke opacity/width) is baked into the asset; see
 * public/images/today/README.md for how it was produced.
 */
const TODAY_BG_SRC = `${import.meta.env.BASE_URL}images/today/contours.svg`;

/**
 * Today — the operational projection of the current relevant day, and the
 * shell's centre destination. vNext removed the old second header mode:
 * Today no longer owns pre-trip dashboards (those live on Plan); it always
 * renders the operational day view, which itself covers every day shape —
 * before the trip, hiking, travel and rest days, after the plan, and no
 * plan at all (the original date-independent stage view).
 */
export function TodayScreen({ onNavigate }: { onNavigate: Navigate }) {
  // `plannedDays` is EMPTY until the user creates a Day plan. That is the
  // canonical default state, and Today then renders its original,
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
  // the clock, scans derived progress flags or writes Day-plan state.
  const currentPlannedDay = resolveTodayArrivalStay(
    resolvedPlannedDay,
    plannedDays,
    state.trip,
  );

  return (
    <div className="screen today-screen">
      {/* Decorative contour layer: behind everything, unmounts with this
          screen. Base colour and sizing live in CSS on the same element. */}
      <div
        className="today-bg"
        aria-hidden
        style={{ '--today-bg-image': `url("${TODAY_BG_SRC}")` } as CSSProperties}
      />

      <ScreenHeader eyebrow="Kungsleden" title="Today">
        Your day at a glance. Everything here works offline.
      </ScreenHeader>

      <TodayOnRoute
        day={currentPlannedDay}
        plannedDays={plannedDays}
        currentStage={currentStage}
        routeDirection={routeDirection}
        trip={state.trip}
        onNavigate={onNavigate}
      />
    </div>
  );
}
