import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { DayPlanCard } from '../components/DayPlanCard';
import { TripView, type TripLaunch } from '../components/TripView';
import { PackingView } from '../components/PackingView';
import { packingSummary } from '../utils/packingModel.mjs';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import type { NavTarget, PlanSection, TabId } from '../components/TabBar';
import type { ListsDeepLink, NavPayload } from './TodayScreen';

/**
 * Plan — the home of personal preparation: day plan, trip & logistics,
 * packing and the document wallet. Everything behind it is EXISTING local
 * state (the AppStore blob plus the wallet's IndexedDB documents); this
 * screen only indexes it. No cloud, no account — the header says where the
 * data lives, and stays honest about it.
 *
 * The card subtitles double as the readiness summary (plan present?
 * packing progress? saved trip items?) — existing facts restated, no new
 * derivation layer and no score.
 */

interface PlanIndexRow {
  id: string;
  section: PlanSection;
  title: string;
  sub: string;
}

export function PlanScreen({
  onOpenSection,
}: {
  onOpenSection: (section: PlanSection) => void;
}) {
  const { state, dayPlan, plannedDays } = useStore();

  // The same collapsed summary Settings used to show for the Day plan: the
  // plan without expanding it — and with no plan, an invitation, never an
  // implication that one exists.
  const dayPlanSub = dayPlan
    ? `${plannedDays.length} ${plannedDays.length === 1 ? 'day' : 'days'} from ${
        formatDateFieldLabel(dayPlan.startDate) ?? dayPlan.startDate
      }`
    : 'Not set up — plan your journey day by day';

  const packing = packingSummary(state.packing);
  const packingSub =
    packing.packed > 0 || packing.fullyWorn > 0
      ? `${packing.packed}/${packing.total - packing.fullyWorn} packed`
      : `${packing.total} items to pack`;

  const tripCount = state.trip.length;
  const tripSub =
    tripCount > 0
      ? `${tripCount} saved ${tripCount === 1 ? 'item' : 'items'} — travel, stays and bookings`
      : 'Keep travel, stays and bookings in one place';

  const rows: PlanIndexRow[] = [
    { id: 'day', section: 'day', title: 'Day plan', sub: dayPlanSub },
    { id: 'trip', section: 'trip', title: 'Trip & logistics', sub: tripSub },
    { id: 'packing', section: 'packing', title: 'Packing', sub: packingSub },
    {
      id: 'wallet',
      section: 'trip',
      title: 'Wallet & documents',
      sub: 'Tickets, bookings and membership cards — with your Trip plan',
    },
  ];

  return (
    <div className="screen screen--plan">
      <ScreenHeader eyebrow="Your trip" title="Plan">
        Your route, preparation and saved travel details — stored on this
        device.
      </ScreenHeader>

      <nav className="stack" aria-label="Plan sections">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="card index-row"
            onClick={() => onOpenSection(row.section)}
          >
            <span className="index-row__main">
              <span className="index-row__title">{row.title}</span>
              <span className="index-row__sub">{row.sub}</span>
            </span>
            <ChevronRight className="index-row__chevron" size={20} aria-hidden />
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * Plan → Day plan: the personal journey planner that lived in a Settings
 * accordion. The card (including its Preview action, which opens the
 * previewed day on Today) is unchanged.
 */
export function PlanDayScreen({
  onNavigate,
}: {
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <div className="screen screen--plan-section">
      <ScreenHeader eyebrow="Your trip" title="Day plan">
        Plan your journey day by day — which stage you walk each day, where
        each day ends, and your travel and rest days.
      </ScreenHeader>
      <DayPlanCard onNavigate={onNavigate} />
    </div>
  );
}

/** Which one-shot Trip launch a deep-link payload carries, if any. */
function initialTripLaunchFor(link?: ListsDeepLink): TripLaunch | null {
  if (link?.tripItemId) return { kind: 'item', itemId: link.tripItemId };
  if (link?.trackStayPlaceId) {
    return { kind: 'add-stay', placeId: link.trackStayPlaceId };
  }
  if (link?.addTransportEntryId) {
    return { kind: 'add-transport', entryId: link.addTransportEntryId };
  }
  return null;
}

/**
 * Plan → Trip plan: travel, stays and documents (the wallet lives in its
 * Documents section). Deep links arrive as one-shot launches: a place's
 * View/Track stay, and Guide → Transport's Add to Trip / View in Trip —
 * the same launches Lists used to hand over internally, now carried by the
 * navigation payload. One-shot by construction: the launch is read once at
 * mount, and a fresh visit (no payload) opens the plain Trip plan.
 */
export function PlanTripScreen({
  deepLink,
  onNavigate,
}: {
  deepLink?: ListsDeepLink;
  /** Outward navigation: a linked stay's View place → Guide → Stops & places. */
  onNavigate: (tab: NavTarget, payload?: NavPayload) => void;
}) {
  const [launch] = useState<TripLaunch | null>(() =>
    initialTripLaunchFor(deepLink),
  );
  return (
    <div className="screen screen--plan-section">
      <ScreenHeader eyebrow="Your trip" title="Trip plan">
        Keep your travel, stays, bookings and important documents together and
        available offline. Documents are stored locally on this device;
        clearing the browser’s or app’s data also removes them.
      </ScreenHeader>
      <TripView
        launch={launch}
        onViewPlace={(placeId) => onNavigate('huts', { placeId })}
      />
    </div>
  );
}

/** Plan → Packing: the packing list, unchanged, behind its own route. */
export function PlanPackingScreen() {
  return (
    <div className="screen screen--plan-section">
      <ScreenHeader eyebrow="Your trip" title="Packing">
        Your packing list — one big job before you go. Adapt it to your own
        gear and tick things off as they land in the pack.
      </ScreenHeader>
      <PackingView />
    </div>
  );
}
