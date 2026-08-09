import { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, BusFront, Coffee, Eye, Footprints, Pencil, Plus } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { DateField } from './DateField';
import { ConfirmDialog } from './ConfirmDialog';
import { saveGeneratedFile } from '../runtime/fileSave';
import { DayPlanDaySheet } from './DayPlanDaySheet';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { STAGE_TOPOLOGY, STOPS_BY_ID, stopShortName } from '../trail/activeTrailContent';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { DAY_ACTIVITY_LABELS, hikingLegsOf, newDayLegCandidates } from '../plan/dayPlan.mjs';
import type { NewDayLegCandidate, NewDayStartLeg } from '../plan/dayPlan.mjs';
import { StartLegOptions } from './StartLegOptions';
import {
  coverageSummaryLines,
  dayPlanCoverageDiagnostics,
  hasCoverageDifferences,
} from '../plan/coverageDiagnostics.mjs';
import { orientedLegEndpoints } from '../plan/hikingLegs.mjs';
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
    setDayPlanJourneyActive,
    setCurrentPlannedDay,
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
        <RecoveryNotice />
        {/* ONE explanation. The screen header already says what a Day plan is
            for; this says only what picking a date actually does. It used to
            be three blocks — header, a paragraph above the field and a
            paragraph below it — all restating each other around a single
            input. */}
        <DateField
          label="First day of your journey"
          dialogTitle="First day of your journey"
          value=""
          onChange={createDayPlan}
          style={{ marginTop: 12 }}
        />
        <p className="card-sub" style={{ marginTop: 8 }}>
          Creates a plan with one stage per day. You can add travel and rest
          days afterwards, and change where each day ends.
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
      <RecoveryNotice />
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

      <div className="dayplan-journey-toggle">
        <span className="dayplan-journey-toggle__copy">
          <strong>Use Day plan on Today</strong>
          <span>Today follows your dates instead of the seven route stages.</span>
          {dayPlan.journeyActive ? <em>Currently used by Today.</em> : null}
        </span>
        <button
          type="button"
          className="setting-switch"
          role="switch"
          aria-checked={dayPlan.journeyActive}
          aria-label="Use Day plan on Today"
          onClick={() => setDayPlanJourneyActive(!dayPlan.journeyActive)}
        >
          <span className="setting-switch__thumb" aria-hidden />
          <span className="sr-only">{dayPlan.journeyActive ? 'On' : 'Off'}</span>
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
          <CoverageSummary />
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
                    : dayPlan.journeyActive
                      ? 'current'
                      : null
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
              onSelect={
                dayPlan.journeyActive && day.id !== currentPlannedDay?.id && onNavigate
                  ? () => {
                      setCurrentPlannedDay(day.id);
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
          onAdd={(kinds, startLeg) => {
            addPlannedDay(addAt, kinds, startLeg);
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

/**
 * The set-aside original of a Day plan that could not be loaded (most
 * importantly: a v9 stage-count plan the v10 migration refused). One calm
 * notice, two actions: export the original data, or remove the copy after
 * an explicit confirmation. The payload itself is never rendered, repaired
 * or reinterpreted — it is the user's data, held verbatim until they
 * decide. Nothing here mutates anything except the confirmed removal.
 */
function RecoveryNotice() {
  const { dayPlanRecovery, removeDayPlanRecovery } = useStore();
  const [confirming, setConfirming] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  if (!dayPlanRecovery) return null;

  // Same filename and same payload the browser download always produced,
  // routed through the platform save boundary so the Android wrapper opens
  // the system picker instead of the blob-URL anchor its WebView ignores.
  // A failure MUST be visible here: this button exists so the user can keep
  // data they are about to delete with the button beside it, and a silent
  // no-op would invite exactly that loss. Cancelling the picker is not a
  // failure and says nothing.
  const download = async () => {
    setSaveFailed(false);
    const payload = {
      app: 'fjallkompis',
      kind: 'day-plan-recovery',
      reason: dayPlanRecovery.reason,
      exportedAt: new Date().toISOString(),
      dayPlan: dayPlanRecovery.dayPlan,
    };
    try {
      await saveGeneratedFile(
        'fjallkompis-day-plan-recovery.json',
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        'application/json',
      );
    } catch (err) {
      console.warn('Fjallkompis: could not save the Day plan recovery copy.', err);
      setSaveFailed(true);
    }
  };

  return (
    <div className="dayplan-recovery" role="status">
      <p className="card-sub" style={{ marginTop: 0 }}>
        <strong>Your saved Day plan could not be migrated to this version.</strong>{' '}
        The original was set aside untouched and nothing else was affected.
        Download it to keep a copy, or remove it if you no longer need it.
      </p>
      {saveFailed ? (
        <p className="card-sub" role="alert" style={{ marginTop: 0 }}>
          The copy could not be saved, so nothing was written. Try again before
          removing it.
        </p>
      ) : null}
      <div className="dayplan-recovery__actions">
        <button type="button" className="btn" onClick={() => void download()}>
          Download original plan
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
          Remove recovery copy
        </button>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Remove the recovery copy?"
          body="The original Day plan data is deleted permanently — download it first if you want to keep it. Your current plan, route progress and everything else are not affected."
          primaryLabel="Remove copy"
          destructive
          onConfirm={() => {
            removeDayPlanRecovery();
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

/** "Abisko → Abiskojaure" for a canonical stage id (canonical orientation). */
const sectionName = (stageId: string) => {
  const stage = STAGE_TOPOLOGY.find((s) => s.id === stageId);
  return stage ? `${shortName(stage.fromStopId)} → ${shortName(stage.toStopId)}` : stageId;
};

/**
 * How the plan differs from the full canonical route — INFORMATION, not an
 * error. Shown only in edit mode (where the differences are being made), as
 * one compact summary with the specifics behind a disclosure. Reading it
 * never mutates anything, and nothing here offers an automatic "repair":
 * resolving a difference is always an explicit edit of one chosen day.
 */
function CoverageSummary() {
  const { dayPlan, plannedDays } = useStore();
  const diagnostics = useMemo(
    () =>
      dayPlanCoverageDiagnostics(plannedDays, dayPlan?.direction ?? '', STAGE_TOPOLOGY),
    [plannedDays, dayPlan],
  );
  if (!hasCoverageDifferences(diagnostics)) return null;

  const dayNumber = (dayId: string) => plannedDays.find((d) => d.id === dayId)?.number;
  /** The oriented section a leg id walks, with its day number. */
  const legDescription = (legId: string): string | null => {
    for (const day of plannedDays) {
      const leg = hikingLegsOf(day).find((l) => l.id === legId);
      if (!leg) continue;
      const ends = orientedLegEndpoints(leg, STAGE_TOPOLOGY);
      return ends
        ? `day ${day.number}: ${shortName(ends.fromStopId)} → ${shortName(ends.toStopId)}`
        : null;
    }
    return null;
  };

  return (
    <details className="dayplan-coverage">
      <summary>
        <strong>Your plan differs from the full route</strong>
        <span className="card-sub dayplan-coverage__lines">
          {coverageSummaryLines(diagnostics).join(' · ')}
        </span>
      </summary>
      <div className="dayplan-coverage__detail">
        {diagnostics.missingStageIds.length > 0 ? (
          <p className="card-sub">
            Not planned: {diagnostics.missingStageIds.map(sectionName).join(', ')}
          </p>
        ) : null}
        {diagnostics.repeatedStages.length > 0 ? (
          <p className="card-sub">
            Walked more than once:{' '}
            {diagnostics.repeatedStages
              .map((r) => `${sectionName(r.stageId)} (${r.occurrences}×)`)
              .join(', ')}
          </p>
        ) : null}
        {diagnostics.oppositeLegIds.length > 0 ? (
          <p className="card-sub">
            Walked in reverse:{' '}
            {diagnostics.oppositeLegIds
              .map(legDescription)
              .filter(Boolean)
              .join(', ')}
          </p>
        ) : null}
        {diagnostics.disconnectedDayBoundaries.map((boundary) => (
          <p className="card-sub" key={`${boundary.fromDayId}:${boundary.toDayId}`}>
            Day {dayNumber(boundary.toDayId)} starts somewhere other than day{' '}
            {dayNumber(boundary.fromDayId)} ends — plan the travel between them however suits
            you.
          </p>
        ))}
        {diagnostics.omitsCanonicalStart ? (
          <p className="card-sub">Your journey starts after the canonical route’s start.</p>
        ) : null}
        {diagnostics.omitsCanonicalEnd ? (
          <p className="card-sub">Your journey ends before the canonical route’s end.</p>
        ) : null}
      </div>
    </details>
  );
}

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
  onSelect,
}: {
  day: PlannedDay;
  trip: TripItem[];
  editing: boolean;
  /** How this row relates to what Today shows: the transient preview, the
   *  real (manual or date-resolved) day, or neither. */
  marker: 'previewing' | 'current' | null;
  onEdit: () => void;
  /** Preview this day on Today (view mode only; absent without a navigator). */
  onPreview?: () => void;
  /** Persist this calendar day as the current personal day. */
  onSelect?: () => void;
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
        ) : marker === 'current' ? (
          <span className="pill pill-current">
            <span className="dot" /> Current
          </span>
        ) : onPreview || onSelect ? (
          <span className="dayplan-day__actions">
            {onSelect ? (
              <button
                type="button"
                className="stage-set-pill"
                onClick={onSelect}
                aria-label={`Set current day to day ${day.number} — ${previewSummary}`}
              >
                Set current day
              </button>
            ) : null}
            {onPreview ? (
              <button
                type="button"
                className="stage-set-pill"
                onClick={onPreview}
                aria-label={`Preview day ${day.number} on Today — ${previewSummary}`}
              >
                <Eye size={13} strokeWidth={2.2} aria-hidden /> Preview
              </button>
            ) : null}
          </span>
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
 * Choose what a newly inserted day is. A hiking day walks an EXPLICITLY
 * chosen connecting section: when exactly one candidate is not yet in the
 * plan it is proposed by name up front, and in every other case — several
 * possibilities, or only sections the plan already walks — a chooser asks,
 * with repeats marked. A stage is never repeated silently, and no stage is
 * taken from any other day: the new day walks its own leg.
 */
function AddDaySheet({
  index,
  onAdd,
  onClose,
}: {
  index: number;
  onAdd: (kinds: DayActivityKind[], startLeg?: NewDayStartLeg) => void;
  onClose: () => void;
}) {
  const { dayPlan, plannedDays } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  // Every physically valid starting section — the same pure rule the model
  // validates against, so the sheet states the choice before anything
  // changes. Auto-proceed ONLY when exactly one candidate is not yet
  // planned; a repeat always requires the explicit selection below.
  const candidates = newDayLegCandidates(
    plannedDays,
    index,
    dayPlan?.direction ?? '',
    STAGE_TOPOLOGY,
  );
  const unplanned = candidates.filter((c) => !c.alreadyPlanned);
  const proposed: NewDayLegCandidate | null = unplanned.length === 1 ? unplanned[0] : null;
  const [choosingStart, setChoosingStart] = useState(false);
  const proposedSection = proposed
    ? `${shortName(proposed.fromStopId)} → ${shortName(proposed.toStopId)}`
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
          <h2>{choosingStart ? 'Starts with' : 'Add a day'}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {choosingStart ? (
          <>
            <p className="card-sub" style={{ marginTop: 0 }}>
              Choose which connecting section the new hiking day walks first.
              No other day changes; edit its legs afterwards.
            </p>
            <StartLegOptions
              candidates={candidates}
              onChoose={(candidate) => onAdd(['hiking'], candidate)}
            />
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setChoosingStart(false)}
            >
              Back
            </button>
          </>
        ) : (
          <>
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
                disabled={candidates.length === 0}
                onClick={() =>
                  proposed ? onAdd(['hiking'], proposed) : setChoosingStart(true)
                }
              >
                <Footprints size={16} strokeWidth={2} aria-hidden /> Hiking day
              </button>
            </div>
            {proposed ? (
              <p className="card-sub" style={{ marginTop: 10 }}>
                A hiking day starts with {proposedSection} — the connecting
                section not yet in your plan. No other day changes; edit its
                legs afterwards.
              </p>
            ) : candidates.length > 0 ? (
              <p className="card-sub" style={{ marginTop: 10 }}>
                Several connecting sections are possible — choosing Hiking day
                asks which one to start with. Sections already in your plan
                are marked.
              </p>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}
