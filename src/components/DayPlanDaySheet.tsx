import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BusFront,
  Coffee,
  Footprints,
  Repeat2,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ConfirmDialog } from './ConfirmDialog';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import {
  STAGES_BY_ID,
  STAGE_TOPOLOGY,
  STOPS_BY_ID,
  stopShortName,
} from '../trail/activeTrailContent';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { formatDistanceKm } from '../utils/format';
import { isReversed } from '../route/direction.mjs';
import {
  hikingLegsOf,
  newDayLegCandidates,
  stageOccurrences,
} from '../plan/dayPlan.mjs';
import type { NewDayLegCandidate } from '../plan/dayPlan.mjs';
import { StartLegOptions } from './StartLegOptions';
import {
  canRemoveLeg,
  canReverseLeg,
  legCandidatesFrom,
  legCandidatesTo,
  withLegMoved,
  withLegRepeated,
} from '../plan/hikingLegs.mjs';
import type { HikingLegCandidate } from '../plan/hikingLegs.mjs';
import type { DerivedHikingLeg, PlannedDay } from '../plan/plannedDays.mjs';
import type { CanonicalHikingLeg, DayActivityKind, OvernightRef, TripItem } from '../types';

const ONLY_ACTIVITY = 'A day has to do something — add another activity first.';

/** "Kebnekaise → Nikkaluokta" — the oriented route a day walks, or null. */
function routeSection(day: Pick<PlannedDay, 'fromStopId' | 'toStopId'>): string | null {
  const from = day.fromStopId ? STOPS_BY_ID[day.fromStopId] : null;
  const to = day.toStopId ? STOPS_BY_ID[day.toStopId] : null;
  return from && to ? `${stopShortName(from)} → ${stopShortName(to)}` : null;
}

const stopName = (stopId: string) => {
  const stop = STOPS_BY_ID[stopId];
  return stop ? stopShortName(stop) : stopId;
};

/**
 * Edit one planned day — the app's `.sheet` native <dialog>.
 *
 * Everything a day owns is here and nowhere else, so the plan list itself
 * stays a compact, read-only overview: what the day is, the exact ordered
 * legs it walks, and where the user stays. EVERY leg edit touches only this
 * day: no stage is borrowed from or handed to another day, no neighbour is
 * merged, split or repaired — a coverage difference the edit creates is a
 * diagnostic on the plan, never a mutation of a day the user did not open.
 */
export function DayPlanDaySheet({ day, onClose }: { day: PlannedDay; onClose: () => void }) {
  const {
    dayPlan,
    plannedDays,
    setDayActivities,
    swapDayActivities,
    dropDayHiking,
    setDayOvernight,
    removePlannedDay,
  } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  const [view, setView] = useState<'day' | 'legs' | 'overnight'>('day');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // The replacement composition the day gets when its walking is removed —
  // non-null while the explicit "remove walking" confirmation is up.
  const [confirmingDrop, setConfirmingDrop] = useState<DayActivityKind[] | null>(null);
  // The composition waiting on a starting-section choice — non-null while
  // the day is taking hiking ON and no single unplanned candidate exists,
  // so the section (and any repeat) is always the user's explicit pick.
  const [choosingStart, setChoosingStart] = useState<DayActivityKind[] | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const dateLabel = day.date ? formatDateFieldLabel(day.date) : `Day ${day.number}`;
  const hasHiking = day.kinds.includes('hiking');
  const hasTravel = day.kinds.includes('travel');
  const isRest = day.kinds.includes('rest');
  const confirming = confirmingRemove || confirmingDrop !== null;

  const canRemove = plannedDays.length > 1;

  /** Why a kind toggle is unavailable, or null when it is available. */
  const kindBlocked = (kind: DayActivityKind): string | null => {
    if (kind === 'travel') {
      if (hasTravel && day.kinds.length === 1) return ONLY_ACTIVITY;
      return null;
    }
    if (kind === 'hiking') {
      // Turning walking ON starts the day with its connecting default leg;
      // turning it OFF is the explicit, confirmed removal below — blocked
      // only when nothing would remain.
      if (hasHiking && day.kinds.length === 1) return ONLY_ACTIVITY;
      return null;
    }
    return null;
  };

  // Every physically valid starting section, should this day take hiking ON
  // — the same pure rule the model validates against. The toggle proceeds
  // by itself ONLY when exactly one candidate is not yet planned; any other
  // case (a fork, or only repeats) opens the explicit chooser, so a
  // repeated stage is always the user's own selection.
  const startCandidates: NewDayLegCandidate[] = !hasHiking
    ? newDayLegCandidates(plannedDays, day.index, dayPlan?.direction ?? '', STAGE_TOPOLOGY)
    : [];
  const startUnplanned = startCandidates.filter((c) => !c.alreadyPlanned);
  const proposedStart = startUnplanned.length === 1 ? startUnplanned[0] : null;

  const takeOnHiking = (kinds: DayActivityKind[]) => {
    if (proposedStart) {
      setDayActivities(day.id, kinds, proposedStart);
      return;
    }
    setChoosingStart(kinds);
  };

  const toggleKind = (kind: DayActivityKind) => {
    if (kindBlocked(kind)) return; // the control is disabled; belt and braces
    if (kind === 'rest') {
      if (isRest) {
        takeOnHiking(['hiking']);
        return;
      }
      // Rest is exclusive: on a walking day this REMOVES the day's legs,
      // which is never done silently — the confirmation names the route.
      if (hasHiking) {
        setConfirmingDrop(['rest']);
        return;
      }
      setDayActivities(day.id, ['rest']);
      return;
    }
    if (kind === 'hiking' && hasHiking) {
      const remaining = day.kinds.filter((k) => k !== 'hiking');
      if (remaining.length === 0) return;
      setConfirmingDrop(remaining);
      return;
    }
    const next = day.kinds.filter((k) => k !== 'rest');
    const kinds = next.includes(kind) ? next.filter((k) => k !== kind) : [...next, kind];
    if (kinds.length === 0) return;
    if (kind === 'hiking') {
      takeOnHiking(kinds);
      return;
    }
    setDayActivities(day.id, kinds);
  };

  // What walking ON would do — named BEFORE the toggle is pressed, so
  // taking on hiking is never a surprise and never a silent repeat.
  const addHikingNote = !hasHiking
    ? proposedStart
      ? `Adding hiking starts this day with ${stopName(proposedStart.fromStopId)} → ${stopName(
          proposedStart.toStopId,
        )} — the connecting section not yet in your plan. Edit its legs afterwards.`
      : startCandidates.length > 0
        ? 'Adding hiking asks which connecting section this day starts with — sections already in your plan are marked.'
        : null
    : null;

  const dropLegs = day.legs.length;
  const dropBody = `This removes the day's walking — ${
    dropLegs === 1 ? 'its one leg' : `all ${dropLegs} legs`
  }${routeSection(day) ? `, ${routeSection(day)}` : ''}. No other planned day changes and no walking moves to another day; a route section this plan no longer covers is simply reported in the plan overview.`;

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={onClose}
      onCancel={(e) => {
        if (confirming) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !confirming) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2>{dateLabel}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {view === 'day' && choosingStart !== null ? (
          <>
            <span className="section-label">Starts with</span>
            <p className="card-sub" style={{ marginTop: 0 }}>
              Choose which connecting section this day walks first. No other
              day changes; edit its legs afterwards.
            </p>
            <StartLegOptions
              candidates={startCandidates}
              onChoose={(candidate) => {
                setDayActivities(day.id, choosingStart, candidate);
                setChoosingStart(null);
              }}
            />
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setChoosingStart(null)}
            >
              Back
            </button>
          </>
        ) : null}

        {view === 'day' && choosingStart === null ? (
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
            {addHikingNote ? (
              <p className="card-sub" style={{ marginTop: 8 }}>
                {addHikingNote}
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

            {hasHiking && day.fromStopId && day.toStopId ? (
              <>
                <span className="section-label">Walking</span>
                <p className="dayplan-sheet__route">
                  {stopName(day.fromStopId)} <span aria-hidden>→</span> {stopName(day.toStopId)}
                </p>
                {day.viaStopIds.length > 0 ? (
                  <p className="card-sub" style={{ marginTop: 2 }}>
                    via {day.viaStopIds.map(stopName).join(' and ')}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => setView('legs')}
                >
                  Edit route legs
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
                disabled={!canRemove}
                title={canRemove ? undefined : 'This is the only day in your plan.'}
                onClick={() => setConfirmingRemove(true)}
              >
                Remove day
              </button>
            </div>
            {canRemove ? null : (
              <p className="card-sub" style={{ marginTop: 8 }}>
                This is the only day in your plan.
              </p>
            )}
          </>
        ) : null}

        {view === 'legs' ? (
          <LegEditor
            day={day}
            onRemoveWalking={() =>
              setConfirmingDrop(
                day.kinds.filter((k) => k !== 'hiking').length > 0
                  ? day.kinds.filter((k) => k !== 'hiking')
                  : ['rest'],
              )
            }
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
            day.legs.length > 0
              ? `Its walking (${routeSection(day) ?? 'the planned legs'}) is removed with it — no other day changes. Later dates move one day earlier.`
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

      {confirmingDrop !== null ? (
        <ConfirmDialog
          title="Remove the day’s walking?"
          body={dropBody}
          primaryLabel="Remove walking"
          destructive
          onConfirm={() => {
            dropDayHiking(day.id, confirmingDrop);
            setConfirmingDrop(null);
            setView('day');
          }}
          onCancel={() => setConfirmingDrop(null)}
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
      title={blocked ?? undefined}
      onClick={onToggle}
      data-kind={kind}
    >
      <Icon size={16} strokeWidth={2} aria-hidden /> {label}
    </button>
  );
}

// ---- The leg editor ---------------------------------------------------------

/**
 * The focused editor for ONE day's ordered legs.
 *
 * Everything here modifies only the opened day, through the store's leg
 * actions, and every control is gated on the pure model's own answer —
 * a reverse, removal or reorder that would disconnect the day's walk is
 * disabled with its reason, never accepted and repaired. Reverse and repeat
 * are explicit: a reversed leg SAYS it walks the section the other way, and
 * a repeat creates a visible second occurrence rather than moving anything.
 */
function LegEditor({
  day,
  onRemoveWalking,
  onBack,
}: {
  day: PlannedDay;
  onRemoveWalking: () => void;
  onBack: () => void;
}) {
  const { dayPlan, plannedDays, addHikingLeg, removeHikingLeg, reverseHikingLeg, repeatHikingLeg, moveHikingLeg } =
    useStore();
  // The persisted legs (identity + orientation), for the pure predicates.
  const rawLegs = hikingLegsOf(day) as CanonicalHikingLeg[];
  // The plan's own natural orientation: legs walked the OTHER way get named.
  const natural = isReversed(dayPlan?.direction ?? '') ? 'opposite' : 'canonical';

  /** "also on day 5" / "twice on this day" — where else a stage is planned. */
  const occurrenceNote = (leg: DerivedHikingLeg): string | null => {
    const all = stageOccurrences(plannedDays, leg.stageId).filter((o) => o.legId !== leg.id);
    if (all.length === 0) return null;
    const here = all.filter((o) => o.dayId === day.id).length;
    const elsewhere = [
      ...new Set(
        all
          .filter((o) => o.dayId !== day.id)
          .map((o) => plannedDays.find((d) => d.id === o.dayId)?.number)
          .filter((n): n is number => n != null),
      ),
    ];
    const parts = [];
    if (here > 0) parts.push('again on this day');
    if (elsewhere.length > 0) parts.push(`on day ${elsewhere.join(', day ')}`);
    return `Also walked ${parts.join(' and ')}`;
  };

  const canRepeat = (legId: string) => withLegRepeated(rawLegs, legId, STAGE_TOPOLOGY) !== rawLegs;
  const canMove = (from: number, to: number) =>
    to >= 0 &&
    to < rawLegs.length &&
    withLegMoved(rawLegs, from, to, STAGE_TOPOLOGY) !== rawLegs;

  const first = rawLegs[0] ?? null;
  const last = rawLegs[rawLegs.length - 1] ?? null;
  const beforeCandidates: HikingLegCandidate[] = day.fromStopId
    ? legCandidatesTo(STAGE_TOPOLOGY, day.fromStopId)
    : [];
  const afterCandidates: HikingLegCandidate[] = day.toStopId
    ? legCandidatesFrom(STAGE_TOPOLOGY, day.toStopId)
    : [];

  /** Concise decision info for one add-candidate. */
  const candidateButton = (candidate: HikingLegCandidate, position: 'start' | 'end') => {
    const occurrences = stageOccurrences(plannedDays, candidate.stageId);
    const days = [
      ...new Set(
        occurrences
          .map((o) => plannedDays.find((d) => d.id === o.dayId)?.number)
          .filter((n): n is number => n != null),
      ),
    ];
    return (
      <li key={`${candidate.stageId}:${candidate.orientation}`}>
        <button
          type="button"
          className="dayplan-option"
          onClick={() => addHikingLeg(day.id, candidate.stageId, candidate.orientation, position)}
        >
          <span className="dayplan-option__name">
            {stopName(candidate.fromStopId)} → {stopName(candidate.toStopId)}
          </span>
          <span className="dayplan-option__meta tnum">
            {formatDistanceKm(stageDistanceKm(candidate.stageId))}
            {candidate.orientation !== natural ? ' · walks the section in reverse' : ''}
          </span>
          {days.length > 0 ? (
            <span className="dayplan-option__effect">
              Already planned on day {days.join(', day ')}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <>
      {/* The list is already ordered and numbered; it does not need a heading
          asserting that the order is meaningful. "Route legs — walked in this
          exact order" described the data structure to the user. */}
      <span className="section-label">Walking this day</span>
      <ol className="dayplan-legs">
        {day.legs.map((leg, i) => {
          const note = occurrenceNote(leg);
          const removable = canRemoveLeg(rawLegs, leg.id, STAGE_TOPOLOGY);
          const reversible = canReverseLeg(rawLegs, leg.id, STAGE_TOPOLOGY);
          return (
            <li key={leg.id} className="dayplan-leg">
              <div className="dayplan-leg__route">
                <strong>
                  {stopName(leg.stage.fromHutId)} → {stopName(leg.stage.toHutId)}
                </strong>
                <span className="card-sub tnum">
                  {formatDistanceKm(leg.stage.distanceKm)}
                  {leg.orientation !== natural ? ' · walks the section in reverse' : ''}
                </span>
                {note ? <span className="card-sub">{note}</span> : null}
              </div>
              <div className="dayplan-leg__actions">
                <button
                  type="button"
                  className="stage-set-pill"
                  disabled={!reversible}
                  title={
                    reversible
                      ? 'Walk this section the other way round'
                      : 'Reversing this leg would disconnect the day’s walk.'
                  }
                  onClick={() => reverseHikingLeg(day.id, leg.id)}
                >
                  <ArrowUpDown size={13} strokeWidth={2} aria-hidden /> Reverse
                </button>
                <button
                  type="button"
                  className="stage-set-pill"
                  disabled={!canRepeat(leg.id)}
                  title="Walk this section again, back the other way — a second occurrence, the first stays where it is"
                  onClick={() => repeatHikingLeg(day.id, leg.id)}
                >
                  <Repeat2 size={13} strokeWidth={2} aria-hidden /> Walk again
                </button>
                {canMove(i, i - 1) ? (
                  <button
                    type="button"
                    className="stage-set-pill"
                    aria-label={`Move leg ${i + 1} earlier`}
                    onClick={() => moveHikingLeg(day.id, i, i - 1)}
                  >
                    <ArrowUp size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
                {canMove(i, i + 1) ? (
                  <button
                    type="button"
                    className="stage-set-pill"
                    aria-label={`Move leg ${i + 1} later`}
                    onClick={() => moveHikingLeg(day.id, i, i + 1)}
                  >
                    <ArrowDown size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="stage-set-pill"
                  disabled={!removable}
                  title={
                    removable
                      ? undefined
                      : rawLegs.length === 1
                        ? 'A hiking day walks at least one leg — remove the walking itself below.'
                        : 'Removing this leg would disconnect the day’s walk.'
                  }
                  onClick={() => removeHikingLeg(day.id, leg.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {first && beforeCandidates.length > 0 ? (
        <>
          <span className="section-label">Add before the start</span>
          <ul className="dayplan-options" role="list">
            {beforeCandidates.map((c) => candidateButton(c, 'start'))}
          </ul>
        </>
      ) : null}
      {last && afterCandidates.length > 0 ? (
        <>
          <span className="section-label">Add after the end</span>
          <ul className="dayplan-options" role="list">
            {afterCandidates.map((c) => candidateButton(c, 'end'))}
          </ul>
        </>
      ) : null}

      <div className="sheet-actions">
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={onRemoveWalking}>
          Remove walking from this day
        </button>
      </div>

      <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={onBack}>
        Back
      </button>
    </>
  );
}

/** Verified stage distance by stable id (direction-independent). */
function stageDistanceKm(stageId: string): number {
  return STAGES_BY_ID[stageId]?.distanceKm ?? 0;
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
