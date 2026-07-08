import { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  Info,
  Mountain,
  NotebookPen,
  TriangleAlert,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { FacilityIcon } from '../components/FacilityIcon';
import { StopVisual } from '../components/StopVisual';
import {
  STOPS,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { formatDistanceKm, formatVerifiedDate, stopTypeLabel } from '../utils/format';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID, WAYPOINT_ROUTE_KM } from '../route/routeData';
import type { TrailStop } from '../types';

function TripNote({ stop }: { stop: TrailStop }) {
  const { getStopNote, setStopNote } = useStore();
  const note = getStopNote(stop.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(note);
    setEditing(true);
  };
  const save = () => {
    setStopNote(stop.id, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="stop-note">
        <label className="field" style={{ marginTop: 0 }}>
          <span>Trip note — practical reminders for this stop</span>
          <textarea
            className="textarea"
            autoFocus
            placeholder="Bunk number, water source, what to buy here, what to remember next time…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>
            Save note
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (note.trim()) {
    return (
      <div className="stop-note">
        <div className="row-between">
          <span className="stop-note-label">
            <NotebookPen size={14} strokeWidth={2} aria-hidden /> Trip note
          </span>
          <button className="link-btn" onClick={startEdit}>
            Edit
          </button>
        </div>
        <p className="stop-note-preview">{note}</p>
      </div>
    );
  }

  return (
    <button className="btn btn-ghost btn-block stop-note-add" onClick={startEdit}>
      <NotebookPen size={16} strokeWidth={1.8} aria-hidden /> Add trip note
    </button>
  );
}

function StopCard({
  stop,
  open,
  onToggle,
  headerRef,
  onHeaderKeyDown,
}: {
  stop: TrailStop;
  open: boolean;
  onToggle: () => void;
  headerRef: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const waypoint = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]];
  const routeKm = WAYPOINT_ROUTE_KM[HUT_TO_WAYPOINT[stop.id]] ?? 0;
  const elevation = waypoint?.elevation != null ? Math.round(waypoint.elevation) : null;
  const icons = collapsedFacilities(stop);
  const absences = importantAbsences(stop);
  const noShop = absences.some((f) => f.id === 'shop');
  const headerId = `stop-h-${stop.id}`;
  const panelId = `stop-p-${stop.id}`;

  return (
    <section className={`card stop-card ${open ? 'is-open' : ''}`}>
      <h2 className="stop-heading">
        <button
          ref={headerRef}
          id={headerId}
          className="stop-header"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          onKeyDown={onHeaderKeyDown}
        >
          <span className="stop-header-main">
            <span className="stop-name">{stopShortName(stop)}</span>
            <span className="stop-meta">
              <span className="stop-type">{stopTypeLabel(stop.type)}</span>
              {elevation != null ? (
                <span className="stop-fact tnum">
                  <Mountain size={13} strokeWidth={2} aria-hidden /> {elevation} m
                </span>
              ) : null}
              <span className="stop-fact tnum">
                {routeKm > 0 ? `${formatDistanceKm(routeKm)} in` : 'Start'}
              </span>
            </span>
            <span className="stop-badges">
              {icons.map((f) => (
                <span
                  key={f.id}
                  className="stop-fac-ic"
                  role="img"
                  aria-label={f.label}
                  title={f.label}
                >
                  <FacilityIcon id={f.id} size={15} />
                </span>
              ))}
              {noShop ? (
                <span className="pill pill-warn stop-noshop">
                  <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown className="stop-chevron" size={20} strokeWidth={2} aria-hidden />
        </button>
      </h2>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="stop-panel"
        hidden={!open}
      >
        <StopVisual stop={stop} />

        <p className="stop-official-name">{stop.name}</p>
        <p className="stop-summary">{stop.summary}</p>
        <p className="stop-desc">{stop.description}</p>

        {stop.warnings?.length ? (
          <div className="stop-warnings">
            {stop.warnings.map((w) => (
              <p key={w} className="banner-warn" style={{ margin: 0 }}>
                <TriangleAlert size={15} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{w}</span>
              </p>
            ))}
          </div>
        ) : null}

        <div className="stop-fac-grid" role="list" aria-label="Facilities">
          {stop.facilities.map((f) => (
            <span
              key={f.id}
              role="listitem"
              className={`stop-fac ${f.importantAbsence ? 'is-absent' : ''}`}
            >
              {f.importantAbsence ? (
                <TriangleAlert size={15} strokeWidth={2} aria-hidden />
              ) : (
                <FacilityIcon id={f.id} size={15} />
              )}
              <span>
                {f.label}
                {f.detail ? <small> · {f.detail}</small> : null}
              </span>
            </span>
          ))}
        </div>

        <div className="stop-facts">
          {stop.summerOpening2026 ? (
            <span className="stop-fact-row">
              <CalendarRange size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>2026 opening:</strong> {stop.summerOpening2026}
              </span>
            </span>
          ) : null}
          {stop.bedCapacity ? (
            <span className="stop-fact-row">
              <BedDouble size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Capacity:</strong> {stop.bedCapacity}
              </span>
            </span>
          ) : null}
        </div>

        <div className="stop-source">
          <p>
            Source: {stop.source.label} · Information checked{' '}
            {formatVerifiedDate(stop.source.lastVerified)}
          </p>
          <a
            className="btn btn-ghost btn-block"
            href={stop.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
            View official information
          </a>
        </div>

        <TripNote stop={stop} />
      </div>
    </section>
  );
}

export function StopsScreen({ initialStopId }: { initialStopId?: string | null }) {
  // Only one accordion open at a time (deliberate on mobile — keeps the
  // list scannable and the scroll position predictable).
  const [openId, setOpenId] = useState<string | null>(initialStopId ?? null);
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openedFromNav = useRef(initialStopId ?? null);

  // When arriving from Today's "Next stop" card, scroll the expanded stop
  // into view once mounted.
  useEffect(() => {
    if (!openedFromNav.current) return;
    const idx = STOPS.findIndex((s) => s.id === openedFromNav.current);
    headerRefs.current[idx]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    openedFromNav.current = null;
  }, []);

  // WAI-ARIA accordion keyboard pattern: arrows/Home/End move between headers.
  const onHeaderKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    const focus = (i: number) => {
      headerRefs.current[(i + STOPS.length) % STOPS.length]?.focus();
      e.preventDefault();
    };
    if (e.key === 'ArrowDown') focus(index + 1);
    else if (e.key === 'ArrowUp') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(STOPS.length - 1);
  };

  return (
    <div className="screen screen--stops">
      <ScreenHeader eyebrow="Along the way" title="Huts & Stations">
        Eight stops, north to south. Facility details are a verified snapshot —
        tap a stop to see everything.
      </ScreenHeader>

      <div className="banner-info">
        <Info size={16} strokeWidth={1.8} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Mountain cabins are simple staffed wilderness accommodations. They have
          no electricity or running water. Guests fetch water, help with firewood
          and use shared self-catering kitchens.
        </span>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {STOPS.map((stop, i) => (
          <StopCard
            key={stop.id}
            stop={stop}
            open={openId === stop.id}
            onToggle={() => setOpenId((cur) => (cur === stop.id ? null : stop.id))}
            headerRef={(el) => {
              headerRefs.current[i] = el;
            }}
            onHeaderKeyDown={onHeaderKeyDown(i)}
          />
        ))}
      </div>
    </div>
  );
}
