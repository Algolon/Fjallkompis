import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, BusFront, Coffee, Footprints } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ConfirmDialog } from './ConfirmDialog';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { formatDistanceKm } from '../utils/format';
import {
  canDropHikingFromDay,
  canInsertHikingDay,
  canRemoveDay,
  hikingDonorIndex,
  hikingHeirIndex,
} from '../plan/dayPlan.mjs';
import { hikingEndpointOptions } from '../plan/plannedDays.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';
import type { DayActivityKind, OvernightRef, TripItem } from '../types';

/**
 * Why an edit is unavailable. The route has to stay covered exactly once, so
 * a stage can only move BETWEEN hiking days — there is nowhere else for it to
 * come from or go to. Same wording as the Add day flow, which already says
 * this when every stage has its own day.
 */
const NO_DONOR =
  'Every stage already has its own hiking day, so there is no walking to move onto this one.';
const NO_HEIR =
  'This is the only day with walking, so its route stages have nowhere to go.';
const ONLY_ACTIVITY = 'A day has to do something — add another activity first.';

/** "Kebnekaise → Nikkaluokta" — the route section a day carries, or null. */
function routeSection(day: Pick<PlannedDay, 'fromStopId' | 'toStopId'>): string | null {
  const from = day.fromStopId ? STOPS_BY_ID[day.fromStopId] : null;
  const to = day.toStopId ? STOPS_BY_ID[day.toStopId] : null;
  return from && to ? `${stopShortName(from)} → ${stopShortName(to)}` : null;
}

/** "day 4 (Sälka → Singi)" — how another day is named before it is changed. */
function dayReference(day: PlannedDay): string {
  const section = routeSection(day);
  return section ? `day ${day.number} (${section})` : `day ${day.number}`;
}

/**
 * Why walking cannot be taken OFF this day.
 *
 * The stages a hiking day carries are canonical route sections; handing them
 * to another day changes a day the user is not editing. Until sections can be
 * reassigned explicitly, the change is refused and the section is named, so
 * the sheet says what is in the way instead of quietly rewriting a neighbour.
 */
function stillWalksReason(day: PlannedDay): string {
  const section = routeSection(day);
  return `This day still contains the ${
    section ?? 'walking'
  } route section. Reassign that section before changing this day to Rest & explore or Travel.`;
}

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

  // Every control below is gated on the MODEL's own rule, asked directly —
  // never on a local approximation of it. A control the model would refuse is
  // disabled and says why, rather than accepting a tap that changes nothing.
  // The derived days carry the same `activities` the records do, so the pure
  // helpers answer for them unchanged.
  const canTakeAStage = canInsertHikingDay(plannedDays, day.index);
  const canGiveUpWalking = canDropHikingFromDay(plannedDays, day.index);
  const canRemove = canRemoveDay(plannedDays, day.index);
  const removeBlockedReason =
    plannedDays.length <= 1 ? 'This is the only day in your plan.' : NO_HEIR;

  // The days on the other side of an allocation change, named BEFORE it
  // happens: the day a stage would come from, and the day this day's stages
  // would move to if it were removed.
  const donor = plannedDays[hikingDonorIndex(plannedDays, day.index)] ?? null;
  const heir = plannedDays[hikingHeirIndex(plannedDays, day.index)] ?? null;

  /** Why a kind toggle is unavailable, or null when it is available. */
  const kindBlocked = (kind: DayActivityKind): string | null => {
    if (kind === 'travel') {
      // Travel needs no stage. Removing the day's only activity would leave it
      // doing nothing, which is not a state a day can be in. Turning travel
      // OFF on a day that also walks is fine; turning it on always is.
      if (hasTravel && day.kinds.length === 1) return ONLY_ACTIVITY;
      return null;
    }
    if (kind === 'hiking') {
      if (!hasHiking) return canTakeAStage ? null : NO_DONOR;
      if (day.kinds.length === 1) return ONLY_ACTIVITY;
      return canGiveUpWalking ? null : stillWalksReason(day);
    }
    // Rest is exclusive: switching it on drops any walking, switching it off
    // turns the day back into a hiking day and so needs a stage to take.
    if (isRest) return canTakeAStage ? null : NO_DONOR;
    return canGiveUpWalking ? null : stillWalksReason(day);
  };

  const toggleKind = (kind: DayActivityKind) => {
    if (kindBlocked(kind)) return; // the control is disabled; belt and braces
    if (kind === 'rest') {
      setDayActivities(day.id, isRest ? ['hiking'] : ['rest']);
      return;
    }
    const next = day.kinds.filter((k) => k !== 'rest');
    const kinds = next.includes(kind) ? next.filter((k) => k !== kind) : [...next, kind];
    if (kinds.length === 0) return; // a day always does something
    setDayActivities(day.id, kinds);
  };

  // One quiet note under the row, not three: the reasons repeat across kinds.
  const blockedNotes = [
    ...new Set(
      (['hiking', 'travel', 'rest'] as DayActivityKind[])
        .map(kindBlocked)
        .filter((r): r is string => r !== null && r !== ONLY_ACTIVITY),
    ),
  ];

  // Taking walking ON shortens another day. It is allowed — but never a
  // surprise: the day it comes from is named before the toggle is pressed.
  const donorNote =
    !hasHiking && donor
      ? `Adding hiking takes one route stage from ${dayReference(donor)}.`
      : null;

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
                blocked={kindBlocked('hiking')}
                onToggle={() => toggleKind('hiking')}
              />
              <KindToggle
                kind="travel"
                label="Travel"
                icon={BusFront}
                pressed={hasTravel}
                blocked={kindBlocked('travel')}
                onToggle={() => toggleKind('travel')}
              />
              <KindToggle
                kind="rest"
                label="Rest & explore"
                icon={Coffee}
                pressed={isRest}
                blocked={kindBlocked('rest')}
                onToggle={() => toggleKind('rest')}
              />
            </div>
            {blockedNotes.map((note) => (
              <p key={note} className="card-sub" style={{ marginTop: 8 }}>
                {note}
              </p>
            ))}
            {donorNote ? (
              <p className="card-sub" style={{ marginTop: 8 }}>
                {donorNote}
              </p>
            ) : null}

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

            {/* One action, and it is the destructive one. Every edit above
                saves as it is made, so this sheet has no OK, Save or Done —
                the close control in the header is how you leave it. Nor does
                it choose which day is "today": that is resolved from the date
                (src/plan/effectiveToday.mjs), not confirmed here. */}
            <div className="sheet-actions">
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                // Gated on the model's own rule: a destructive confirmation
                // must never be followed by a mutation the model refuses.
                disabled={!canRemove}
                title={canRemove ? undefined : removeBlockedReason}
                onClick={() => setConfirmingRemove(true)}
              >
                Remove day
              </button>
            </div>
            {canRemove ? null : (
              <p className="card-sub" style={{ marginTop: 8 }}>
                {removeBlockedReason}
              </p>
            )}
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
            day.stages.length > 0 && heir
              ? `Its route stages move to ${dayReference(
                  heir,
                )}, so no stage is lost. Later dates move one day earlier.`
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
  blocked,
  onToggle,
}: {
  kind: DayActivityKind;
  label: string;
  icon: typeof Footprints;
  pressed: boolean;
  /** The model's reason for refusing this change, or null when it allows it. */
  blocked: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`dayplan-kind${pressed ? ' is-on' : ''}`}
      aria-pressed={pressed}
      disabled={blocked !== null}
      // The reason is also printed under the row; on the control itself it
      // reaches anyone who lands on it without reading ahead.
      title={blocked ?? undefined}
      onClick={onToggle}
      data-kind={kind}
    >
      <Icon size={16} strokeWidth={2} aria-hidden /> {label}
    </button>
  );
}

/**
 * What an overnight reference is CALLED. References only: a canonical stop
 * resolves through the route data, a Trip stay through the user's own plan,
 * and a stay they have since deleted says so instead of inventing a name.
 */
function overnightRefName(
  ref: { kind: string; stopId?: string; tripItemId?: string },
  trip: TripItem[],
): string | null {
  if (ref.kind === 'stop') {
    const stop = ref.stopId ? STOPS_BY_ID[ref.stopId] : null;
    return stop ? stopShortName(stop) : 'Unknown stop';
  }
  if (ref.kind === 'stay') {
    return trip.find((i) => i.id === ref.tripItemId)?.title ?? 'Stay no longer in your Trip plan';
  }
  return null;
}

function OvernightSummary({ day }: { day: PlannedDay }) {
  const { state } = useStore();
  const name = overnightRefName(day.overnight, state.trip);
  if (!name) return <span className="muted">No overnight</span>;
  return <>{name}</>;
}

/**
 * What walking further does to the days after this one, counted rather than
 * asserted: whole days absorbed, a day merely left shorter, or both.
 */
function mergeConsequence(option: ReturnType<typeof hikingEndpointOptions>[number]): string {
  const stages = `${option.takenStages} ${option.takenStages === 1 ? 'stage' : 'stages'}`;
  if (option.absorbedDays === 0) return `Takes ${stages} from the next hiking day.`;
  const days =
    option.absorbedDays === 1 ? 'the next hiking day' : `the next ${option.absorbedDays} hiking days`;
  return option.shortensNextDay
    ? `Merges ${days} into this day and shortens the one after.`
    : `Merges ${days} into this day.`;
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
          // The real consequence, counted. A distant endpoint can absorb
          // several days, and "the following hiking day" would understate it;
          // a nearer one only shortens the next day without absorbing it.
          const consequence =
            option.effect === 'merge'
              ? mergeConsequence(option)
              : option.effect === 'split'
                ? option.releasedStages === 1
                  ? 'Creates a new hiking day for the remaining stage.'
                  : `Creates a new hiking day for the remaining ${option.releasedStages} stages.`
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

/**
 * The derived default, another canonical stop, an existing Trip stay, or none.
 *
 * The FIRST option is always the derived one — where the walk ends, or, on a
 * rest day, wherever the user already was. Choosing it clears the stored
 * reference rather than pinning today's answer, so the day keeps following its
 * source when an earlier day changes. Whatever it resolves to is dropped from
 * the explicit lists below: two entries reading "Nikkaluokta" that persist
 * different states are a trap, not a choice.
 */
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
  const derived = day.derivedOvernight;
  const isDerived = day.overnight.source !== 'explicit';
  const derivedStopId = derived.kind === 'stop' ? (derived.stopId ?? null) : null;
  const derivedStayId = derived.kind === 'stay' ? (derived.tripItemId ?? null) : null;
  const derivedLabel = overnightRefName(derived, state.trip);

  return (
    <>
      <span className="section-label">Tonight</span>
      <ul className="dayplan-options" role="list">
        {derived.kind !== 'none' && derivedLabel ? (
          <li>
            <button
              type="button"
              className={`dayplan-option dayplan-option--derived${isDerived ? ' is-current' : ''}`}
              aria-current={isDerived ? 'true' : undefined}
              onClick={() => onChoose(undefined)}
            >
              <span className="dayplan-option__name">{derivedLabel}</span>
              <span className="dayplan-option__effect">
                {derived.source === 'hiking'
                  ? 'Where today’s walk ends'
                  : 'Same as last night — follows the day before'}
              </span>
            </button>
          </li>
        ) : null}
        {itinerary.orderedStops
          .filter((stop) => stop.id !== derivedStopId)
          .map((stop) => (
            <li key={stop.id}>
              <button
                type="button"
                className={`dayplan-option${
                  !isDerived && day.overnight.kind === 'stop' && day.overnight.stopId === stop.id
                    ? ' is-current'
                    : ''
                }`}
                onClick={() => onChoose({ kind: 'stop', stopId: stop.id })}
              >
                <span className="dayplan-option__name">{stopShortName(stop)}</span>
              </button>
            </li>
          ))}
        {stays
          .filter((stay) => stay.id !== derivedStayId)
          .map((stay) => (
            <li key={stay.id}>
              <button
                type="button"
                className={`dayplan-option${
                  !isDerived &&
                  day.overnight.kind === 'stay' &&
                  day.overnight.tripItemId === stay.id
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
            className={`dayplan-option${
              !isDerived && day.overnight.kind === 'none' ? ' is-current' : ''
            }`}
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
