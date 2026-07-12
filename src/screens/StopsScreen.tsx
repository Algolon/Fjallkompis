import { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Mountain,
  NotebookPen,
  Ship,
  TriangleAlert,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { ContextHelp } from '../components/ContextHelp';
import { FacilityIcon } from '../components/FacilityIcon';
import { StopVisual } from '../components/StopVisual';
import {
  STOPS,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { shopLocationForStop } from '../data/shops.mjs';
import { transportLinkForStop } from '../data/transport.mjs';
import { formatDistanceKm, formatVerifiedDate, stopTypeLabel } from '../utils/format';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID, WAYPOINT_ROUTE_KM } from '../route/routeData';
import type { StopTransportLink } from '../data/transport.mjs';
import type { TrailStop } from '../types';
import type { TabId } from '../components/TabBar';
import type { NavPayload } from './TodayScreen';

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
  onOpenShop,
  onOpenTransport,
}: {
  stop: TrailStop;
  open: boolean;
  onToggle: () => void;
  headerRef: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown: (e: React.KeyboardEvent) => void;
  onOpenShop: (shopId: string) => void;
  onOpenTransport: (link: StopTransportLink) => void;
}) {
  const waypoint = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]];
  const routeKm = WAYPOINT_ROUTE_KM[HUT_TO_WAYPOINT[stop.id]] ?? 0;
  const elevation = waypoint?.elevation != null ? Math.round(waypoint.elevation) : null;
  const icons = collapsedFacilities(stop);
  const absences = importantAbsences(stop);
  const noShop = absences.some((f) => f.id === 'shop');
  const headerId = `stop-h-${stop.id}`;
  const panelId = `stop-p-${stop.id}`;
  // Deep links out of the expanded panel (never the collapsed header icons).
  const shopLink = shopLocationForStop(stop.id);
  const tpLink = transportLinkForStop(stop.id);
  const shortName = stopShortName(stop);

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

        <div className="stop-fac-grid" role="group" aria-label="Facilities">
          {stop.facilities.map((f) => {
            // A present Shop chip, or Abisko/Nikkaluokta's Public transport
            // chip, deep-links into Lists. "No shop" / absences never do.
            const linksToShop = f.id === 'shop' && !f.importantAbsence && shopLink;
            const linksToTransport =
              f.id === 'public-transport' &&
              !f.importantAbsence &&
              tpLink?.via === 'facility';

            if (linksToShop || linksToTransport) {
              const accessibleName = linksToShop
                ? `Open shop information for ${shortName}`
                : `Open transport information for ${shortName}`;
              const onClick = linksToShop
                ? () => onOpenShop(shopLink.id)
                : () => onOpenTransport(tpLink!);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="stop-fac stop-fac--link"
                  onClick={onClick}
                  aria-label={accessibleName}
                >
                  <FacilityIcon id={f.id} size={15} />
                  <span>
                    {f.label}
                    {f.detail ? <small> · {f.detail}</small> : null}
                  </span>
                  <ChevronRight className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
                </button>
              );
            }

            return (
              <span key={f.id} className={`stop-fac ${f.importantAbsence ? 'is-absent' : ''}`}>
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
            );
          })}
        </div>

        {/* Derived boat-timetable quick link (Alesjaure, Kebnekaise) — not a
            curated facility, so it lives outside the facility grid. */}
        {tpLink?.via === 'derived' ? (
          <button
            type="button"
            className="stop-action-chip"
            onClick={() => onOpenTransport(tpLink)}
            aria-label={`Open transport information for ${shortName}`}
          >
            <Ship size={15} strokeWidth={1.9} aria-hidden />
            <span>{tpLink.label}</span>
            <ChevronRight className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
          </button>
        ) : null}

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

export function StopsScreen({
  initialStopId,
  onNavigate,
}: {
  initialStopId?: string | null;
  onNavigate: (tab: TabId, payload?: NavPayload) => void;
}) {
  // Deep link out to the matching Lists section (one-shot in-memory payload,
  // the same pattern as Today → Stages / Map → Stops).
  const openShop = (shopId: string) => onNavigate('checklist', { lists: { shopId } });
  const openTransport = (link: StopTransportLink) =>
    onNavigate('checklist', {
      lists: link.entryId ? { transportId: link.entryId } : { transportContext: link.context },
    });

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
      <ScreenHeader
        eyebrow="Along the way"
        title="Huts & Stations"
        action={
          <ContextHelp label="About mountain cabins" title="About mountain cabins">
            <p>
              Mountain cabins are simple staffed wilderness accommodations. They
              have no electricity or running water.
            </p>
            <p>
              Guests fetch water, help with firewood and use shared self-catering
              kitchens.
            </p>
          </ContextHelp>
        }
      >
        Eight stops, north to south. Facility details are a verified snapshot —
        tap a stop to see everything.
      </ScreenHeader>

      {/* stops-detail switches the roomy-landscape grid (≥ 900×500, see
          global.css) into a clustered master-detail: collapsed stops stack
          tightly on the left, the open stop becomes a stable right-hand
          detail column. Same DOM, same order, same accordion semantics —
          compact/portrait presentations ignore the class entirely.
          --stop-count feeds the grid's row template so CSS never hard-codes
          the number of stops. */}
      <div
        className={`stack${openId ? ' stops-detail' : ''}`}
        style={{ marginTop: 14, '--stop-count': STOPS.length } as React.CSSProperties}
      >
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
            onOpenShop={openShop}
            onOpenTransport={openTransport}
          />
        ))}
      </div>
    </div>
  );
}
