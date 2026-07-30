import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { DateField } from './DateField';
import { ConfirmDialog } from './ConfirmDialog';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDistanceKm, formatHoursEstimate } from '../utils/format';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';

/**
 * Hiking days — the personal day plan, configured in Settings.
 *
 * Canonical STAGES are fixed geographical segments and are never changed here.
 * This card only decides how those stages are DIVIDED across calendar days: a
 * boundary between two adjacent stages either ends a hiking day or does not.
 * Combining and splitting are therefore the same control in two states, so
 * every edit is reversible with the identical tap.
 *
 * A boundary is deliberately NOT framed as sleeping at a hut — the user may
 * stay there, camp nearby, or simply use the canonical junction as the end of
 * the day's walking. The copy talks about ending the day, never about
 * overnighting.
 */
export function HikingDaysCard() {
  const {
    dayPlan,
    plannedDays,
    dayPlanIsDefault,
    currentPlannedDay,
    setFirstHikingDate,
    toggleDayBoundary,
    resetDayPlan,
    removeDayPlan,
    activatePlannedDay,
  } = useStore();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const shortName = (stopId: string) => {
    const stop = STOPS_BY_ID[stopId];
    return stop ? stopShortName(stop) : stopId;
  };

  if (!dayPlan) {
    return (
      <>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Plan how the route stages are divided across your hiking days. The
          stages themselves, their guides and their route data never change.
        </p>
        <DateField
          label="First hiking day"
          dialogTitle="First hiking day"
          value=""
          onChange={setFirstHikingDate}
          style={{ marginTop: 12 }}
        />
        <p className="card-sub" style={{ marginTop: 8 }}>
          Choosing a date creates a plan with one stage per day. You can then
          combine adjacent stages into a single day.
        </p>
      </>
    );
  }

  const lastDay = plannedDays[plannedDays.length - 1];
  const firstLabel = formatDateFieldLabel(dayPlan.firstDate);
  const lastLabel = lastDay?.date ? formatDateFieldLabel(lastDay.date) : null;

  return (
    <>
      <p className="card-sub" style={{ marginTop: 0 }}>
        Plan how the route stages are divided across your hiking days. The
        stages themselves, their guides and their route data never change.
      </p>

      <DateField
        label="First hiking day"
        dialogTitle="First hiking day"
        value={dayPlan.firstDate}
        onChange={setFirstHikingDate}
        style={{ marginTop: 12 }}
      />

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="pill tnum">
          {plannedDays.length} hiking {plannedDays.length === 1 ? 'day' : 'days'}
        </span>
        {firstLabel && lastLabel ? (
          <span className="pill tnum">
            {firstLabel} – {lastLabel}
          </span>
        ) : null}
        {/* The days partition the whole route, so their distances add back up
            to it — no separate route total to disagree with. */}
        <span className="pill tnum">
          {formatDistanceKm(plannedDays.reduce((sum, d) => sum + d.distanceKm, 0))}
        </span>
      </div>
      <p className="card-sub" style={{ marginTop: 8 }}>
        Dates assume you hike on consecutive days.
      </p>

      <div className="dayplan" style={{ marginTop: 14 }}>
        {plannedDays.map((day, i) => (
          <DayPlanDay
            key={day.number}
            day={day}
            // Global stage index of the day's first stage, in walking order.
            firstStageIndex={plannedDays
              .slice(0, i)
              .reduce((n, d) => n + d.stages.length, 0)}
            isLast={i === plannedDays.length - 1}
            isCurrent={currentPlannedDay?.number === day.number}
            shortName={shortName}
            onToggleBoundary={toggleDayBoundary}
            onActivate={() => activatePlannedDay(day.index)}
          />
        ))}
      </div>

      <button
        type="button"
        className="btn btn-block"
        style={{ marginTop: 14 }}
        disabled={dayPlanIsDefault}
        onClick={resetDayPlan}
      >
        Reset to one stage per day
      </button>
      <button
        type="button"
        className="btn btn-danger btn-block"
        style={{ marginTop: 10 }}
        onClick={() => setConfirmRemove(true)}
      >
        Remove hiking days
      </button>

      {confirmRemove ? (
        <ConfirmDialog
          title="Remove hiking days?"
          body="Your hiking days and their dates are deleted. The route stages, your current stage, packing list, Trip plan, journal and stop notes are not affected."
          primaryLabel="Remove"
          destructive
          onConfirm={() => {
            removeDayPlan();
            setConfirmRemove(false);
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </>
  );
}

/** One planned day, its canonical stage parts, and the boundaries around them. */
function DayPlanDay({
  day,
  firstStageIndex,
  isLast,
  isCurrent,
  shortName,
  onToggleBoundary,
  onActivate,
}: {
  day: PlannedDay;
  firstStageIndex: number;
  isLast: boolean;
  isCurrent: boolean;
  shortName: (stopId: string) => string;
  onToggleBoundary: (stageIndex: number) => void;
  onActivate: () => void;
}) {
  const dateLabel = day.date ? formatDateFieldLabel(day.date) : null;
  const multi = day.stages.length > 1;
  const dayRoute = `${shortName(day.fromStopId)} → ${shortName(day.toStopId)}`;

  return (
    <>
      <article className={`dayplan-day${isCurrent ? ' is-current' : ''}`}>
        <div className="dayplan-day__top">
          <span className="dayplan-day__label tnum">
            Day {day.number}
            {dateLabel ? <span className="dayplan-day__date"> · {dateLabel}</span> : null}
          </span>
          {isCurrent ? (
            <span className="pill pill-current">
              <span className="dot" /> Current
            </span>
          ) : (
            <button
              type="button"
              className="stage-set-pill"
              onClick={onActivate}
              aria-label={`Make day ${day.number}, ${dayRoute}, the current hiking day`}
            >
              Set as current
            </button>
          )}
        </div>

        <h3 className="dayplan-day__route">{dayRoute}</h3>
        {multi ? (
          <p className="dayplan-day__via">
            via {day.viaStopIds.map(shortName).join(' and ')}
          </p>
        ) : null}

        <div className="row dayplan-day__stats" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="pill tnum">{formatDistanceKm(day.distanceKm)}</span>
          <span className="pill tnum">
            ↗ {day.totalAscentM ?? '—'} m
          </span>
          <span className="pill tnum">
            ↘ {day.totalDescentM ?? '—'} m
          </span>
          {day.estimatedHours > 0 ? (
            <span className="pill tnum" title="Estimated walking time">
              {formatHoursEstimate(day.estimatedHours)}
            </span>
          ) : null}
        </div>

        {multi ? (
          <ol className="dayplan-parts">
            {day.stages.map((stage, j) => (
              <li key={stage.id}>
                <div className="dayplan-part">
                  <span className="dayplan-part__label">Part {j + 1}</span>
                  <span className="dayplan-part__route">
                    {shortName(stage.fromHutId)} → {shortName(stage.toHutId)}
                  </span>
                  <span className="dayplan-part__stat tnum">
                    {formatDistanceKm(stage.distanceKm)}
                  </span>
                </div>
                {j < day.stages.length - 1 ? (
                  <BoundaryToggle
                    active={false}
                    stopName={shortName(stage.toHutId)}
                    stageIndex={firstStageIndex + j}
                    describeCombined={dayRoute}
                    onToggle={onToggleBoundary}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </article>

      {!isLast ? (
        <BoundaryToggle
          active
          stopName={shortName(day.toStopId)}
          stageIndex={firstStageIndex + day.stages.length - 1}
          describeBefore={`${shortName(day.stages[day.stages.length - 1].fromHutId)} to ${shortName(day.toStopId)}`}
          onToggle={onToggleBoundary}
        />
      ) : null}
    </>
  );
}

/**
 * The one control that both combines and splits: it toggles whether a hiking
 * day ends at this canonical stage boundary. `aria-pressed` carries the state
 * machine-readably, and the accessible name spells out BOTH the current state
 * and what activating will do — the visible label alone is deliberately terse
 * enough to fit at 320px.
 */
function BoundaryToggle({
  active,
  stopName,
  stageIndex,
  describeBefore,
  describeCombined,
  onToggle,
}: {
  /** True when a hiking day currently ends here. */
  active: boolean;
  stopName: string;
  stageIndex: number;
  /** "Alesjaure to Tjäktja" — the stage arriving here (active state only). */
  describeBefore?: string;
  /** "Alesjaure → Sälka" — the combined day this boundary sits inside. */
  describeCombined?: string;
  onToggle: (stageIndex: number) => void;
}) {
  const label = active
    ? `End day at ${stopName}.${
        describeBefore ? ` ${describeBefore} ends the day here.` : ''
      } Activate to continue past ${stopName} and walk the next stage on the same day.`
    : `Continue past ${stopName}.${
        describeCombined ? ` ${describeCombined} is currently one hiking day.` : ''
      } Activate to end the day at ${stopName} and split it into two days.`;

  return (
    <div className="dayplan-boundary-row">
      <button
        type="button"
        className={`dayplan-boundary${active ? ' is-active' : ''}`}
        aria-pressed={active}
        aria-label={label}
        onClick={() => onToggle(stageIndex)}
      >
        <CalendarRange size={15} strokeWidth={2} aria-hidden />
        <span aria-hidden>
          {active ? `End day at ${stopName}` : `Continue past ${stopName}`}
        </span>
      </button>
    </div>
  );
}
