import { useMemo } from 'react';
import {
  Backpack,
  BedDouble,
  BusFront,
  CheckCircle2,
  ChevronRight,
  Mountain,
  Route,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useTrailReadiness } from '../hooks/useTrailReadiness';
import { packingSummary } from '../utils/packingModel.mjs';
import { tripPlanSummary } from '../trip/tripModel.mjs';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDistanceKm, formatGrams } from '../utils/format';
import type { NavPayload } from '../screens/TodayScreen';
import type { TabId } from './TabBar';

type Navigate = (t: TabId, payload?: NavPayload) => void;

/**
 * Today — Prepare: the pre-departure dashboard. Read-only summaries over the
 * existing single sources of truth (packing state, trip items, the shared
 * trail-readiness aggregate). The Route hero carries two explicit actions
 * (Map, Stages); every summary card below is ONE button that navigates to
 * the screen where the data is managed. No editing here, no task lists, no
 * recommendations, no percentages the underlying models don't define.
 *
 * Lives in its own module (not TodayScreen.tsx) so the archived-checklist
 * fence on TodayScreen keeps guarding that file's copy while this view may
 * navigate to the Lists tab (internal id 'checklist', routes.mjs).
 */
export function TodayPrepare({ onNavigate }: { onNavigate: Navigate }) {
  const { state, stages, itinerary } = useStore();

  const packing = useMemo(() => packingSummary(state.packing), [state.packing]);
  const trip = useMemo(() => tripPlanSummary(state.trip), [state.trip]);
  const readiness = useTrailReadiness();

  // Same endpoint derivation as Stages' header (flips with route direction).
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const endStop = itinerary.endStopId ? STOPS_BY_ID[itinerary.endStopId] : null;
  const startName = startStop ? stopShortName(startStop) : 'the start';
  const endName = endStop ? stopShortName(endStop) : 'the end';
  const totalKm = formatDistanceKm(itinerary.statistics.distanceKm);

  const readinessStatus = readiness.pending
    ? 'Checking…'
    : readiness.ready
      ? 'Ready'
      : 'Setup needed';

  // Pack weight, Lists convention EXACTLY: "≥" marks a lower bound while any
  // item still has no entered weight; nothing shown at 0. The accessible
  // label spells the ≥ out ("at least … from entered weights"). "≥ x known"
  // was considered and dropped — it wraps at 320px and diverges from Lists.
  const weightText =
    packing.weightedGrams > 0
      ? `${packing.weightMissing > 0 ? '≥ ' : ''}${formatGrams(packing.weightedGrams)}`
      : null;

  return (
    <div className="prepare-stack">
      {/* Route hero — identifies the journey being prepared (spruce anchor,
          compact cousin of the On route day hero). The wrapper itself is NOT
          interactive: Map and Stages are the two explicit sibling actions
          (spatial → glacier, information depth → cloudberry — the same
          semantic pairing as the day hero's View Route / Stage Guide). */}
      <section
        className="prepare-hero"
        aria-label={`Route: Kungsleden, ${startName} to ${endName}, ${stages.length} stages, ${totalKm}.`}
      >
        <span className="hero-day">Route</span>
        <h2 className="prepare-hero__title">
          {startName} <span aria-hidden>→</span> {endName}
        </h2>
        <div className="hero-stats tnum">
          <span>{stages.length} stages</span>
          <span aria-hidden>·</span>
          <span>{totalKm}</span>
        </div>
        <div className="hero-actions">
          <button
            className="hero-action"
            onClick={() => onNavigate('map')}
            aria-label="Map — view the route on the offline map"
          >
            <Route size={15} strokeWidth={2} aria-hidden /> Map
          </button>
          <button
            className="hero-action hero-action--primary"
            onClick={() => onNavigate('stages')}
            aria-label="Stages — open the stage list and day guides"
          >
            <Mountain size={15} strokeWidth={2} aria-hidden /> Stages
          </button>
        </div>
      </section>

      {/* Packing list — counts of item rows, same aggregate the Lists header
          reads. Unpacked essentials are NORMAL before departure, so the line
          stays calm secondary ink here; urgency styling belongs to Lists. */}
      <button
        className="today-action-card today-glass today-glass--light prepare-card"
        onClick={() => onNavigate('checklist', { lists: { section: 'packing' } })}
        aria-label={
          packing.total === 0
            ? 'Packing list: no items yet. Opens Lists, Packing.'
            : `Packing list: ${packing.needed} needed, ${packing.ready} ready, ${packing.packed} packed.` +
              (packing.essentialNotPacked > 0
                ? ` ${packing.essentialNotPacked} essentials still to pack.`
                : ' All essentials packed.') +
              (weightText
                ? ` Pack weight ${packing.weightMissing > 0 ? 'at least ' : ''}${formatGrams(packing.weightedGrams)}${packing.weightMissing > 0 ? ' from entered weights' : ''}.`
                : '') +
              ' Opens Lists, Packing.'
        }
      >
        <span className="today-action-card__body">
          <span className="today-action-card__label">
            <Backpack size={14} strokeWidth={2.1} aria-hidden /> Packing list
          </span>
          {packing.total === 0 ? (
            <span className="today-action-card__title">No items yet</span>
          ) : (
            <>
              <span className="prepare-counts tnum" aria-hidden>
                <span className="prepare-count">{packing.needed} Needed</span>
                <span className="prepare-count__sep" aria-hidden>·</span>
                <span className="prepare-count">{packing.ready} Ready</span>
                <span className="prepare-count__sep" aria-hidden>·</span>
                <span className="prepare-count">{packing.packed} Packed</span>
              </span>
              <span className="prepare-card__meta tnum" aria-hidden>
                {packing.essentialNotPacked > 0 ? (
                  <span>{packing.essentialNotPacked} essentials still to pack</span>
                ) : (
                  <span>All essentials packed</span>
                )}
                {weightText ? <span> · {weightText}</span> : null}
              </span>
            </>
          )}
        </span>
        <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>

      <div className="prepare-grid">
        {/* Travel & stays — trip items only (transport + stay); standalone
            documents are excluded by tripPlanSummary itself. The count icons
            reuse the Trip add-menu pair (BusFront / BedDouble). */}
        <button
          className="today-action-card today-glass today-glass--light prepare-card prepare-card--tile"
          onClick={() => onNavigate('checklist', { lists: { section: 'trip' } })}
          aria-label={
            trip.total === 0
              ? 'Travel and stays: none added yet. Opens Lists, Trip.'
              : `Travel and stays: ${trip.needed} needed, ${trip.planned} planned, ${trip.confirmed} confirmed; ${trip.travelCount} travel, ${trip.stayCount} stays. Opens Lists, Trip.`
          }
        >
          <span className="today-action-card__body">
            <span className="today-action-card__label">Travel &amp; stays</span>
            {trip.total === 0 ? (
              <span className="prepare-card__meta">No travel or stays added</span>
            ) : (
              <>
                <span className="prepare-counts prepare-counts--wrap tnum" aria-hidden>
                  <span className="prepare-count">{trip.needed} Needed</span>
                  <span className="prepare-count">{trip.planned} Planned</span>
                  <span className="prepare-count">{trip.confirmed} Confirmed</span>
                </span>
                <span className="prepare-card__meta prepare-card__meta--icons tnum" aria-hidden>
                  <span className="prepare-pair">
                    <BusFront size={14} strokeWidth={2} aria-hidden /> {trip.travelCount} travel
                  </span>
                  <span className="prepare-count__sep" aria-hidden>·</span>
                  <span className="prepare-pair">
                    <BedDouble size={14} strokeWidth={2} aria-hidden /> {trip.stayCount}{' '}
                    {trip.stayCount === 1 ? 'stay' : 'stays'}
                  </span>
                </span>
              </>
            )}
          </span>
          <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
        </button>

        {/* Trail readiness — the shared Settings aggregate, unchanged criteria.
            The card mirrors the score; the checklist itself stays in Settings. */}
        <button
          className="today-action-card today-glass today-glass--light prepare-card prepare-card--tile"
          onClick={() => onNavigate('settings', { settings: { section: 'readiness' } })}
          aria-label={`Trail readiness: ${readiness.passed} of ${readiness.required} checks ready${
            readiness.pending ? ', still checking' : ''
          }. Opens Settings, Trail readiness.`}
        >
          <span className="today-action-card__body">
            <span className="today-action-card__label">
              <CheckCircle2 size={14} strokeWidth={2.1} aria-hidden /> Trail readiness
            </span>
            <span className="today-action-card__title tnum" aria-hidden>
              {readiness.passed} / {readiness.required} ready
            </span>
            <span className="prepare-card__meta" aria-hidden>
              {readinessStatus}
            </span>
          </span>
          <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
