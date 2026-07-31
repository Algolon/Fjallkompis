import { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Mountain,
  NotebookPen,
  Ship,
  TriangleAlert,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { ContextHelp } from '../components/ContextHelp';
import { FacilityIcon } from '../components/FacilityIcon';
import { LinkedStaysChooser } from '../components/LinkedStaysChooser';
import { StopVisual } from '../components/StopVisual';
import {
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { shopTypeForStop } from '../data/shops.mjs';
import { curatedOffRoutePlaces, staysLinkedToPlace } from '../data/journeyPlaces.mjs';
import { tripStayTypeTitle } from '../trip/tripModel.mjs';
import { transportLinkForStop } from '../data/transport.mjs';
import { formatDistanceKm, formatVerifiedDate, stopTypeLabel } from '../utils/format';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';
import type { StopTransportLink } from '../data/transport.mjs';
import type { CuratedOffRoutePlace } from '../data/journeyPlaces.mjs';
import type { ShopCategory, TrailStop } from '../types';
import type { TabId } from '../components/TabBar';
import type { NavPayload } from './TodayScreen';

/** The Track/View/N-stays chip label for a place with `count` linked stays. */
function stayChipLabel(count: number): string {
  if (count === 0) return 'Track stay';
  if (count === 1) return 'View stay in Trip';
  return `${count} stays in Trip`;
}

/** Accessible name for the same chip — always place-specific. */
function stayChipAccessibleName(count: number, placeName: string): string {
  if (count === 0) return `Track a stay at ${placeName} in the Trip plan`;
  if (count === 1) return `Open your tracked stay at ${placeName} in the Trip plan`;
  return `Choose among your ${count} tracked stays at ${placeName} in the Trip plan`;
}

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
  linkedStayCount,
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
  /** How many personal Stay items link this stop (0, 1 or several). */
  linkedStayCount: number;
  /** Track a stay here, open the one linked stay, or choose among several. */
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

        {/* Trip-plan integration: track a personal stay at this stop, open
            the one already tracked, or choose among several — never an
            arbitrary first match. Prefills verified stop facts only —
            dates, booking status and notes stay personal. */}
        <button
          type="button"
          className="stop-action-chip"
          onClick={onTrackStay}
          aria-label={stayChipAccessibleName(linkedStayCount, shortName)}
        >
          <BedDouble size={15} strokeWidth={1.9} aria-hidden />
          <span>{stayChipLabel(linkedStayCount)}</span>
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

/**
 * A curated off-route place (Before & after trail). The same accessible
 * accordion pattern as a route stop card, but deliberately WITHOUT route
 * semantics: no cumulative kilometres, no Start/end language, no stage
 * relationship, no direction numbering — this place is near the trail, not
 * on it. Facts are the verified reference snapshot; the stay chip is the
 * same zero/one/several behaviour as on route stops.
 */
function OffRoutePlaceCard({
  place,
  open,
  onToggle,
  headerRef,
  onHeaderKeyDown,
  linkedStayCount,
  onTrackStay,
}: {
  place: CuratedOffRoutePlace;
  open: boolean;
  onToggle: () => void;
  headerRef: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown: (e: React.KeyboardEvent) => void;
  linkedStayCount: number;
  onTrackStay: () => void;
}) {
  const headerId = `stop-h-${place.id}`;
  const panelId = `stop-p-${place.id}`;

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
            <span className="stop-name">{place.name}</span>
            <span className="stop-meta">
              <span className="stop-type">{tripStayTypeTitle(place.stayType)}</span>
              <span className="stop-fact">{place.locationLabel}</span>
            </span>
            <span className="stop-badges">
              {place.facilities.slice(0, 5).map((f) => (
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
        <p className="stop-summary">{place.summary}</p>
        <p className="stop-desc">{place.description}</p>

        <div className="stop-fac-grid" role="group" aria-label="Facilities">
          {place.facilities.map((f) => (
            <span key={f.id} className="stop-fac">
              <FacilityIcon id={f.id} size={15} />
              <span>
                {f.label}
                {f.detail ? <small> · {f.detail}</small> : null}
              </span>
            </span>
          ))}
        </div>

        <button
          type="button"
          className="stop-action-chip"
          onClick={onTrackStay}
          aria-label={stayChipAccessibleName(linkedStayCount, place.name)}
        >
          <BedDouble size={15} strokeWidth={1.9} aria-hidden />
          <span>{stayChipLabel(linkedStayCount)}</span>
          <ChevronRight className="stop-fac-go" size={15} strokeWidth={2} aria-hidden />
        </button>

        <div className="stop-facts">
          {place.address ? (
            <span className="stop-fact-row">
              <MapPin size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Address:</strong> {place.address}
              </span>
            </span>
          ) : null}
          {place.bedCapacity ? (
            <span className="stop-fact-row">
              <BedDouble size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Capacity:</strong> {place.bedCapacity}
              </span>
            </span>
          ) : null}
          {place.checkInTime || place.checkOutTime ? (
            <span className="stop-fact-row">
              <Clock size={15} strokeWidth={1.8} aria-hidden />
              <span>
                {place.checkInTime ? (
                  <>
                    <strong>Check-in:</strong> {place.checkInTime.replace('From ', 'from ')}
                  </>
                ) : null}
                {place.checkInTime && place.checkOutTime ? ' · ' : ''}
                {place.checkOutTime ? (
                  <>
                    <strong>Check-out:</strong> {place.checkOutTime.replace('Until ', 'until ')}
                  </>
                ) : null}
              </span>
            </span>
          ) : null}
        </div>

        <div className="stop-source">
          <p>
            Source: {place.source.label} · Information checked{' '}
            {formatVerifiedDate(place.source.lastVerified)}
          </p>
          <a
            className="btn btn-ghost btn-block"
            href={place.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
            View official information
          </a>
        </div>
      </div>
    </section>
  );
}

export function StopsScreen({
  initialPlaceId,
  onNavigate,
}: {
  /** One-shot: open (and scroll to) this route stop or off-route place. */
  initialPlaceId?: string | null;
  onNavigate: (tab: TabId, payload?: NavPayload) => void;
}) {
  // Stops in the ACTIVE itinerary's walking order, with route-km measured from
  // the selected start (facilities/notes stay tied to the STABLE stop id).
  const { itinerary, state } = useStore();
  const stops = itinerary.orderedStops;
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const endStop = itinerary.endStopId ? STOPS_BY_ID[itinerary.endStopId] : null;

  // The curated off-route places (Before & after trail). Reference data —
  // NEVER part of route ordering, route counts or the stops-detail grid.
  const offRoutePlaces = curatedOffRoutePlaces();

  // Deep link out to the matching Lists section (one-shot in-memory payload,
  // the same pattern as Today → Stages / Map → Stops).
  const openShop = (shopType: ShopCategory) => onNavigate('checklist', { lists: { shopType } });
  const openTransport = (link: StopTransportLink) =>
    onNavigate('checklist', {
      lists: link.entryId ? { transportId: link.entryId } : { transportContext: link.context },
    });

  // The multiple-stays chooser: several personal stays may legitimately link
  // one place, and opening "the first" would be arbitrary — the user picks.
  const [chooser, setChooser] = useState<{ placeId: string; placeName: string } | null>(null);
  const chooserStays = chooser ? staysLinkedToPlace(state.trip, chooser.placeId) : [];

  // The chooser is valid only while there is still a real choice. A Stay can
  // be deleted, unlinked or relinked through another state path while this
  // screen remains mounted; close and DISARM the chooser as soon as its live
  // list drops below two. Merely hiding the dialog would leave stale chooser
  // state that could unexpectedly reopen if another Stay later linked here.
  useEffect(() => {
    if (chooser && chooserStays.length <= 1) setChooser(null);
  }, [chooser, chooserStays.length]);

  /**
   * The place's stay action, by how many personal stays link it:
   * zero → a new prefilled Stay; one → open exactly that item; several →
   * the explicit chooser (never an arbitrary first match).
   */
  const openPlaceStays = (placeId: string, placeName: string) => {
    const linked = staysLinkedToPlace(state.trip, placeId);
    if (linked.length === 0) {
      onNavigate('checklist', { lists: { section: 'trip', trackStayPlaceId: placeId } });
    } else if (linked.length === 1) {
      onNavigate('checklist', { lists: { section: 'trip', tripItemId: linked[0].id } });
    } else {
      setChooser({ placeId, placeName });
    }
  };

  // Only one accordion open at a time (deliberate on mobile — keeps the
  // list scannable and the scroll position predictable). The id space spans
  // BOTH sections: stable stop ids and off-route place ids never collide.
  const [openId, setOpenId] = useState<string | null>(initialPlaceId ?? null);
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openedFromNav = useRef(initialPlaceId ?? null);
  const headerCount = stops.length + offRoutePlaces.length;

  // When arriving from Today's "Next stop" card or a stay's View place,
  // scroll the expanded place into view once mounted (route stops first,
  // then the off-route section — same order as the header refs).
  useEffect(() => {
    if (!openedFromNav.current) return;
    const routeIdx = stops.findIndex((s) => s.id === openedFromNav.current);
    const offIdx = offRoutePlaces.findIndex((p) => p.id === openedFromNav.current);
    const idx = routeIdx !== -1 ? routeIdx : offIdx !== -1 ? stops.length + offIdx : -1;
    if (idx !== -1) {
      headerRefs.current[idx]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    openedFromNav.current = null;
  }, [stops, offRoutePlaces]);

  // WAI-ARIA accordion keyboard pattern: arrows/Home/End move between headers,
  // following the RENDERED order — route stops (itinerary order) first, then
  // the Before & after trail cards.
  const onHeaderKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    const focus = (i: number) => {
      headerRefs.current[(i + headerCount) % headerCount]?.focus();
      e.preventDefault();
    };
    if (e.key === 'ArrowDown') focus(index + 1);
    else if (e.key === 'ArrowUp') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(headerCount - 1);
  };

  // The master-detail presentation belongs to the ROUTE section only — an
  // open off-route card never reshapes the route grid.
  const openRouteId = openId != null && stops.some((s) => s.id === openId) ? openId : null;

  return (
    <div className="screen screen--stops">
      <ScreenHeader
        eyebrow="Along the way"
        title="Stops & places"
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
        The eight route stops in walking order
        {startStop && endStop
          ? `, ${stopShortName(startStop)} to ${stopShortName(endStop)}`
          : ''}
        , plus places to stay before and after the trail. Facility details are
        a verified snapshot — tap a place to see everything.
      </ScreenHeader>

      <div className="section-label" style={{ marginTop: 14 }}>
        Along the route
      </div>

      {/* stops-detail switches the roomy-landscape grid (≥ 900×500, see
          global.css) into a clustered master-detail: collapsed stops stack
          tightly on the left, the open stop becomes a stable right-hand
          detail column. Same DOM, same order, same accordion semantics —
          compact/portrait presentations ignore the class entirely.
          --stop-count feeds the grid's row template so CSS never hard-codes
          the number of stops (off-route places are NOT counted). */}
      <div
        className={`stack${openRouteId ? ' stops-detail' : ''}`}
        style={{ marginTop: 8, '--stop-count': stops.length } as React.CSSProperties}
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
            linkedStayCount={staysLinkedToPlace(state.trip, stop.id).length}
            onTrackStay={() => openPlaceStays(stop.id, stopShortName(stop))}
          />
        ))}
      </div>

      <div className="section-label" style={{ marginTop: 18 }}>
        Before &amp; after trail
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {offRoutePlaces.map((place, j) => (
          <OffRoutePlaceCard
            key={place.id}
            place={place}
            open={openId === place.id}
            onToggle={() => setOpenId((cur) => (cur === place.id ? null : place.id))}
            headerRef={(el) => {
              headerRefs.current[stops.length + j] = el;
            }}
            onHeaderKeyDown={onHeaderKeyDown(stops.length + j)}
            linkedStayCount={staysLinkedToPlace(state.trip, place.id).length}
            onTrackStay={() => openPlaceStays(place.id, place.name)}
          />
        ))}
      </div>

      {chooser && chooserStays.length > 1 ? (
        <LinkedStaysChooser
          placeName={chooser.placeName}
          stays={chooserStays}
          onOpenStay={(itemId) => {
            setChooser(null);
            onNavigate('checklist', { lists: { section: 'trip', tripItemId: itemId } });
          }}
          onAddAnother={() => {
            setChooser(null);
            onNavigate('checklist', {
              lists: { section: 'trip', trackStayPlaceId: chooser.placeId },
            });
          }}
          onClose={() => setChooser(null)}
        />
      ) : null}
    </div>
  );
}
