import { useEffect, useMemo, useState } from 'react';
import {
  Bus,
  CalendarRange,
  ExternalLink,
  Footprints,
  Info,
  Link2,
  Luggage,
  Ship,
  SignalLow,
  TrainFront,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { ListDisclosure } from './ListDisclosure';
import { ContextHelp } from './ContextHelp';
import { useStore } from '../store/AppStore';
import {
  TRAIL_CAVEATS,
  timetableCoverageFor,
  transportSectionsFor,
} from '../trail/activeTrailContent';
import { formatVerifiedDate, todayIso } from '../utils/format';
import type {
  TimetableCoverage,
  TimetablePeriod,
  TimetableStatus,
  TransportContext,
  TransportEntry,
  TransportMode,
  TransportSchedule,
} from '../types';

function ModeIcon({ mode }: { mode: TransportMode }) {
  const Icon = mode === 'train' ? TrainFront : mode === 'boat' ? Ship : Bus;
  return <Icon size={16} strokeWidth={1.9} aria-hidden />;
}

const MODE_LABEL: Record<TransportMode, string> = {
  bus: 'Bus',
  train: 'Train',
  boat: 'Boat',
};

/**
 * Status pill — shape + text, never colour alone. Expired also carries an icon.
 *
 * Four of these mean the same thing to a hiker: the app cannot give times for
 * that date. The pill says WHICH of the four, and {@link NoTimetableNotice}
 * always spells out what it means — a pill on its own must never be read as
 * "the service is not running", which is the one thing this data cannot know.
 */
function StatusBadge({ status, entry }: { status: TimetableStatus; entry: TransportEntry }) {
  if (status === 'live') {
    return <span className="pill pill-glacier">Live times</span>;
  }
  if (status === 'expired') {
    return (
      <span className="pill pill-warn">
        <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
        Expired
      </span>
    );
  }
  if (status === 'upcoming') {
    return <span className="pill">Not yet valid</span>;
  }
  if (status === 'uncovered') {
    return <span className="pill">No timetable</span>;
  }
  if (status === 'ambiguous') {
    return <span className="pill">Check source</span>;
  }
  if (status === 'valid') {
    return <span className="pill pill-good">In season</span>;
  }
  return <span className="pill">{MODE_LABEL[entry.mode]}</span>;
}

/** "1 July – 16 August 2026" for each stored table, for the "what we do have" line. */
function storedRangesText(periods: TimetablePeriod[]): string {
  return periods.map((p) => p.validityText ?? `${p.validFrom} – ${p.validTo}`).join('; ');
}

/**
 * The honest answer when no stored period covers the date being asked about.
 *
 * It says three separate things on purpose: what the app does not have, what it
 * does have, and who to ask instead. Leaving out the middle one turns a data
 * gap into "no service"; leaving out the last one leaves a hiker with nowhere
 * to go. It is never hidden behind a disclosure.
 */
function NoTimetableNotice({
  coverage,
  entry,
}: {
  coverage: TimetableCoverage;
  entry: TransportEntry;
}) {
  const { status } = coverage;
  if (status !== 'upcoming' && status !== 'expired' && status !== 'uncovered' && status !== 'ambiguous') {
    return null;
  }
  const expired = status === 'expired';
  const reason =
    status === 'upcoming'
      ? 'The stored timetable has not started yet.'
      : status === 'expired'
        ? 'The stored timetable has run out.'
        : status === 'uncovered'
          ? 'This date falls between the stored timetables.'
          : 'Two stored timetables disagree about this date.';

  return (
    <p className={expired ? 'banner-warn' : 'banner-info'} style={{ marginTop: 14 }}>
      {expired ? (
        <TriangleAlert size={15} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
      ) : (
        <Info size={15} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
      )}
      <span>
        <strong>No timetable for this date.</strong> {reason} Fjallkompis has no verified{' '}
        {MODE_LABEL[entry.mode].toLowerCase()} timetable stored for{' '}
        {coverage.date ? formatVerifiedDate(coverage.date) : 'this date'}. The service may still
        run — check {entry.operator} before travelling.
        {coverage.periods.length ? (
          <>
            {' '}
            Stored timetables: {storedRangesText(coverage.periods)}.
          </>
        ) : null}
      </span>
    </p>
  );
}

/**
 * One stored timetable other than the one in force, shown inside the card's
 * disclosure. It repeats the validity and the source link because a period is
 * only readable next to the dates and the document it came from.
 */
function StoredPeriod({ period }: { period: TimetablePeriod }) {
  return (
    <div className="tp-period">
      <div className="tp-block-head">
        <CalendarRange size={14} strokeWidth={2} aria-hidden />
        {period.validityText ?? `${period.validFrom} – ${period.validTo}`}
      </div>
      {period.operatingDays ? <p className="tp-meta">Runs: {period.operatingDays}</p> : null}
      <div className="tp-scheds">
        {period.schedules.map((s) => (
          <ScheduleBlock key={s.id} schedule={s} />
        ))}
      </div>
      <StopCoverageNote period={period} />
      {period.connections?.length ? (
        <ul className="tp-bullets">
          {period.connections.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <p className="tp-meta">
        Source: {period.source.title} · Checked {formatVerifiedDate(period.source.lastVerified)}
      </p>
      <a
        className="btn btn-ghost btn-block"
        href={period.source.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
        Official timetable — {period.validityText ?? 'this period'}
      </a>
    </div>
  );
}

/**
 * Says out loud when the stored calls are a selection rather than the whole
 * table. Line 91 runs on to Riksgränsen and its official table also lists
 * halts with no times, so a hiker must not read the four or five calls here as
 * "these are all the stops".
 */
function StopCoverageNote({ period }: { period: TimetablePeriod }) {
  if (period.stopCoverage !== 'selected') return null;
  return (
    <p className="tp-meta">
      Selected stops for this route — the official timetable lists every stop on the line.
    </p>
  );
}

function ScheduleBlock({ schedule }: { schedule: TransportSchedule }) {
  return (
    <div className="tp-sched">
      <div className="tp-sched-head">
        <span className="tp-sched-label">{schedule.label}</span>
        {schedule.dayRule ? <span className="tp-sched-day">{schedule.dayRule}</span> : null}
      </div>
      {schedule.exception ? <p className="tp-sched-note">{schedule.exception}</p> : null}
      <ul className="tp-calls">
        {schedule.calls.map((c, i) => (
          <li key={i} className="tp-call">
            {c.time ? <span className="tp-time tnum">{c.time}</span> : <span className="tp-time" />}
            <span className="tp-place">
              {c.place ?? 'Departure'}
              {c.note ? <span className="tp-call-note"> · {c.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransportCard({
  entry,
  today,
  open,
  onToggle,
  headingLevel,
  onAddToTrip,
  onViewInTrip,
}: {
  entry: TransportEntry;
  today: string;
  open: boolean;
  onToggle: () => void;
  headingLevel: 'h2' | 'h3';
  onAddToTrip?: (entryId: string) => void;
  onViewInTrip?: (itemId: string) => void;
}) {
  // Personal Trip items already linked to this reference entry. Linking is
  // never globally unique (the same bus can be used on different dates) —
  // this only reshapes the action so an ACCIDENTAL duplicate takes a
  // deliberate second tap.
  const { state } = useStore();
  const linkedItem = state.trip.find(
    (i) => i.kind === 'transport' && i.linkedTransportId === entry.id,
  );
  // One resolution for the whole card: which stored table applies to the date
  // being asked about, and what the honest answer is when none does.
  const coverage = timetableCoverageFor(entry, today);
  const { status, period } = coverage;
  const otherPeriods = coverage.periods.filter((p) => p !== period);
  const source = period?.source ?? entry.source ?? null;
  const connections = period?.connections ?? entry.connections;
  const validity = entry.live
    ? 'Live times'
    : period
      ? period.validityText ?? ''
      : coverage.periods.length > 1
        ? `${coverage.periods.length} stored timetables`
        : 'No timetable for this date';
  // Other periods are worth a look on their own when none is in force — that
  // is the only place the times still live.
  const [showOthers, setShowOthers] = useState(period === null);
  const othersId = `tp-others-${entry.id}`;

  return (
    <ListDisclosure
      id={`tp-${entry.id}`}
      title={entry.title}
      subtitle={
        <span className="tp-sub">
          <ModeIcon mode={entry.mode} /> {MODE_LABEL[entry.mode]}
          {validity ? <span className="tp-sub-sep"> · {validity}</span> : null}
        </span>
      }
      headerRight={<StatusBadge status={status} entry={entry} />}
      open={open}
      onToggle={onToggle}
      headingLevel={headingLevel}
    >
      {/* No usable stored table for this date: visible, never hidden */}
      <NoTimetableNotice coverage={coverage} entry={entry} />

      <p className="stop-summary" style={{ marginTop: period || entry.live ? 14 : 10 }}>
        {entry.summary}
      </p>

      {entry.direction ? <p className="stop-desc" style={{ marginTop: 6 }}>{entry.direction}</p> : null}

      {/* Validity / operating days — of the table actually in force */}
      {!entry.live ? (
        <div className="tp-facts">
          {period?.validityText ? (
            <span className="stop-fact-row">
              <CalendarRange size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Valid:</strong> {period.validityText}
              </span>
            </span>
          ) : null}
          {period?.operatingDays ? (
            <span className="stop-fact-row">
              <Info size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Runs:</strong> {period.operatingDays}
              </span>
            </span>
          ) : null}
          {entry.durationText ? (
            <span className="stop-fact-row">
              <Ship size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Crossing:</strong> {entry.durationText}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Schedules — only ever the period that covers the date */}
      {period?.schedules.length ? (
        <>
          <div className="tp-scheds">
            {period.schedules.map((s) => (
              <ScheduleBlock key={s.id} schedule={s} />
            ))}
          </div>
          <StopCoverageNote period={period} />
        </>
      ) : null}

      {/* Every other stored table, one tap away. Open by default when nothing
          is in force, because then this is where the times are. */}
      {otherPeriods.length ? (
        <div className="tp-block">
          <button
            type="button"
            className="btn btn-ghost btn-block"
            aria-expanded={showOthers}
            aria-controls={othersId}
            onClick={() => setShowOthers((v) => !v)}
          >
            <CalendarRange size={15} strokeWidth={1.8} aria-hidden />
            {showOthers ? 'Hide' : 'Show'}{' '}
            {period ? 'other stored timetables' : 'stored timetables'} ({otherPeriods.length})
          </button>
          <div id={othersId} hidden={!showOthers}>
            {otherPeriods.map((p) => (
              <StoredPeriod key={p.id} period={p} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Prices */}
      {entry.prices?.length ? (
        <div className="tp-block">
          <div className="tp-block-head">
            <Wallet size={14} strokeWidth={2} aria-hidden /> Prices
          </div>
          <ul className="tp-kv">
            {entry.prices.map((pr) => (
              <li key={pr.label}>
                <span>{pr.label}</span>
                <span className="tnum">{pr.price}</span>
              </li>
            ))}
          </ul>
          {entry.paymentMethods ? <p className="tp-meta">Payment: {entry.paymentMethods}</p> : null}
        </div>
      ) : entry.paymentMethods ? (
        <p className="tp-meta" style={{ marginTop: 10 }}>Payment: {entry.paymentMethods}</p>
      ) : null}

      {/* Booking */}
      {entry.booking || entry.bookingDeadline ? (
        <div className="tp-block">
          <div className="tp-block-head">Booking</div>
          {entry.booking ? <p className="tp-meta">{entry.booking}</p> : null}
          {entry.bookingDeadline ? <p className="tp-meta">{entry.bookingDeadline}</p> : null}
        </div>
      ) : null}

      {/* Walking context */}
      {entry.walkingContext?.length ? (
        <div className="tp-block">
          <div className="tp-block-head">
            <Footprints size={14} strokeWidth={2} aria-hidden /> Walking
          </div>
          <ul className="tp-bullets">
            {entry.walkingContext.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Connections — these quote a period's own times, so they follow it */}
      {connections?.length ? (
        <div className="tp-block">
          <div className="tp-block-head">Connections</div>
          <ul className="tp-bullets">
            {connections.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Warnings */}
      {entry.warnings?.length ? (
        <div className="stop-warnings">
          {entry.warnings.map((w) => (
            <p key={w} className="banner-warn" style={{ margin: 0 }}>
              <TriangleAlert size={15} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{w}</span>
            </p>
          ))}
        </div>
      ) : null}

      {/* Contact */}
      {entry.contact?.length ? (
        <p className="tp-meta" style={{ marginTop: 10 }}>
          {entry.contact.join(' · ')}
        </p>
      ) : null}

      {/* Personal Trip integration — creates a personal transport item with
          only verified source facts prefilled; the user supplies their own
          date, times and booking status. Never shown without the callbacks
          (the reference view stays purely informational elsewhere). */}
      {onAddToTrip ? (
        <div className="row" style={{ marginTop: 14 }}>
          {linkedItem && onViewInTrip ? (
            <>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => onViewInTrip(linkedItem.id)}
              >
                <Luggage size={15} strokeWidth={1.9} aria-hidden /> View in Trip
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-plan-accent"
                style={{ flex: 1 }}
                onClick={() => onAddToTrip(entry.id)}
              >
                Add to Trip again
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-block btn-plan-accent"
              onClick={() => onAddToTrip(entry.id)}
            >
              <Luggage size={15} strokeWidth={1.9} aria-hidden /> Add to Trip
            </button>
          )}
        </div>
      ) : null}

      {/* Source + official links. The source shown is the document the times
          above actually came from; with no period in force there is no such
          document, so the operator's own timetable index takes its place
          rather than a dated PDF that does not apply. */}
      <div className="stop-source">
        {source ? (
          <>
            <p>
              {source.kind === 'live' ? 'Live service' : 'Static timetable snapshot'} · Source:{' '}
              {source.title} · Checked {formatVerifiedDate(source.lastVerified)}
            </p>
            <a
              className="btn btn-ghost btn-block"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
              {source.kind === 'live'
                ? `Check ${entry.operator} live`
                : `Official timetable — ${entry.operator}`}
            </a>
          </>
        ) : null}
        {/* Only where it earns its place: with a period in force each stored
            table already links its own document, so this would be a third
            near-identical button. With none in force it is the whole answer to
            "then where do I look?". */}
        {entry.operatorTimetables && !period ? (
          <a
            className="btn btn-ghost btn-block"
            href={entry.operatorTimetables.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
            {entry.operatorTimetables.label}
          </a>
        ) : null}
        {entry.extraLinks?.map((l) => (
          <a
            key={l.url}
            className="btn btn-ghost btn-block"
            style={{ marginTop: 8 }}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Link2 size={15} strokeWidth={1.8} aria-hidden />
            {l.label}
          </a>
        ))}
      </div>
    </ListDisclosure>
  );
}

/**
 * Page-level "About transport information" help — the former static-timetable
 * banner. Rendered in the Lists header's action slot when Transport is active.
 */
export function TransportHelp() {
  return (
    <ContextHelp label="About transport information" title="About transport information">
      <p>Timetables here are static planning snapshots for the 2026 season.</p>
      <p>They are not live status.</p>
      <p>
        Always confirm times, prices and disruptions through the official sources before you
        travel.
      </p>
      {/* The reasoning behind the one-line caveat at the top of the list.
          It belongs here rather than beside every phone number, because it
          qualifies the same thing the paragraphs above do: what you can rely
          on getting once you have left. */}
      <p>{TRAIL_CAVEATS.connectivity.full}</p>
    </ContextHelp>
  );
}

export function TransportView({
  initialEntryId,
  initialContext,
  onAddToTrip,
  onViewInTrip,
}: {
  initialEntryId?: string;
  initialContext?: TransportContext;
  /** Present when the personal Trip integration is available (Lists). */
  onAddToTrip?: (entryId: string) => void;
  onViewInTrip?: (itemId: string) => void;
} = {}) {
  const today = useMemo(() => todayIso(), []);

  // The whole reference is assembled for the direction the hiker walks — which
  // service belongs in which section, and how each section names its
  // endpoints. This view holds no direction logic of its own: it never
  // reverses, relabels or filters a service, and there is no string handling
  // anywhere below that could turn one route into its opposite.
  const { routeDirection } = useStore();
  const { sections } = useMemo(
    () => transportSectionsFor(routeDirection),
    [routeDirection],
  );

  // A deep link may only open a service that is actually on screen for this
  // direction, so a stale target scrolls nowhere rather than silently
  // expanding a card the hiker cannot see.
  const validEntry =
    initialEntryId && sections.some((s) => s.entries.some((e) => e.id === initialEntryId))
      ? initialEntryId
      : undefined;
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(validEntry ? [validEntry] : []),
  );

  const toggle = (id: string) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // One-shot deep link: scroll to and focus either a specific entry's header
  // or (Abisko → "Getting to the trail") a whole section's heading.
  useEffect(() => {
    const targetId = validEntry
      ? `disc-h-tp-${validEntry}`
      : initialContext
        ? `tp-section-${initialContext}`
        : null;
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* The connectivity caveat heads the whole reference surface, because
          what it qualifies is spread across every card below it: operator
          phone numbers, payment methods, booking instructions, the official
          timetable links and the one live planner. Repeating it beside each
          of those would be four warnings saying one thing. One calm line
          here, the reasoning in "About transport information" (the header's
          existing context help) — no banner, and nothing that pushes the
          first timetable off the screen. */}
      <p
        className="stop-fact-row tp-meta"
        style={{ margin: '0 2px 12px', alignItems: 'flex-start' }}
      >
        <SignalLow size={15} strokeWidth={1.8} aria-hidden style={{ marginTop: 3 }} />
        <span>{TRAIL_CAVEATS.connectivity.short}</span>
      </p>

      {sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <div id={`tp-section-${section.id}`} className="section-label" tabIndex={-1}>
            {section.title}
          </div>
          {/* The blurb names the actual endpoints for the active walking
              direction ("Kiruna to the Abisko trailhead" / "Abisko back to
              Kiruna"), so which way round the reference is being read is
              legible from the section labels alone. */}
          <p className="card-sub" style={{ margin: '-4px 2px 10px' }}>
            {section.blurb}
          </p>
          <div className="stack">
            {section.entries.map((entry, i) => (
              <TransportCard
                key={entry.id}
                entry={entry}
                today={today}
                open={open.has(entry.id)}
                onToggle={() => toggle(entry.id)}
                headingLevel={i === 0 ? 'h2' : 'h3'}
                onAddToTrip={onAddToTrip}
                onViewInTrip={onViewInTrip}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
