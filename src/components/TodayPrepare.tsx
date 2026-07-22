import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
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
 * trail-readiness aggregate); every card is ONE button that navigates to the
 * screen where the data is actually managed. No editing here, no task lists,
 * no recommendations, no percentages that the underlying models don't define.
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

  return (
    <div className="prepare-stack">
      {/* Route — identifies the journey being prepared. Static route facts
          only; readiness and task status live in the cards below. */}
      <button
        className="today-action-card today-glass today-glass--light prepare-card"
        onClick={() => onNavigate('stages')}
        aria-label={`Route: Kungsleden, ${startName} to ${endName}, ${stages.length} stages, ${totalKm}. Opens Stages.`}
      >
        <span className="today-action-card__body">
          <span className="today-action-card__label">Route</span>
          <span className="today-action-card__title">
            {startName} <span aria-hidden>→</span> {endName}
          </span>
          <span className="prepare-card__meta tnum" aria-hidden>
            {stages.length} stages · {totalKm}
          </span>
        </span>
        <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>

      {/* Packing list — counts of item rows, same aggregate the Lists header
          reads. Weight matches the Lists convention: "≥" marks a lower bound
          while any item still has no entered weight; nothing shown at 0. */}
      <button
        className="today-action-card today-glass today-glass--light prepare-card"
        onClick={() => onNavigate('checklist', { lists: { section: 'packing' } })}
        aria-label={
          packing.total === 0
            ? 'Packing list: no items yet. Opens Lists, Packing.'
            : `Packing list: ${packing.needed} needed, ${packing.ready} ready, ${packing.packed} packed.` +
              (packing.essentialNotPacked > 0
                ? ` ${packing.essentialNotPacked} essential not packed.`
                : ' All essentials packed.') +
              (packing.weightedGrams > 0
                ? ` Pack weight ${packing.weightMissing > 0 ? 'at least ' : ''}${formatGrams(packing.weightedGrams)}.`
                : '') +
              ' Opens Lists, Packing.'
        }
      >
        <span className="today-action-card__body">
          <span className="today-action-card__label">Packing list</span>
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
                  <span className="prepare-card__warn">
                    {packing.essentialNotPacked} essential not packed
                  </span>
                ) : (
                  <span>All essentials packed</span>
                )}
                {packing.weightedGrams > 0 ? (
                  <span>
                    {' · '}
                    {packing.weightMissing > 0 ? '≥ ' : ''}
                    {formatGrams(packing.weightedGrams)}
                  </span>
                ) : null}
              </span>
            </>
          )}
        </span>
        <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>

      <div className="prepare-grid">
        {/* Travel & stays — trip items only (transport + stay); standalone
            documents are excluded by tripPlanSummary itself. */}
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
                <span className="prepare-card__meta tnum" aria-hidden>
                  {trip.travelCount} travel · {trip.stayCount} {trip.stayCount === 1 ? 'stay' : 'stays'}
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
            <span className="today-action-card__label">Trail readiness</span>
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
