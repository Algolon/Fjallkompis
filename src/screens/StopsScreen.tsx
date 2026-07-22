import { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
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
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { shopTypeForStop } from '../data/shops.mjs';
import { transportLinkForStop } from '../data/transport.mjs';
import { formatDistanceKm, formatVerifiedDate, stopTypeLabel } from '../utils/format';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';
import type { StopTransportLink } from '../data/transport.mjs';
import type { ShopCategory, TrailStop } from '../types';
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
  routeKm,
  open,
  onToggle,
  headerRef,
  onHeaderKeyDown,
  onOpenShop,
  onOpenTransport,
  stayTracked,
  onTrackStay,
}: {
  stop: TrailStop;
  /** Cumulative km from the selected itinerary start (0 at the start stop). */
  routeKm: number;
  open: boolean;
  onToggle: () => void;
  headerRef: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown: (e: React.KeyboardEvent) => void;
  onOpenShop: (shopType: ShopCategory) => void;
  onOpenTransport: (link: StopTransportLink) => void;
  /** True when a personal Stay item already links this stop. */
  stayTracked: boolean;
  /** Track a stay here in the Trip plan (or open the existing one). */
  onTrackStay: () => void;
}) {
  const waypoint = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]];
  const elevation = waypoint?.elevation != null ? Math.round(waypoint.elevation) : null;
  const icons = collapsedFacilities(stop);
  const absences = importantAbsences(stop);
  const noShop = absences.some((f) => f.id === 'shop');
  const headerId = `stop-h-${stop.id}`;
  const panelId = `stop-p-${stop.id}`;
  // Deep links out of the expanded panel (never the collapsed header icons).
  // The Shop chip opens the matching shop-TYPE category, not a location card.
  const shopType = shopTypeForStop(stop.id);
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
            const linksToShop = f.id === 'shop' && !f.importantAbsence && shopType != null;
            const linksToTransport =
              f.id === 'public-transport' &&
              !f.importantAbsence &&
              tpLink?.via === 'facility';

            if (linksToShop || linksToTransport) {
              const accessibleName = linksToShop
                ? `Open shop information for ${shortName}`
                : `Open transport information for ${shortName}`;
              const onClick = linksToShop
                ? () => onOpenShop(shopType!)
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
                  <span>{f.label}</span>
                  <ChevronRight className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
                </button>
              );
            }

            // The "No shop" chip becomes a compact context-help chip: tap for
            // the one food-planning note (replaces the old warning banner).
            if (f.id === 'shop' && f.importantAbsence) {
              return (
                <ContextHelp
                  key={f.id}
                  label={`${f.label} at ${shortName} — food note`}
                  title="No shop at this stop"
                  triggerClassName="stop-fac is-absent stop-fac--info"
                  triggerContent={
                    <>
                      <TriangleAlert size={15} strokeWidth={2} aria-hidden />
                      <span>{f.label}</span>
                      <Info className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
                    </>
                  }
                >
                  <p>Carry all required food from the previous stop.</p>
                </ContextHelp>
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

        {/* Trip-plan integration: track a personal stay at this stop (or open
            the one already tracked). Prefills verified stop facts only —
            dates, booking status and notes stay personal. */}
        <button
          type="button"
          className="stop-action-chip"
          onClick={onTrackStay}
          aria-label={
            stayTracked
              ? `Open your tracked stay at ${shortName} in the Trip plan`
              : `Track a stay at ${shortName} in the Trip plan`
          }
        >
          <BedDouble size={15} strokeWidth={1.9} aria-hidden />
          <span>{stayTracked ? 'View stay in Trip' : 'Track stay'}</span>
          <ChevronRight className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
        </button>

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
  // Stops in the ACTIVE itinerary's walking order, with route-km measured from
  // the selected start (facilities/notes stay tied to the STABLE stop id).
  const { itinerary, state } = useStore();
  const stops = itinerary.orderedStops;
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const endStop = itinerary.endStopId ? STOPS_BY_ID[itinerary.endStopId] : null;

  // Deep link out to the matching Lists section (one-shot in-memory payload,
  // the same pattern as Today → Stages / Map → Stops).
  const openShop = (shopType: ShopCategory) => onNavigate('checklist', { lists: { shopType } });
  const openTransport = (link: StopTransportLink) =>
    onNavigate('checklist', {
      lists: link.entryId ? { transportId: link.entryId } : { transportContext: link.context },
    });

  // Trip-plan integration: one personal Stay per stop is the common case —
  // when one exists the chip opens it instead of creating an accidental
  // duplicate (more instances can still be added inside the Trip section).
  const trackStay = (stop: TrailStop) => {
    const linked = state.trip.find((i) => i.kind === 'stay' && i.linkedStopId === stop.id);
    onNavigate('checklist', {
      lists: linked
        ? { section: 'trip', tripItemId: linked.id }
        : { section: 'trip', trackStayStopId: stop.id },
    });
  };

  // Only one accordion open at a time (deliberate on mobile — keeps the
  // list scannable and the scroll position predictable).
  const [openId, setOpenId] = useState<string | null>(initialStopId ?? null);
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openedFromNav = useRef(initialStopId ?? null);

  // When arriving from Today's "Next stop" card, scroll the expanded stop
  // into view once mounted.
  useEffect(() => {
    if (!openedFromNav.current) return;
    const idx = stops.findIndex((s) => s.id === openedFromNav.current);
    headerRefs.current[idx]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    openedFromNav.current = null;
  }, [stops]);

  // WAI-ARIA accordion keyboard pattern: arrows/Home/End move between headers,
  // following the RENDERED (itinerary) order.
  const onHeaderKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    const focus = (i: number) => {
      headerRefs.current[(i + stops.length) % stops.length]?.focus();
      e.preventDefault();
    };
    if (e.key === 'ArrowDown') focus(index + 1);
    else if (e.key === 'ArrowUp') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(stops.length - 1);
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
        Eight stops in walking order
        {startStop && endStop
          ? `, ${stopShortName(startStop)} to ${stopShortName(endStop)}`
          : ''}
        . Facility details are a verified snapshot — tap a stop to see
        everything.
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
        style={{ marginTop: 14, '--stop-count': stops.length } as React.CSSProperties}
      >
        {stops.map((stop, i) => (
          <StopCard
            key={stop.id}
            stop={stop}
            routeKm={itinerary.stopDistanceKm[stop.id] ?? 0}
            open={openId === stop.id}
            onToggle={() => setOpenId((cur) => (cur === stop.id ? null : stop.id))}
            headerRef={(el) => {
              headerRefs.current[i] = el;
            }}
            onHeaderKeyDown={onHeaderKeyDown(i)}
            onOpenShop={openShop}
            onOpenTransport={openTransport}
            stayTracked={state.trip.some(
              (it) => it.kind === 'stay' && it.linkedStopId === stop.id,
            )}
            onTrackStay={() => trackStay(stop)}
          />
        ))}
      </div>
    </div>
  );
}
