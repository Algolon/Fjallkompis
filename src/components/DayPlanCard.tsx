import { useEffect, useRef, useState } from 'react';
import { BedDouble, BusFront, Coffee, Eye, Footprints, Pencil, Plus } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { DateField } from './DateField';
import { ConfirmDialog } from './ConfirmDialog';
import { DayPlanDaySheet } from './DayPlanDaySheet';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { DAY_ACTIVITY_LABELS, defaultLegsForNewDay } from '../plan/dayPlan.mjs';
import { STAGE_TOPOLOGY } from '../data/stages';
import { hikingLead, travelPresentation } from '../plan/dayPresentation.mjs';
import type { PlannedDay, ResolvedOvernight } from '../plan/plannedDays.mjs';
import type { DayActivityKind, TripItem } from '../types';
import type { TabId } from './TabBar';

/**
 * Day plan — the personal journey, configured in Settings.
 *
 * Canonical route STAGES are fixed geography and are never edited here. This
 * card decides what happens on each calendar day: which stages are walked,
 * where the day ends, where the user stays, and whether the day also involves
 * travel or is a rest day.
 *
 * The default is a compact VIEW: date, what happens, the route line when there
 * is walking, and tonight. No distances, ascent, descent, durations, highlight
 * chips or guide detail — those already live in Stages, and the planner is for
 * overview. Editing is a deliberate mode switch, so a plan cannot be changed by
 * a stray tap while being read.
 */
export function DayPlanCard({
  onNavigate,
}: {
  /** The app's tab navigator; when absent the Preview action is not shown. */
  onNavigate?: (tab: TabId) => void;
}) {
  const {
    dayPlan,
    plannedDays,
    currentPlannedDay,
    todaySource,
    previewPlannedDay,
    dayPlanIsDefault,
    createDayPlan,
    setStartDate,
    addPlannedDay,
    resetDayPlan,
    removeDayPlan,
    state,
  } = useStore();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [addAt, setAddAt] = useState<number | null>(null);

  if (!dayPlan) {
    return (
      <>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Plan what happens on each day of your journey. Route stages, guides
          and route data never change.
        </p>
        <DateField
          label="First day of your journey"
          dialogTitle="First day of your journey"
          value=""
          onChange={createDayPlan}
          style={{ marginTop: 12 }}
        />
        <p className="card-sub" style={{ marginTop: 8 }}>
          Choosing a date creates a plan with one stage per day. You can then
          add travel and rest days, and change where each hiking day ends.
        </p>
      </>
    );
  }

  const lastDay = plannedDays[plannedDays.length - 1];
  const firstLabel = formatDateFieldLabel(dayPlan.startDate);
  const lastLabel = lastDay?.date ? formatDateFieldLabel(lastDay.date) : null;
  const openDay = plannedDays.find((d) => d.id === openDayId) ?? null;

  return (
    <>
      <div className="row-between" style={{ marginTop: 0 }}>
        <span className="card-sub" style={{ marginTop: 0 }}>
          {plannedDays.length} days
          {firstLabel && lastLabel ? ` · ${firstLabel} – ${lastLabel}` : ''}
        </span>
        <button
          type="button"
          className="stage-set-pill"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
        >
          {editing ? 'Done' : 'Edit plan'}
        </button>
      </div>

      {editing ? (
        <>
          <DateField
            label="First day of your journey"
            dialogTitle="First day of your journey"
            value={dayPlan.startDate}
            onChange={setStartDate}
            style={{ marginTop: 12 }}
          />
          <p className="card-sub" style={{ marginTop: 8 }}>
            Dates follow consecutive journey days.
          </p>
        </>
      ) : null}

      <ol className="dayplan" style={{ marginTop: 14 }}>
        {plannedDays.map((day, i) => (
          <li key={day.id}>
            {editing ? <AddDayRow index={i} onOpen={() => setAddAt(i)} /> : null}
            <DayRow
              day={day}
              trip={state.trip}
              editing={editing}
              // The marker follows what Today actually shows — the transient
              // preview, the manual pointer, or the day whose date is today —
              // so the plan and Today can never disagree about the day shown.
              // 'previewing' names the temporary state honestly; 'today' is
              // the real (manual or date-resolved) day.
              marker={
                day.id === currentPlannedDay?.id
                  ? todaySource === 'preview'
                    ? 'previewing'
                    : 'today'
                  : null
              }
              onEdit={() => setOpenDayId(day.id)}
              // Preview: a small explicit action, view mode only, never the
              // whole row (the compact list stays a safe reading surface).
              // Rows already marked need no Preview; every other row gets
              // one — including the real Today row while a preview is up.
              onPreview={
                onNavigate
                  ? () => {
                      previewPlannedDay(day.id);
                      onNavigate('today');
                    }
                  : undefined
              }
            />
          </li>
        ))}
        {editing ? (
          <li>
            <AddDayRow index={plannedDays.length} onOpen={() => setAddAt(plannedDays.length)} />
          </li>
        ) : null}
      </ol>

      {editing ? (
        <>
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
            Remove day plan
          </button>
        </>
      ) : null}

      {openDay ? (
        <DayPlanDaySheet day={openDay} onClose={() => setOpenDayId(null)} />
      ) : null}

      {addAt !== null ? (
        <AddDaySheet
          index={addAt}
          onAdd={(kinds) => {
            addPlannedDay(addAt, kinds);
            setAddAt(null);
          }}
          onClose={() => setAddAt(null)}
        />
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          title="Remove day plan?"
          body="Your planned days and their dates are deleted. The route stages, your current stage, packing list, Trip plan, journal and stop notes are not affected."
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

const shortName = (stopId: string) => {
  const stop = STOPS_BY_ID[stopId];
  return stop ? stopShortName(stop) : stopId;
};

/** Compact activity glyphs — the words are always in the accessible name. */
export const ACTIVITY_ICONS: Record<DayActivityKind, typeof Footprints> = {
  hiking: Footprints,
  travel: BusFront,
  rest: Coffee,
};

/** "Hiking", "Travel", "Hiking · Travel", "Rest & explore". */
export function activityLabel(kinds: DayActivityKind[]): string {
  return kinds.map((k) => DAY_ACTIVITY_LABELS[k]).join(' · ');
}

/** The effective overnight as a short line, or null when there is none. */
export function overnightLabel(
  overnight: ResolvedOvernight,
  trip: TripItem[],
): string | null {
  if (overnight.kind === 'stop') {
    const stop = overnight.stopId ? STOPS_BY_ID[overnight.stopId] : null;
    return stop ? stopShortName(stop) : null;
  }
  if (overnight.kind === 'stay') {
    const stay = trip.find((i) => i.id === overnight.tripItemId);
    // A stay the user deleted in Lists → Trip: say so rather than pretend.
    return stay ? stay.title : 'Stay no longer in your Trip plan';
  }
  return null;
}

/** One day in the compact list. Read-only unless the plan is being edited. */
function DayRow({
  day,
  trip,
  editing,
  marker,
  onEdit,
  onPreview,
}: {
  day: PlannedDay;
  trip: TripItem[];
  editing: boolean;
  /** How this row relates to what Today shows: the transient preview, the
   *  real (manual or date-resolved) day, or neither. */
  marker: 'previewing' | 'today' | null;
  onEdit: () => void;
  /** Preview this day on Today (view mode only; absent without a navigator). */
  onPreview?: () => void;
}) {
  const dateLabel = day.date ? formatDateFieldLabel(day.date) : null;
  const kindsLabel = activityLabel(day.kinds);
  const tonight = overnightLabel(day.overnight, trip);
  const from = day.fromStopId ? STOPS_BY_ID[day.fromStopId] : null;
  const to = day.toStopId ? STOPS_BY_ID[day.toStopId] : null;
  // "Preview day 4 on Today — Alesjaure to Sälka" / "— Rest & explore".
  const previewSummary =
    from && to ? `${stopShortName(from)} to ${stopShortName(to)}` : kindsLabel;
  // Matched transport is surfaced only on a day that HAS a travel activity —
  // the derivation matches every date honestly, but the plan must not imply an
  // activity the user did not put on the day. Wording and position come from
  // the shared helper, so this row and Today always agree on what came first.
  const travelLine = travelPresentation(day);
  const walkLead = hikingLead(day);

  return (
    <article className={`dayplan-day${marker !== null ? ' is-current' : ''}`}>
      <div className="dayplan-day__top">
        <span className="dayplan-day__label tnum">
          {dateLabel ? <span className="dayplan-day__date">{dateLabel}</span> : null}
          <span className="dayplan-day__kinds">
            {day.kinds.map((kind) => {
              const Icon = ACTIVITY_ICONS[kind];
              return <Icon key={kind} size={14} strokeWidth={2} aria-hidden />;
            })}
            {kindsLabel}
          </span>
        </span>
        {editing ? (
          <button
            type="button"
            className="stage-set-pill"
            onClick={onEdit}
            aria-label={`Edit ${dateLabel ?? `day ${day.number}`} — ${kindsLabel}`}
          >
            <Pencil size={13} strokeWidth={2.2} aria-hidden /> Edit
          </button>
        ) : marker === 'previewing' ? (
          // This day is on Today as a TEMPORARY preview — said plainly, and
          // deliberately not the "Today" pill: previewing is not being there.
          <span className="pill pill-current">
            <span className="dot" /> Previewing
          </span>
        ) : marker === 'today' ? (
          <span className="pill pill-current">
            <span className="dot" /> Today
          </span>
        ) : onPreview ? (
          // Small explicit action in the slot Edit occupies in edit mode.
          // Opens this day on Today without touching route progress.
          <button
            type="button"
            className="stage-set-pill"
            onClick={onPreview}
            aria-label={`Preview day ${day.number} on Today — ${previewSummary}`}
          >
            <Eye size={13} strokeWidth={2.2} aria-hidden /> Preview
          </button>
        ) : null}
      </div>

      {/* Travel first ⇒ its line sits above the walking, and the walk picks up
          a "then hike" lead. The planner has the room Today's hero has not. */}
      {travelLine?.position === 'before' ? (
        <p className="dayplan-day__via">{travelLine.line}</p>
      ) : null}

      {from && to ? (
        <h3 className="dayplan-day__route">
          {walkLead ? <span className="dayplan-day__lead">{walkLead} </span> : null}
          {stopShortName(from)} <span aria-hidden>→</span> {stopShortName(to)}
        </h3>
      ) : travelLine && !travelLine.isEmpty ? (
        <h3 className="dayplan-day__route">{travelLine.text}</h3>
      ) : null}

      {day.viaStopIds.length > 0 ? (
        <p className="dayplan-day__via">
          via{' '}
          {day.viaStopIds
            .map((id) => {
              const stop = STOPS_BY_ID[id];
              return stop ? stopShortName(stop) : id;
            })
            .join(' and ')}
        </p>
      ) : null}

      {/* Travel after the walk, or a travel-only day with nothing recorded yet
          (when it HAS movements they are already the headline above). Either
          way the day never hides that travel is part of it. */}
      {travelLine?.position === 'after' ||
      (travelLine?.position === 'only' && travelLine.isEmpty) ? (
        <p className="dayplan-day__via">{travelLine.line}</p>
      ) : null}

      <p className="dayplan-day__tonight">
        {tonight ? (
          <>
            <BedDouble size={13} strokeWidth={2} aria-hidden /> Tonight: {tonight}
          </>
        ) : (
          <span className="muted">No overnight</span>
        )}
      </p>
    </article>
  );
}

/** The quiet "add a day here" divider, only present in edit mode. */
function AddDayRow({ index, onOpen }: { index: number; onOpen: () => void }) {
  return (
    <div className="dayplan-add-row">
      <button
        type="button"
        className="dayplan-add"
        onClick={onOpen}
        aria-label={`Add a day at position ${index + 1}`}
      >
        <Plus size={14} strokeWidth={2.2} aria-hidden /> Add a day
      </button>
    </div>
  );
}

/**
 * Choose what a newly inserted day is. A hiking day starts with its
 * deterministic CONTINUATION leg — the section that physically connects to
 * the walking around the insertion point — named up front. No stage is taken
 * from any other day: the new day walks its own leg, even when that repeats
 * a section another day already walks.
 */
function AddDaySheet({
  index,
  onAdd,
  onClose,
}: {
  index: number;
  onAdd: (kinds: DayActivityKind[]) => void;
  onClose: () => void;
}) {
  const { dayPlan, plannedDays } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  // What the new hiking day would walk — derived by the same pure rule the
  // model applies, so the sheet can state it before anything changes.
  const startLeg =
    defaultLegsForNewDay(plannedDays, index, dayPlan?.direction ?? '', STAGE_TOPOLOGY)[0] ?? null;
  const startStage = startLeg ? STAGE_TOPOLOGY.find((s) => s.id === startLeg.stageId) : null;
  const canHike = startLeg !== null && startStage != null;
  const legSection = startStage
    ? startLeg?.orientation === 'opposite'
      ? `${shortName(startStage.toStopId)} → ${shortName(startStage.fromStopId)}`
      : `${shortName(startStage.fromStopId)} → ${shortName(startStage.toStopId)}`
    : null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2>Add a day</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="card-sub" style={{ marginTop: 0 }}>
          The new day becomes day {index + 1}. Later days move one day later.
        </p>
        <div className="dayplan-add-choices">
          <button type="button" className="btn btn-block" onClick={() => onAdd(['travel'])}>
            <BusFront size={16} strokeWidth={2} aria-hidden /> Travel day
          </button>
          <button type="button" className="btn btn-block" onClick={() => onAdd(['rest'])}>
            <Coffee size={16} strokeWidth={2} aria-hidden /> Rest &amp; explore day
          </button>
          <button
            type="button"
            className="btn btn-block"
            disabled={!canHike}
            onClick={() => onAdd(['hiking'])}
          >
            <Footprints size={16} strokeWidth={2} aria-hidden /> Hiking day
          </button>
        </div>
        {canHike ? (
          <p className="card-sub" style={{ marginTop: 10 }}>
            A hiking day starts with {legSection}, continuing the walking
            around it — no other day changes. Edit its legs afterwards.
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
