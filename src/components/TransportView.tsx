import { useMemo, useState } from 'react';
import {
  Bus,
  CalendarRange,
  ExternalLink,
  Footprints,
  Info,
  Link2,
  Ship,
  TrainFront,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { ListDisclosure } from './ListDisclosure';
import {
  TRANSPORT_SECTIONS,
  entriesForContext,
  timetableStatus,
} from '../data/transport.mjs';
import { formatVerifiedDate, todayIso } from '../utils/format';
import type {
  TimetableStatus,
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
}: {
  entry: TransportEntry;
  today: string;
  open: boolean;
  onToggle: () => void;
  headingLevel: 'h2' | 'h3';
}) {
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

export function TransportView() {
  const today = useMemo(() => todayIso(), []);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="banner-info" role="note">
        <Info size={16} strokeWidth={1.8} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Timetables here are static {`–`} planning snapshots for the 2026 season, not live
          status. Always confirm times, prices and disruptions with the official source before you
          travel.
        </span>
      </div>

      {TRANSPORT_SECTIONS.map((section) => {
        const entries = entriesForContext(section.id);
        if (entries.length === 0) return null;
        return (
          <section key={section.id} aria-label={section.title}>
            <div className="section-label">{section.title}</div>
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
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
