import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, BusFront, Coffee, Footprints } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ConfirmDialog } from './ConfirmDialog';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { formatDistanceKm } from '../utils/format';
import { hikingEndpointOptions } from '../plan/plannedDays.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';
import type { DayActivityKind, OvernightRef } from '../types';

/**
 * Edit one planned day — the app's `.sheet` native <dialog>.
 *
 * Everything a day owns is here and nowhere else, so the plan list itself
 * stays a compact, read-only overview: what the day is, where the walking
 * ends, and where the user stays. Route statistics deliberately appear in
 * exactly ONE place — the endpoint chooser, where "how far do I walk today" is
 * the decision being made.
 */
export function DayPlanDaySheet({ day, onClose }: { day: PlannedDay; onClose: () => void }) {
  const {
    plannedDays,
    itinerary,
    setDayActivities,
    swapDayActivities,
    setHikingDayStages,
    setDayOvernight,
    removePlannedDay,
    activatePlannedDay,
  } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  const [view, setView] = useState<'day' | 'endpoint' | 'overnight'>('day');
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const dateLabel = day.date ? formatDateFieldLabel(day.date) : `Day ${day.number}`;
  const hasHiking = day.kinds.includes('hiking');
  const hasTravel = day.kinds.includes('travel');
  const isRest = day.kinds.includes('rest');
  const from = day.fromStopId ? STOPS_BY_ID[day.fromStopId] : null;
  const to = day.toStopId ? STOPS_BY_ID[day.toStopId] : null;
  const canRemove = plannedDays.length > 1;

  const toggleKind = (kind: DayActivityKind) => {
    if (kind === 'rest') {
      setDayActivities(day.id, isRest ? ['hiking'] : ['rest']);
      return;
    }
    const next = day.kinds.filter((k) => k !== 'rest');
    const kinds = next.includes(kind) ? next.filter((k) => k !== kind) : [...next, kind];
    if (kinds.length === 0) return; // a day always does something
    setDayActivities(day.id, kinds);
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={onClose}
      onCancel={(e) => {
        if (confirmingRemove) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !confirmingRemove) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2>{dateLabel}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {view === 'day' ? (
          <>
            <span className="section-label">This day includes</span>
            <div className="dayplan-kinds" role="group" aria-label="Day activities">
              <KindToggle
                kind="hiking"
                label="Hiking"
                icon={Footprints}
                pressed={hasHiking}
                onToggle={() => toggleKind('hiking')}
              />
              <KindToggle
                kind="travel"
                label="Travel"
                icon={BusFront}
                pressed={hasTravel}
                onToggle={() => toggleKind('travel')}
              />
              <KindToggle
                kind="rest"
                label="Rest & explore"
                icon={Coffee}
                pressed={isRest}
                onToggle={() => toggleKind('rest')}
              />
            </div>

            {hasHiking && hasTravel ? (
              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 12 }}
                onClick={() => swapDayActivities(day.id)}
              >
                <ArrowUpDown size={16} strokeWidth={2} aria-hidden />
                {day.kinds[0] === 'hiking' ? 'Hiking, then travel' : 'Travel, then hiking'}
              </button>
            ) : null}

            {hasHiking && from && to ? (
              <>
                <span className="section-label">Walking</span>
                <p className="dayplan-sheet__route">
                  {stopShortName(from)} <span aria-hidden>→</span> {stopShortName(to)}
                </p>
                {day.viaStopIds.length > 0 ? (
                  <p className="card-sub" style={{ marginTop: 2 }}>
                    via{' '}
                    {day.viaStopIds
                      .map((id) => stopShortName(STOPS_BY_ID[id]))
                      .join(' and ')}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => setView('endpoint')}
                >
                  Change endpoint
                </button>
              </>
            ) : null}

            {hasTravel ? (
              <>
                <span className="section-label">Travel</span>
                {day.travelItems.length > 0 ? (
                  <ul className="dayplan-travel">
                    {day.travelItems.map((item) => (
                      <li key={item.id}>
                        {item.kind === 'transport' ? (
                          <>
                            <strong>{item.title}</strong>
                            <span className="card-sub">
                              {[item.from, item.to].filter(Boolean).join(' → ')}
                              {item.departureTime ? ` · ${item.departureTime}` : ''}
                            </span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="card-sub" style={{ marginTop: 2 }}>
                    No travel recorded for this date yet.
                  </p>
                )}
                <p className="card-sub" style={{ marginTop: 6 }}>
                  Travel details live in Lists → Trip and are matched by date.
                </p>
              </>
            ) : null}

            <span className="section-label">Tonight</span>
            <p className="dayplan-sheet__route">
              <OvernightSummary day={day} />
            </p>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 10 }}
              onClick={() => setView('overnight')}
            >
              Change where you stay
            </button>

            <div className="sheet-actions">
              {day.isCurrent ? (
                <span className="pill pill-current" style={{ flex: 1, justifyContent: 'center' }}>
                  <span className="dot" /> Today
                </span>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    activatePlannedDay(day.id);
                    onClose();
                  }}
                >
                  Make this today
                </button>
              )}
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={!canRemove}
                onClick={() => setConfirmingRemove(true)}
              >
                Remove day
              </button>
            </div>
          </>
        ) : null}

        {view === 'endpoint' ? (
          <EndpointChooser
            day={day}
            options={hikingEndpointOptions(plannedDays, day.index, itinerary.stages)}
            onChoose={(stages) => {
              setHikingDayStages(day.id, stages);
              setView('day');
            }}
            onBack={() => setView('day')}
          />
        ) : null}

        {view === 'overnight' ? (
          <OvernightChooser
            day={day}
            onChoose={(ref) => {
              setDayOvernight(day.id, ref);
              setView('day');
            }}
            onBack={() => setView('day')}
          />
        ) : null}
      </div>

      {confirmingRemove ? (
        <ConfirmDialog
          title="Remove this day?"
          body={
            day.stages.length > 0
              ? 'Its walking moves to the next day, so no route stage is lost. Later dates move one day earlier.'
              : 'Later dates move one day earlier. Your Trip plan and documents are not affected.'
          }
          primaryLabel="Remove day"
          destructive
          onConfirm={() => {
            removePlannedDay(day.id);
            setConfirmingRemove(false);
            onClose();
          }}
          onCancel={() => setConfirmingRemove(false)}
        />
      ) : null}
    </dialog>
  );
}

function KindToggle({
  kind,
  label,
  icon: Icon,
  pressed,
  onToggle,
}: {
  kind: DayActivityKind;
  label: string;
  icon: typeof Footprints;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`dayplan-kind${pressed ? ' is-on' : ''}`}
      aria-pressed={pressed}
      onClick={onToggle}
      data-kind={kind}
    >
      <Icon size={16} strokeWidth={2} aria-hidden /> {label}
    </button>
  );
}

function OvernightSummary({ day }: { day: PlannedDay }) {
  const { state } = useStore();
  if (day.overnight.kind === 'stop') {
    const stop = day.overnight.stopId ? STOPS_BY_ID[day.overnight.stopId] : null;
    return <>{stop ? stopShortName(stop) : 'Unknown stop'}</>;
  }
  if (day.overnight.kind === 'stay') {
    const stay = state.trip.find((i) => i.id === day.overnight.tripItemId);
    return <>{stay ? stay.title : 'Stay no longer in your Trip plan'}</>;
  }
  return <span className="muted">No overnight</span>;
}

/**
 * The one place in the planner that shows distance: choosing where a hiking
 * day ends IS choosing how far to walk, so each option states its stage count
 * and total distance — and what picking it does to the surrounding days.
 */
function EndpointChooser({
  day,
  options,
  onChoose,
  onBack,
}: {
  day: PlannedDay;
  options: ReturnType<typeof hikingEndpointOptions>;
  onChoose: (stages: number) => void;
  onBack: () => void;
}) {
  return (
    <>
      <span className="section-label">
        Ends at — starting from{' '}
        {day.fromStopId ? stopShortName(STOPS_BY_ID[day.fromStopId]) : 'the start'}
      </span>
      <ul className="dayplan-options" role="list">
        {options.map((option) => {
          const stop = STOPS_BY_ID[option.stopId];
          const consequence =
            option.effect === 'merge'
              ? 'Merges the following hiking day into this one.'
              : option.effect === 'split'
                ? 'Splits the rest of the walking into a new day.'
                : null;
          return (
            <li key={option.stopId}>
              <button
                type="button"
                className={`dayplan-option${option.isCurrent ? ' is-current' : ''}`}
                aria-current={option.isCurrent ? 'true' : undefined}
                onClick={() => onChoose(option.stages)}
              >
                <span className="dayplan-option__name">
                  {stop ? stopShortName(stop) : option.stopId}
                </span>
                <span className="dayplan-option__meta tnum">
                  {option.stages} {option.stages === 1 ? 'stage' : 'stages'} ·{' '}
                  {formatDistanceKm(option.distanceKm)}
                </span>
                {consequence ? (
                  <span className="dayplan-option__effect">{consequence}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={onBack}>
        Back
      </button>
    </>
  );
}

/** Derived default, another canonical stop, an existing Trip stay, or none. */
function OvernightChooser({
  day,
  onChoose,
  onBack,
}: {
  day: PlannedDay;
  onChoose: (ref: OvernightRef | undefined) => void;
  onBack: () => void;
}) {
  const { state, itinerary } = useStore();
  const stays = state.trip.filter((i) => i.kind === 'stay');
  const derivedStopId = day.stages.length
    ? day.stages[day.stages.length - 1].toHutId
    : null;

  return (
    <>
      <span className="section-label">Tonight</span>
      <ul className="dayplan-options" role="list">
        {derivedStopId ? (
          <li>
            <button
              type="button"
              className={`dayplan-option${day.overnight.source === 'hiking' ? ' is-current' : ''}`}
              onClick={() => onChoose(undefined)}
            >
              <span className="dayplan-option__name">
                {stopShortName(STOPS_BY_ID[derivedStopId])}
              </span>
              <span className="dayplan-option__effect">Where today’s walk ends</span>
            </button>
          </li>
        ) : null}
        {itinerary.orderedStops.map((stop) => (
          <li key={stop.id}>
            <button
              type="button"
              className={`dayplan-option${
                day.overnight.kind === 'stop' && day.overnight.stopId === stop.id
                  ? ' is-current'
                  : ''
              }`}
              onClick={() => onChoose({ kind: 'stop', stopId: stop.id })}
            >
              <span className="dayplan-option__name">{stopShortName(stop)}</span>
            </button>
          </li>
        ))}
        {stays.map((stay) => (
          <li key={stay.id}>
            <button
              type="button"
              className={`dayplan-option${
                day.overnight.kind === 'stay' && day.overnight.tripItemId === stay.id
                  ? ' is-current'
                  : ''
              }`}
              onClick={() => onChoose({ kind: 'stay', tripItemId: stay.id })}
            >
              <span className="dayplan-option__name">{stay.title}</span>
              <span className="dayplan-option__effect">From your Trip plan</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={`dayplan-option${day.overnight.kind === 'none' ? ' is-current' : ''}`}
            onClick={() => onChoose({ kind: 'none' })}
          >
            <span className="dayplan-option__name">No overnight</span>
            <span className="dayplan-option__effect">
              For a final travel day with nowhere to stay
            </span>
          </button>
        </li>
      </ul>
      {stays.length === 0 ? (
        <p className="card-sub" style={{ marginTop: 10 }}>
          Staying somewhere off the route? Add it in Lists → Trip and it will
          appear here.
        </p>
      ) : null}
      <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={onBack}>
        Back
      </button>
    </>
  );
}
