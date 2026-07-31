import { useStore } from '../store/AppStore';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { STAGES_BY_ID } from '../data/stages';
import { formatDistanceKm } from '../utils/format';
import { isReversed } from '../route/direction.mjs';
import { stageOccurrences } from '../plan/dayPlan.mjs';
import type { NewDayLegCandidate } from '../plan/dayPlan.mjs';

/**
 * The starting-section chooser a day taking on hiking presents when the
 * choice is not obvious: every physically connecting candidate, with the
 * decision facts — oriented route, verified distance, whether it runs
 * against the plan's direction, and whether the plan ALREADY walks that
 * stage (and on which days). Repeating a stage is always this explicit
 * selection; nothing is picked automatically and no other day changes.
 *
 * Shared by the Add-day sheet and the day sheet's hiking toggle so the two
 * surfaces can never describe the same candidate differently.
 */
export function StartLegOptions({
  candidates,
  onChoose,
}: {
  candidates: NewDayLegCandidate[];
  onChoose: (candidate: NewDayLegCandidate) => void;
}) {
  const { dayPlan, plannedDays } = useStore();
  const natural = isReversed(dayPlan?.direction ?? '') ? 'opposite' : 'canonical';
  const stopName = (stopId: string) => {
    const stop = STOPS_BY_ID[stopId];
    return stop ? stopShortName(stop) : stopId;
  };
  const plannedOn = (stageId: string): number[] => [
    ...new Set(
      stageOccurrences(plannedDays, stageId)
        .map((o) => plannedDays.find((d) => d.id === o.dayId)?.number)
        .filter((n): n is number => n != null),
    ),
  ];

  return (
    <ul className="dayplan-options" role="list">
      {candidates.map((candidate) => {
        const days = candidate.alreadyPlanned ? plannedOn(candidate.stageId) : [];
        return (
          <li key={`${candidate.stageId}:${candidate.orientation}`}>
            <button type="button" className="dayplan-option" onClick={() => onChoose(candidate)}>
              <span className="dayplan-option__name">
                {stopName(candidate.fromStopId)} → {stopName(candidate.toStopId)}
              </span>
              <span className="dayplan-option__meta tnum">
                {formatDistanceKm(STAGES_BY_ID[candidate.stageId]?.distanceKm ?? 0)}
                {candidate.orientation !== natural ? ' · walks the section in reverse' : ''}
              </span>
              {candidate.alreadyPlanned ? (
                <span className="dayplan-option__effect">
                  Already planned{days.length > 0 ? ` on day ${days.join(', day ')}` : ''} — choosing
                  it walks the section again
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
