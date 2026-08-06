import { useMemo } from 'react';
import {
  Backpack,
  BedDouble,
  BusFront,
  CalendarDays,
  ChevronRight,
  Luggage,
  TriangleAlert,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { DayPlanCard } from '../components/DayPlanCard';
import { TripView } from '../components/TripView';
import { PackingView } from '../components/PackingView';
import { packingSummary } from '../utils/packingModel.mjs';
import { tripPlanSummary } from '../trip/tripModel.mjs';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { STOPS_BY_ID, stopShortName } from '../trail/activeTrailContent';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { formatDistanceKm, formatGrams } from '../utils/format';
import type { NavTarget, PlanSection, TabId } from '../components/TabBar';
import type { ListsDeepLink, NavPayload } from './TodayScreen';

/**
 * Plan — the preparation and personal-data dashboard. Exact composition
 * (a deliberate product decision — tests/plan-screen.test.mjs):
 *
 *   1. Day plan   — full-width soft hero (route + plan in one object)
 *   2. Packing    — full-width dashboard card (progress + weight)
 *   3. Travel & stays | Wallet — two compact tiles side by side
 *
 * Every number restates an EXISTING selector (packingSummary,
 * tripPlanSummary, the wallet document list) — no new derivation layer, no
 * score, and no false zeroes: absent weights say "Weight not set", the
 * essentials warning appears only when essentialNotPacked > 0. Everything
 * behind it is existing local state; no cloud, no account.
 */

export function PlanScreen({
  onOpenSection,
}: {
  onOpenSection: (section: PlanSection) => void;
}) {
  const { state, dayPlan, plannedDays, stages, itinerary } = useStore();
  const wallet = useWalletDocuments();

  const packing = useMemo(() => packingSummary(state.packing), [state.packing]);
  const trip = useMemo(() => tripPlanSummary(state.trip), [state.trip]);

  // Same endpoint derivation as Stages' header (flips with route direction).
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const endStop = itinerary.endStopId ? STOPS_BY_ID[itinerary.endStopId] : null;
  const startName = startStop ? stopShortName(startStop) : 'the start';
  const endName = endStop ? stopShortName(endStop) : 'the end';
  const totalKm = formatDistanceKm(itinerary.statistics.distanceKm);

  // The same collapsed summary Settings used to show for the Day plan: the
  // plan without expanding it — and with no plan, an invitation, never an
  // implication that one exists.
  const dayPlanStatus = dayPlan
    ? `${plannedDays.length} ${plannedDays.length === 1 ? 'day' : 'days'} planned from ${
        formatDateFieldLabel(dayPlan.startDate) ?? dayPlan.startDate
      }`
    : 'Not set up — plan your journey day by day';

  // Pack weight, Lists convention EXACTLY: "≥" marks a lower bound while any
  // item still has no entered weight; no weight entered at all is "not set",
  // NEVER 0 kg. Same rule for the worn side.
  const packWeight =
    packing.weightedGrams > 0
      ? `${packing.weightMissing > 0 ? '≥ ' : ''}${formatGrams(packing.weightedGrams)}`
      : null;
  const wornWeight =
    packing.wornWeightedGrams > 0
      ? `${packing.wornWeightMissing > 0 ? '≥ ' : ''}${formatGrams(packing.wornWeightedGrams)}`
      : null;

  const packingAria =
    packing.total === 0
      ? 'Packing: no items yet. Build your packing list. Opens Packing.'
      : `Packing: ${packing.needed} needed, ${packing.ready} ready, ${packing.packed} packed` +
        (packing.worn > 0 ? `, ${packing.worn} worn` : '') +
        '. Pack weight ' +
        (packWeight
          ? `${packing.weightMissing > 0 ? 'at least ' : ''}${formatGrams(packing.weightedGrams)} from entered weights`
          : 'not set') +
        (wornWeight ? `. Worn weight ${formatGrams(packing.wornWeightedGrams)}` : '') +
        '.' +
        (packing.essentialNotPacked > 0
          ? ` ${packing.essentialNotPacked} essentials still to pack.`
          : '') +
        ' Opens Packing.';

  const walletCount = wallet.status === 'ready' ? wallet.documents.length : null;
  const hasMembership =
    wallet.status === 'ready' &&
    wallet.documents.some((d) => d.category === 'membership');

  return (
    <div className="screen screen--plan plan-screen">
      {/* The copper contour backdrop is rendered by the app shell
          (SectionBackdrop) so it persists across Plan's subroutes. */}
      <ScreenHeader eyebrow="Your trip" title="Plan">
        Plan your days, pack your gear and keep travel details and documents
        close — stored on this device.
      </ScreenHeader>

      <div className="plan-stack">
        {/* 1 — Day plan: route + plan as ONE object, the primary planning
            workspace. Whole card navigates; one text action, no duplicated
            Map/Stages buttons (both are primary tabs already). */}
        <button
          type="button"
          className="card today-glass plan-hero"
          onClick={() => onOpenSection('day')}
          aria-label={`Day plan: Kungsleden, ${startName} to ${endName}, ${stages.length} stages, ${totalKm}. ${dayPlanStatus}. Opens Day plan.`}
        >
          <span className="plan-hero__eyebrow">
            <CalendarDays size={14} strokeWidth={2.1} aria-hidden /> Day plan
          </span>
          <span className="plan-hero__title" aria-hidden>
            {startName} <span className="plan-hero__arrow">→</span> {endName}
          </span>
          <span className="plan-hero__stats tnum" aria-hidden>
            <span>{stages.length} stages</span>
            <span aria-hidden>·</span>
            <span>{totalKm}</span>
          </span>
          <span className="plan-hero__status" aria-hidden>
            {dayPlanStatus}
          </span>
          <span className="plan-hero__action" aria-hidden>
            Open day plan <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
          </span>
        </button>

        {/* 2 — Packing: dashboard card. Progress column + weight column,
            existing packingSummary semantics only. */}
        <button
          type="button"
          className="card today-glass today-glass--light plan-card plan-card--packing"
          onClick={() => onOpenSection('packing')}
          aria-label={packingAria}
        >
          <span className="plan-card__label">
            <Backpack size={14} strokeWidth={2.1} aria-hidden /> Packing
          </span>
          {packing.total === 0 ? (
            <span className="plan-card__empty">
              Build your packing list and track what is ready, packed and
              carried.
            </span>
          ) : (
            <>
              <span className="plan-packing__cols" aria-hidden>
                <span className="plan-packing__col">
                  <span className="plan-packing__colhead">Progress</span>
                  <span className="plan-counts tnum">
                    <span className="plan-count">{packing.needed} Needed</span>
                    <span className="plan-count">{packing.ready} Ready</span>
                    <span className="plan-count">{packing.packed} Packed</span>
                    {packing.worn > 0 ? (
                      <span className="plan-count">{packing.worn} Worn</span>
                    ) : null}
                  </span>
                </span>
                <span className="plan-packing__col">
                  <span className="plan-packing__colhead">Weight</span>
                  <span className="plan-counts tnum">
                    <span className="plan-count">
                      {packWeight ? `Pack ${packWeight}` : 'Not set'}
                    </span>
                    {wornWeight ? (
                      <span className="plan-count">Worn {wornWeight}</span>
                    ) : null}
                  </span>
                </span>
              </span>
              {packing.essentialNotPacked > 0 ? (
                <span className="pill pill-warn plan-card__warn" aria-hidden>
                  <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                  {packing.essentialNotPacked} essential
                  {packing.essentialNotPacked === 1 ? '' : 's'} still to pack
                </span>
              ) : null}
            </>
          )}
        </button>

        {/* 3 — Travel & stays and Wallet: the compact lower row. Separate
            destinations over the SAME local-first stores — trip items
            (transport + stays) vs stored documents. */}
        <div className="plan-tiles">
          <button
            type="button"
            className="card today-glass today-glass--light plan-card plan-card--tile"
            onClick={() => onOpenSection('travel')}
            aria-label={
              trip.total === 0
                ? 'Travel and stays: none added yet. Organize your stays and transport here. Opens Travel and stays.'
                : `Travel and stays: ${trip.travelCount} travel, ${trip.stayCount} stays; ${trip.needed} needed, ${trip.planned} planned, ${trip.confirmed} confirmed. Opens Travel and stays.`
            }
          >
            <span className="plan-card__label">
              <Luggage size={14} strokeWidth={2.1} aria-hidden /> Travel &amp; stays
            </span>
            {trip.total === 0 ? (
              <span className="plan-card__empty">
                Organize your stays and transport here.
              </span>
            ) : (
              <>
                <span className="plan-card__meta tnum" aria-hidden>
                  <span className="plan-pair">
                    <BusFront size={13} strokeWidth={2} aria-hidden /> {trip.travelCount} travel
                  </span>
                  <span className="plan-pair">
                    <BedDouble size={13} strokeWidth={2} aria-hidden /> {trip.stayCount}{' '}
                    {trip.stayCount === 1 ? 'stay' : 'stays'}
                  </span>
                </span>
                <span className="plan-card__sub tnum" aria-hidden>
                  {trip.needed} needed · {trip.planned} planned · {trip.confirmed} confirmed
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            className="card today-glass today-glass--light plan-card plan-card--tile"
            onClick={() => onOpenSection('wallet')}
            aria-label={
              walletCount === null
                ? 'Wallet: opens your stored travel documents.'
                : walletCount === 0
                  ? 'Wallet: empty. Add and organize your bookings, tickets and other travel documents. Opens Wallet.'
                  : `Wallet: ${walletCount} document${walletCount === 1 ? '' : 's'} stored offline on this device${hasMembership ? ', including your membership card' : ''}. Opens Wallet.`
            }
          >
            <span className="plan-card__label">
              <WalletIcon size={14} strokeWidth={2.1} aria-hidden /> Wallet
            </span>
            {walletCount === null ? (
              <span className="plan-card__empty">
                Tickets, bookings and documents.
              </span>
            ) : walletCount === 0 ? (
              <span className="plan-card__empty">
                Add and organize your bookings, tickets and other travel
                documents.
              </span>
            ) : (
              <>
                <span className="plan-card__meta tnum" aria-hidden>
                  {walletCount} document{walletCount === 1 ? '' : 's'}
                </span>
                <span className="plan-card__sub" aria-hidden>
                  {hasMembership
                    ? 'Membership card · offline on this device'
                    : 'Offline on this device'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
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
function initialTripLaunchFor(link?: ListsDeepLink) {
  if (link?.tripItemId) return { kind: 'item' as const, itemId: link.tripItemId };
  if (link?.trackStayPlaceId) {
    return { kind: 'add-stay' as const, placeId: link.trackStayPlaceId };
  }
  if (link?.addTransportEntryId) {
    return { kind: 'add-transport' as const, entryId: link.addTransportEntryId };
  }
  return null;
}

/**
 * Plan → Travel & stays: the trip ITEMS — transport movements and stays,
 * with their attached documents. Deep links arrive as one-shot launches: a
 * place's View/Track stay, and Guide → Transport's Add to Trip / View in
 * Trip — read once at mount; a fresh visit (no payload) opens the plain
 * view. The Trip plan intro's offline/deletion honesty moved to Wallet with
 * the documents it describes.
 */
export function PlanTravelScreen({
  deepLink,
  onNavigate,
}: {
  deepLink?: ListsDeepLink;
  /** Outward navigation: a linked stay's View place → Guide → Stops & places. */
  onNavigate: (tab: NavTarget, payload?: NavPayload) => void;
}) {
  return (
    <div className="screen screen--plan-section">
      <ScreenHeader eyebrow="Your trip" title={'Travel & stays'}>
        Keep your travel, stays and bookings together — how you reach the
        trail, where you sleep, and what is already organised.
      </ScreenHeader>
      <TripView
        view="travel"
        launch={initialTripLaunchFor(deepLink)}
        onViewPlace={(placeId) => onNavigate('huts', { placeId })}
      />
    </div>
  );
}

/**
 * Plan → Wallet: the document-oriented view — tickets, booking
 * confirmations, membership cards and other stored evidence, offline on
 * this device.
 */
export function PlanWalletScreen() {
  return (
    <div className="screen screen--plan-section">
      <ScreenHeader eyebrow="Your trip" title="Wallet">
        Your tickets, bookings and important documents, available offline.
        Documents are stored locally on this device; clearing the browser’s or
        app’s data also removes them.
      </ScreenHeader>
      <TripView view="wallet" />
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
