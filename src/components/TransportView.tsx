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
  TrainFront,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { ListDisclosure } from './ListDisclosure';
import { ContextHelp } from './ContextHelp';
import { useStore } from '../store/AppStore';
import {
  TRANSPORT_ENTRIES,
  TRANSPORT_SECTIONS,
  entriesForContext,
  timetableStatus,
} from '../data/transport.mjs';
import { formatVerifiedDate, todayIso } from '../utils/format';
import type {
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

/** Status pill — shape + text, never colour alone. Expired also carries an icon. */
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
    return <span className="pill">Seasonal</span>;
  }
  if (status === 'valid') {
    return <span className="pill pill-good">In season</span>;
  }
  return <span className="pill">{MODE_LABEL[entry.mode]}</span>;
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
  const status = timetableStatus(entry, today);
  const validity =
    entry.live ? 'Live times' : entry.validityText ?? (entry.validFrom ? '' : 'Check source');

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
      {/* Expired: visible, never hidden */}
      {status === 'expired' ? (
        <p className="banner-warn" style={{ marginTop: 14 }}>
          <TriangleAlert size={15} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Timetable expired.</strong> This {MODE_LABEL[entry.mode].toLowerCase()}{' '}
            timetable was valid {entry.validityText}. Check the official source for the current
            schedule.
          </span>
        </p>
      ) : null}

      <p className="stop-summary" style={{ marginTop: status === 'expired' ? 10 : 14 }}>
        {entry.summary}
      </p>

      {entry.direction ? <p className="stop-desc" style={{ marginTop: 6 }}>{entry.direction}</p> : null}

      {/* Validity / operating days */}
      {!entry.live ? (
        <div className="tp-facts">
          {entry.validityText ? (
            <span className="stop-fact-row">
              <CalendarRange size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Valid:</strong> {entry.validityText}
              </span>
            </span>
          ) : null}
          {entry.operatingDays ? (
            <span className="stop-fact-row">
              <Info size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Runs:</strong> {entry.operatingDays}
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

      {/* Schedules */}
      {entry.schedules?.length ? (
        <div className="tp-scheds">
          {entry.schedules.map((s) => (
            <ScheduleBlock key={s.id} schedule={s} />
          ))}
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

      {/* Connections */}
      {entry.connections?.length ? (
        <div className="tp-block">
          <div className="tp-block-head">Connections</div>
          <ul className="tp-bullets">
            {entry.connections.map((c) => (
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
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => onAddToTrip(entry.id)}
              >
                Add to Trip again
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => onAddToTrip(entry.id)}
            >
              <Luggage size={15} strokeWidth={1.9} aria-hidden /> Add to Trip
            </button>
          )}
        </div>
      ) : null}

      {/* Source + official links */}
      <div className="stop-source">
        <p>
          {entry.source.kind === 'live' ? 'Live service' : 'Static timetable snapshot'} · Source:{' '}
          {entry.source.title} · Checked {formatVerifiedDate(entry.source.lastVerified)}
        </p>
        <a
          className="btn btn-ghost btn-block"
          href={entry.source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          {entry.source.kind === 'live' ? `Check ${entry.operator} live` : `Official timetable — ${entry.operator}`}
        </a>
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
  const validEntry = initialEntryId && TRANSPORT_ENTRIES.some((e) => e.id === initialEntryId)
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
      {TRANSPORT_SECTIONS.map((section) => {
        const entries = entriesForContext(section.id);
        if (entries.length === 0) return null;
        return (
          <section key={section.id} aria-label={section.title}>
            <div id={`tp-section-${section.id}`} className="section-label" tabIndex={-1}>
              {section.title}
            </div>
            <p className="card-sub" style={{ margin: '-4px 2px 10px' }}>
              {section.blurb}
            </p>
            <div className="stack">
              {entries.map((entry, i) => (
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
        );
      })}
    </>
  );
}
