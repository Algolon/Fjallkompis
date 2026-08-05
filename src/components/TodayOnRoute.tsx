import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import {
  ArrowUpDown,
  BookOpen,
  BusFront,
  ChevronRight,
  Coffee,
  Footprints,
  Mountain,
  Route,
  TriangleAlert,
  X,
} from 'lucide-react';
import { FacilityIcon } from './FacilityIcon';
import { MembershipQuickAccess } from './MembershipQuickAccess';
import {
  HUT_TO_WAYPOINT,
  STOPS_BY_ID,
  WAYPOINT_BY_ID,
  collapsedFacilities,
  collapsedFacilityList,
  combinedStageHighlights,
  importantAbsences,
  journeyPlaceById,
  stageHighlights,
  stopShortName,
} from '../trail/activeTrailContent';
import type { CuratedOffRoutePlace } from '../trail/activeTrailContent';
import { formatDistanceKm, formatHoursEstimate } from '../utils/format';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { HERO_HIGHLIGHT_ICONS, HeroSilhouette } from './TodayHero';
import { activityOrderPhrase, travelPresentation } from '../plan/dayPresentation.mjs';
import { hikingDayRouteFocus } from '../plan/hikingDayHero.mjs';
import type { HikingDayRouteFocus } from '../plan/hikingDayHero.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION, isReversed } from '../route/direction.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';
import type { ItineraryStage } from '../route/activeItinerary';
import type { DayActivityKind, RouteDirection, TripItem } from '../types';
import type { NavPayload } from '../screens/TodayScreen';
import type { TabId } from './TabBar';
import type { TodaySource } from '../plan/effectiveToday.mjs';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

type Navigate = (t: TabId, payload?: NavPayload) => void;

/**
 * "Sat 5 Sep" — the compact hero date, formatted from the PLAN's stored date.
 * Uses the deterministic, fixed-English helper the pickers use, which builds
 * dates from numeric parts only. Nothing here reads the clock: the day shown
 * is the one the user selected, never today's system date.
 */
function formatDayDate(iso: string | null): string | null {
  if (!iso) return null;
  const label = formatDateFieldLabel(iso);
  return label ? label.split(' ').slice(0, 3).join(' ') : null;
}

/**
 * Today — On route. Two top-level shapes:
 *
 *   - NO planned day for today: the original date-independent stage view.
 *     Nothing about planning appears — no date, no activity indicator. This
 *     is the default (no plan at all) AND the fallback whenever a plan exists
 *     but does not describe today: before its first date, after its last, on
 *     a date it does not cover, or with a pointer an edit left dangling.
 *   - A planned day for today: that calendar day, in one of four compact
 *     variants (hiking, travel, rest, hiking + travel).
 *
 * `day` is the EFFECTIVE Today the store resolved (manual override, then an
 * exact local-calendar-date match, then none — src/plan/effectiveToday.mjs).
 * Nothing here reads the clock, and a Day plan can never blank this page.
 *
 * Every variant keeps header + hero + Journey + Tonight inside one mobile
 * viewport at 375x667. Stage detail belongs to Stages, not here.
 */
export function TodayOnRoute({
  day,
  plannedDays,
  currentStage,
  routeDirection,
  trip,
  onNavigate,
}: {
  day: PlannedDay | null;
  plannedDays: PlannedDay[];
  currentStage: ItineraryStage | null;
  routeDirection: RouteDirection;
  trip: TripItem[];
  onNavigate: Navigate;
}) {
  // How the shown day was resolved, and the way back from each temporary
  // state. A pointer set via Stages → "Set as current" never expires by
  // itself, so while one is active Today says so and offers ONE quiet action
  // to return to following the plan's dates; a transient preview (Settings →
  // Preview) says so the same way and offers Exit preview. The two sources
  // are mutually exclusive, so at most one status row ever renders.
  const { todaySource, exitDayPreview, dayPlan } = useStore();
  const previewing = todaySource === 'preview';

  // A plan alone is not enough: today has to BE one of its days. Without one
  // the generic view runs, fully populated, exactly as it does with no plan.
  const planned = plannedDays.length > 0 && day !== null;

  // ---- Default state: no planned day for today, no dates, no day types -----
  if (!planned) {
    if (!currentStage) return <NoStageEmpty onNavigate={onNavigate} />;
    const from = STOPS_BY_ID[currentStage.fromHutId];
    const to = STOPS_BY_ID[currentStage.toHutId];
    if (!from || !to) return <NoStageEmpty onNavigate={onNavigate} />;
    return (
      <>
        <StageHero
          stage={currentStage}
          routeDirection={routeDirection}
          onNavigate={onNavigate}
        />
        <StageJourney currentStage={currentStage} onNavigate={onNavigate} />
        <TonightCard stopId={to.id} onNavigate={onNavigate} />
      </>
    );
  }

  // ---- Planned state -------------------------------------------------------
  const overnightStopId =
    day.overnight.kind === 'stop' ? (day.overnight.stopId ?? null) : null;
  const overnightStay =
    day.overnight.kind === 'stay'
      ? trip.find((i) => i.id === day.overnight.tripItemId) ?? null
      : null;
  // A personal Stay linked to a Journey Place still represents that verified
  // place, resolved through the SAME selector the rest of the app uses
  // (journeyPlaceById): a route-stop link reuses the full Stop presentation
  // (compact STF name, facilities, warnings, elevation, Stop navigation); a
  // curated off-route link (e.g. STF Kiruna) gets the curated Place card —
  // verified facilities, no invented elevation, Place navigation. Unlinked
  // and unresolvable stays remain personal Stay cards; nothing is ever
  // inferred from titles or free text.
  const overnightPlace =
    overnightStay?.kind === 'stay' && overnightStay.linkedPlaceId
      ? journeyPlaceById(overnightStay.linkedPlaceId, STOPS_BY_ID)
      : null;
  const overnightStayStopId = overnightPlace?.kind === 'route-stop' ? overnightPlace.stopId : null;
  const overnightCuratedPlace =
    overnightPlace?.kind === 'curated-off-route' ? overnightPlace : null;

  return (
    <>
      <PlannedDayHero
        day={day}
        dayCount={plannedDays.length}
        routeDirection={routeDirection}
        previewing={previewing}
        source={todaySource}
        onExitPreview={exitDayPreview}
        onNavigate={onNavigate}
      />
      <PlannedJourney
        day={day}
        plannedDays={plannedDays}
        previewing={previewing}
        journeyActive={dayPlan?.journeyActive === true}
        source={todaySource}
        onNavigate={onNavigate}
      />
      {overnightStopId ? (
        <TonightCard stopId={overnightStopId} onNavigate={onNavigate} />
      ) : overnightStayStopId ? (
        <TonightCard stopId={overnightStayStopId} onNavigate={onNavigate} />
      ) : overnightCuratedPlace && overnightStay ? (
        <CuratedPlaceTonightCard
          place={overnightCuratedPlace}
          title={overnightStay.title}
          onNavigate={onNavigate}
        />
      ) : overnightStay ? (
        <StayTonightCard title={overnightStay.title} onNavigate={onNavigate} />
      ) : day.overnight.kind === 'stay' ? (
        // The referenced stay was deleted in Lists → Trip: say so plainly
        // rather than render a name that no longer exists.
        <StayTonightCard title="Stay no longer in your Trip plan" onNavigate={onNavigate} />
      ) : null}
    </>
  );
}

/** Compact day-type indicator. Icons only; the words ride the hero's label. */
const ACTIVITY_ICON: Record<DayActivityKind, typeof Footprints> = {
  hiking: Footprints,
  travel: BusFront,
  rest: Coffee,
};
function DayTypeBadge({ kinds, reversed }: { kinds: DayActivityKind[]; reversed?: boolean }) {
  return (
    <span className="hero-day__type" aria-hidden>
      {kinds.map((kind) => {
        const Icon = ACTIVITY_ICON[kind];
        return <Icon key={kind} size={14} strokeWidth={2.1} />;
      })}
      {/* A leg walked against the route direction: marked on the SAME line
          (height-neutral, like the activity glyphs); the words ride the
          hero's accessible name, and the oriented title endpoints plus the
          leg editor carry the full story. */}
      {reversed ? <ArrowUpDown size={14} strokeWidth={2.1} /> : null}
    </span>
  );
}

/** The shared two-action treatment for every hiking hero. */
function HikingHeroActions({
  guideStageIds,
  reversedStageIds = [],
  mapStageId,
  routeFocus,
  routeLabel,
  onNavigate,
}: {
  guideStageIds: string[];
  reversedStageIds?: string[];
  mapStageId: string;
  routeFocus?: HikingDayRouteFocus | null;
  routeLabel: string;
  onNavigate: Navigate;
}) {
  const uniqueGuideStageIds = [...new Set(guideStageIds)];
  const uniqueReversedStageIds = [...new Set(reversedStageIds)];
  // Use the walking-day leg count for presentation. A personalised plan can
  // legitimately traverse the same catalogued stage more than once; guide
  // cards are still de-duplicated, while the hero remains a combined day.
  const combined = guideStageIds.length > 1;
  return (
    <div className="hero-actions hero-actions--hiking">
      <button
        type="button"
        className="hero-action hero-action--glass hero-action--primary"
        onClick={() => onNavigate('stages', {
          guideStageId: uniqueGuideStageIds[0],
          guideStageIds: uniqueGuideStageIds,
          guideReversed: uniqueReversedStageIds.includes(uniqueGuideStageIds[0]),
          guideReversedStageIds: uniqueReversedStageIds,
        })}
        aria-label={
          combined
            ? `Stage guide — open all stages for ${routeLabel}`
            : 'Stage guide — open today’s full stage guide in Stages'
        }
      >
        <BookOpen size={15} strokeWidth={2} aria-hidden /> Stage guide
      </button>
      <button
        type="button"
        className="hero-action hero-action--glass"
        disabled={combined && !routeFocus}
        onClick={() => {
          if (routeFocus) {
            onNavigate('map', {
              mapFocus: {
                kind: 'route',
                stageId: mapStageId,
                label: routeLabel,
                tracks: routeFocus.tracks,
                start: routeFocus.start,
                destination: routeFocus.destination,
              },
            });
          } else if (!combined) {
            onNavigate('map', { mapStageId });
          }
        }}
        aria-label={
          combined
            ? `View route — show the complete ${guideStageIds.length}-stage walking day on the map`
            : 'View route — show today’s stage on the map'
        }
      >
        <Route size={15} strokeWidth={2} aria-hidden /> View route
      </button>
    </div>
  );
}

/**
 * The hero for a planned calendar day, in its activity-specific variant.
 *
 * EVERY piece of content comes from the day's OWN stages — route, via-stops,
 * aggregates, characteristics and both actions. The global `currentStageId` is
 * route progress, not a content source: an edit can hand the current stage to
 * a different calendar day, and sourcing chips or actions from it would show
 * one stage's terrain and open another stage's guide under this day's title.
 */
function PlannedDayHero({
  day,
  dayCount,
  routeDirection,
  previewing,
  source,
  onExitPreview,
  onNavigate,
}: {
  day: PlannedDay;
  dayCount: number;
  routeDirection: RouteDirection;
  /** True when this day is a transient preview, not the user's actual day. */
  previewing: boolean;
  source: TodaySource;
  /** Clears the transient preview (only rendered while previewing). */
  onExitPreview: () => void;
  onNavigate: Navigate;
}) {
  const dayDate = day.date ? formatDayDate(day.date) : null;
  const hiking = day.stages.length > 0;
  const multiStage = day.stages.length > 1;
  // The day's own first stage — what a one-stage day IS, and where a
  // multi-stage day starts in Stages.
  const leadStage: ItineraryStage | null = day.stages[0] ?? null;
  const travel = day.kinds.includes('travel');
  const from = day.fromStopId ? STOPS_BY_ID[day.fromStopId] : null;
  const to = day.toStopId ? STOPS_BY_ID[day.toStopId] : null;
  const kindWords = activityOrderPhrase(day);
  // The day's own first LEG: its absolute orientation decides which way the
  // verified content is read. A leg walked against the plan's own direction
  // ('opposite' on a forward journey) reads its highlights in ITS direction —
  // climb and descent chips must describe the walk the day actually makes.
  const leadLeg = day.legs[0] ?? null;
  const leadLegDirection =
    leadLeg?.orientation === 'opposite' ? REVERSE_DIRECTION : DEFAULT_DIRECTION;
  // Legs walked AGAINST the active route direction — the Stages screen shows
  // those sections the other way round, so the difference is stated: an
  // eyebrow marker (height-neutral) plus the exact count in the accessible
  // name. The oriented title endpoints already run the other way.
  const naturalOrientation = isReversed(routeDirection) ? 'opposite' : 'canonical';
  const contraryLegCount = day.legs.filter((l) => l.orientation !== naturalOrientation).length;
  // Guide deep links open every constituent card. Legs walked against the
  // active itinerary are passed as presentation context; guide prose itself
  // remains the verified, direction-specific editorial already owned there.
  const reversedWords =
    contraryLegCount === 0
      ? ''
      : contraryLegCount === day.legs.length
        ? ' Walked in reverse of the route direction.'
        : ` ${contraryLegCount} of ${day.legs.length} legs walked in reverse of the route direction.`;
  // Single-stage days keep their established selector. Combined days resolve
  // each leg in its own absolute direction, deduplicate equivalent facts, then
  // apply the same priority order and four-chip ceiling.
  const highlights =
    hiking && leadStage
      ? multiStage
        ? combinedStageHighlights(day.legs.map((leg) => ({
            stageId: leg.stageId,
            direction: leg.orientation === 'opposite' ? REVERSE_DIRECTION : DEFAULT_DIRECTION,
          })))
        : !travel
          ? stageHighlights(leadStage.id, undefined, leadLegDirection)
          : []
      : [];
  const viaNames = day.viaStopIds.flatMap((id) => {
    const stop = STOPS_BY_ID[id];
    return stop ? [stopShortName(stop)] : [];
  });
  const routeLabel = from && to
    ? `${stopShortName(from)} to ${stopShortName(to)}`
    : kindWords;
  const guideStageIds = day.legs.map((leg) => leg.stageId);
  const reversedStageIds = day.legs
    .filter((leg) => leg.orientation !== naturalOrientation)
    .map((leg) => leg.stageId);
  const routeFocus = multiStage ? hikingDayRouteFocus(day) : null;
  // One shared helper decides the wording AND the position, so Today and the
  // Settings planner can never disagree about which happened first.
  const travelLine = travelPresentation(day);
  const sourceLabel =
    source === 'manual'
      ? 'Selected'
      : source === 'before-plan'
        ? 'Up next'
        : source === 'after-plan'
          ? 'Plan ended'
          : null;
  const sourceWords =
    source === 'manual'
      ? ' Manually selected planned day.'
      : source === 'before-plan'
        ? ' Up next: the plan has not started yet.'
        : source === 'after-plan'
          ? ' Plan ended: showing the final planned day.'
          : '';

  return (
    <section
      className={`hero${previewing ? ' hero--preview' : ''}`}
      // A previewed day must never CLAIM to be today — the accessible name
      // leads with what it actually is.
      aria-label={`${previewing ? 'Previewing' : 'Today'}: day ${day.number} of ${dayCount}${
        dayDate ? `, ${dayDate}` : ''
      }. ${kindWords}.${sourceWords}${reversedWords}`}
    >
      {hiking ? <HeroSilhouette profile={day.elevationProfile} /> : null}
      {/* Preview is HEIGHT-NEUTRAL: the marker rides the existing eyebrow
          line and the exit action floats in the hero's top corner — no
          standalone status row, so every variant keeps its exact height and
          the one-viewport budget is untouched. Exiting clears ONLY the
          transient pointer; Today reverts to override / date / generic. */}
      {previewing ? (
        <button
          type="button"
          className="hero-exit"
          onClick={onExitPreview}
          aria-label="Exit preview — return to today’s own view"
        >
          <X size={13} strokeWidth={2.4} aria-hidden /> Exit
        </button>
      ) : null}
      <div className="hero-content">
        <span className="hero-day">
          {/* While previewing, the eyebrow trades "of N" for the PREVIEW
              marker so the line stays single at 375px (height-neutral rule).
              The activity glyphs are NOT traded: what the day is stays
              visible in both modes, and on very narrow viewports the badge
              wraps under the exit pill's reserved corner rather than hide.
              Journey, one card below, still reads "Day N of M", and the
              hero's accessible name keeps the full ordered phrase. */}
          {previewing ? (
            <>
              <span className="hero-day__preview">Preview · </span>Day {day.number}
            </>
          ) : (
            <>{sourceLabel ? <span className="hero-day__source">{sourceLabel} · </span> : null}Day {day.number} of {dayCount}</>
          )}
          {dayDate ? <span className="hero-day__date"> · {dayDate}</span> : null}
          <DayTypeBadge kinds={day.kinds} reversed={contraryLegCount > 0} />
        </span>

        {/* Travel BEFORE the walk sits above it: the hero's line order is the
            day's activity order, which is the only thing that distinguishes a
            morning transfer from an evening one. The hero conveys the sequence
            by position alone — a "then hike" lead would cost a line it has not
            got at 375x667, and the ordered phrase is in the accessible name. */}
        {travelLine?.position === 'before' ? (
          <p className="hero-via">{travelLine.line}</p>
        ) : null}

        {hiking && from && to ? (
          <h2 className="hero-title">
            {stopShortName(from)} <span aria-hidden>→</span> {stopShortName(to)}
          </h2>
        ) : (
          <h2 className="hero-title">{kindWords}</h2>
        )}

        {multiStage ? (
          <p className="hero-via hero-via--stages">
            {day.stages.length} stages{viaNames.length > 0 ? ` · via ${viaNames.join(', ')}` : ''}
          </p>
        ) : null}


        {/* A travel leg after the walk is one quiet line below it. It renders
            even when nothing in Lists → Trip matches the date, so a mixed day
            is never mistakable for a plain hiking day. */}
        {travelLine && travelLine.position !== 'before' ? (
          <p className="hero-via">{travelLine.line}</p>
        ) : null}
        {!hiking && !travel && day.kinds.includes('rest') ? (
          <p className="hero-via">
            {day.overnight.kind === 'stop' && day.overnight.stopId
              ? `Based at ${stopShortName(STOPS_BY_ID[day.overnight.stopId])}`
              : 'A day off the trail'}
          </p>
        ) : null}

        {hiking ? (
          <div className="hero-stats tnum">
            <span>{formatDistanceKm(day.distanceKm)}</span>
            <span aria-hidden>·</span>
            <span>
              ↗ {day.totalAscentM ?? '—'} m · ↘ {day.totalDescentM ?? '—'} m
            </span>
            <span aria-hidden>·</span>
            <span>{formatHoursEstimate(day.estimatedHours)}</span>
          </div>
        ) : null}

        {highlights.length > 0 ? (
          <ul className="hero-chips" aria-label="Stage characteristics">
            {highlights.map((h) => {
              const HighlightIcon = HERO_HIGHLIGHT_ICONS[h.icon];
              return (
                <li key={h.id} className="hero-chip">
                  <HighlightIcon size={13} strokeWidth={2.2} aria-hidden />
                  {h.label}
                </li>
              );
            })}
          </ul>
        ) : null}

        {hiking && leadStage ? (
          <HikingHeroActions
            guideStageIds={guideStageIds}
            reversedStageIds={reversedStageIds}
            mapStageId={leadStage.id}
            routeFocus={routeFocus}
            routeLabel={routeLabel}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="hero-actions">
            {/* Travel-ONLY days get the Trip action. On a mixed day the walking
                owns the two actions and the transfer is already stated on the
                line above — a third button would crowd the block past its fixed
                responsibility and past the one-viewport budget. */}
            {travel && !hiking ? (
              <button
                className="hero-action hero-action--primary"
                onClick={() => onNavigate('checklist', { lists: { section: 'trip' } })}
                aria-label="Open in Trip — your travel and tickets for today"
              >
                <BusFront size={15} strokeWidth={2} aria-hidden /> Open in Trip
              </button>
            ) : null}
            {!hiking && !travel && day.overnight.kind === 'stop' && day.overnight.stopId ? (
              <button
                className="hero-action hero-action--primary"
                onClick={() => onNavigate('huts', { stopId: day.overnight.stopId })}
                aria-label="Stop info — what is available where you are based today"
              >
                <Mountain size={15} strokeWidth={2} aria-hidden /> Stop info
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** Journey rail over the PLANNED calendar days. */
function PlannedJourney({
  day,
  plannedDays,
  previewing,
  journeyActive,
  source,
  onNavigate,
}: {
  day: PlannedDay;
  plannedDays: PlannedDay[];
  /** True when the highlighted day is a preview, not actual progress. */
  previewing: boolean;
  journeyActive: boolean;
  source: TodaySource;
  onNavigate: Navigate;
}) {
  const { setCurrentPlannedDay } = useStore();
  const [choosing, setChoosing] = useState(false);
  const chooserTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openChooser = (trigger: HTMLButtonElement) => {
    chooserTriggerRef.current = trigger;
    setChoosing(true);
  };
  const closeChooser = () => {
    setChoosing(false);
    window.requestAnimationFrame(() => chooserTriggerRef.current?.focus());
  };
  const context =
    source === 'preview'
      ? 'Preview'
      : source === 'manual'
        ? 'Selected'
        : source === 'before-plan'
          ? 'Up next'
          : source === 'after-plan'
            ? 'Plan ended'
            : 'Following dates';
  const label = (d: PlannedDay) => {
    if (d.fromStopId && d.toStopId) {
      return `${stopShortName(STOPS_BY_ID[d.fromStopId])} to ${stopShortName(
        STOPS_BY_ID[d.toStopId],
      )}`;
    }
    return activityOrderPhrase(d);
  };
  const first = plannedDays.find((d) => d.fromStopId);
  const last = [...plannedDays].reverse().find((d) => d.toStopId);
  return (
    <section className="card today-glass today-glass--light" aria-label={`${journeyActive ? 'Personal Day plan Journey' : 'Previewed Day plan Journey'} progress`}>
      <div className="row-between">
        {journeyActive ? (
          <button
            type="button"
            className="journey-choose"
            onClick={(e) => openChooser(e.currentTarget)}
            aria-label="Choose the planned day shown on Today"
          >
            <span className="card-title">Journey</span><ChevronRight size={16} aria-hidden />
          </button>
        ) : <span className="card-title">Journey</span>}
        <span className="card-sub tnum" style={{ marginTop: 0 }}>
          {context} · Day {day.number} of {plannedDays.length}
        </span>
      </div>
      <div className="journey" role="list">
        {plannedDays.map((d) => {
          const status =
            d.number < day.number ? 'past' : d.number === day.number ? 'current' : 'future';
          const alreadyShown = status === 'current' && !previewing;
          return (
            <button
              key={d.id}
              role="listitem"
              className={`journey-step is-${status}${d.stages.length === 0 ? ' is-off-trail' : ''}`}
              onClick={() => {
                if (!journeyActive) {
                  onNavigate('stages');
                  return;
                }
                // Keep a selected occurrence intact when its day is already
                // shown. A preview is different: tapping it commits that day.
                if (!alreadyShown) setCurrentPlannedDay(d.id);
              }}
              // A previewed day is highlighted but never announced as actual
              // progress: "(previewing)", and no aria-current step claim.
              aria-label={`Day ${d.number}: ${label(d)}${
                status === 'current' ? (previewing ? ' (previewing)' : ' (current day)') : ''
              }. ${journeyActive ? (alreadyShown ? 'Already shown on Today.' : 'Show this day on Today.') : 'Opens Stages.'}`}
              aria-current={status === 'current' && !previewing ? 'step' : undefined}
            >
              <span className="journey-dot tnum">{d.number}</span>
            </button>
          );
        })}
      </div>
      <div className="journey-legend row-between">
        <span>{first ? stopShortName(STOPS_BY_ID[first.fromStopId as string]) : ''}</span>
        <span>{last ? stopShortName(STOPS_BY_ID[last.toStopId as string]) : ''}</span>
      </div>
      {choosing ? (
        <PlannedDayChooser
          days={plannedDays}
          shownDay={day}
          source={source}
          onClose={closeChooser}
        />
      ) : null}
    </section>
  );
}

function PlannedDayChooser({
  days,
  shownDay,
  source,
  onClose,
}: {
  days: PlannedDay[];
  shownDay: PlannedDay;
  source: TodaySource;
  onClose: () => void;
}) {
  const { dayPlan, setCurrentPlannedDay, followPlanDates } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="sheet planned-day-chooser"
      aria-labelledby="planned-day-chooser-title"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id="planned-day-chooser-title">Choose current day</h2>
          <button type="button" className="ctx-help-close" onClick={onClose} aria-label="Close planned-day chooser">✕</button>
        </div>
        <ol className="planned-day-chooser__list">
          {days.map((d) => {
            const route = d.fromStopId && d.toStopId
              ? `${stopShortName(STOPS_BY_ID[d.fromStopId])} to ${stopShortName(STOPS_BY_ID[d.toStopId])}`
              : null;
            const current = d.id === shownDay.id && source !== 'preview';
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="planned-day-choice"
                  // This is the day currently SHOWN by the personal Journey,
                  // not necessarily the device's current calendar date (it
                  // may be manual or clamped), so use the generic current-item
                  // value rather than the misleading `date` token.
                  aria-current={current ? 'true' : undefined}
                  aria-label={`Day ${d.number}, ${formatDayDate(d.date) ?? 'date unavailable'}, ${activityOrderPhrase(d)}${route ? `, ${route}` : ''}${current ? ', current' : ''}`}
                  onClick={() => { setCurrentPlannedDay(d.id); onClose(); }}
                >
                  <span className="planned-day-choice__number tnum">{d.number}</span>
                  <span className="planned-day-choice__copy">
                    <strong>{formatDayDate(d.date) ?? `Day ${d.number}`}</strong>
                    <span><DayTypeBadge kinds={d.kinds} />{activityOrderPhrase(d)}{route ? ` · ${route}` : ''}</span>
                  </span>
                  {current ? <span className="pill pill-current">Current</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="btn btn-block"
          disabled={dayPlan?.currentDayId == null && dayPlan?.currentLegId == null}
          onClick={() => { followPlanDates(); onClose(); }}
        >
          Follow plan dates
        </button>
      </div>
    </dialog>
  );
}

function NoStageEmpty({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <div className="card today-glass today-glass--opaque empty">
      <Mountain size={30} strokeWidth={1.5} aria-hidden style={{ opacity: 0.5 }} />
      <p>
        No current stage selected. Head to Stages and tap “Set as current” to
        light up your day.
      </p>
      <button
        className="btn btn-primary"
        style={{ marginTop: 14 }}
        onClick={() => onNavigate('stages')}
      >
        Choose a stage
      </button>
    </div>
  );
}

/**
 * The original, date-independent stage hero — what On route shows whenever
 * there is no Day plan. No date, no activity indicator, nothing planned.
 */
function StageHero({
  stage,
  routeDirection,
  onNavigate,
}: {
  stage: ItineraryStage;
  routeDirection: RouteDirection;
  onNavigate: Navigate;
}) {
  const { stages } = useStore();
  const from = STOPS_BY_ID[stage.fromHutId];
  const to = STOPS_BY_ID[stage.toHutId];
  const highlights = stageHighlights(stage.id, undefined, routeDirection);
  return (
    <section className="hero" aria-label={`Current stage, day ${stage.day}`}>
      <HeroSilhouette profile={stage.elevationProfile} />
      <div className="hero-content">
        <span className="hero-day">
          Day {stage.day} of {stages.length}
        </span>
        <h2 className="hero-title">
          {stopShortName(from)} <span aria-hidden>→</span> {stopShortName(to)}
        </h2>
        <div className="hero-stats tnum">
          <span>{formatDistanceKm(stage.distanceKm)}</span>
          <span aria-hidden>·</span>
          <span>
            ↗ {stage.totalAscentM ?? '—'} m · ↘ {stage.totalDescentM ?? '—'} m
          </span>
          <span aria-hidden>·</span>
          <span>{formatHoursEstimate(stage.estimatedHours)}</span>
        </div>
        {highlights.length > 0 ? (
          <ul className="hero-chips" aria-label="Stage characteristics">
            {highlights.map((h) => {
              const HighlightIcon = HERO_HIGHLIGHT_ICONS[h.icon];
              return (
                <li key={h.id} className="hero-chip">
                  <HighlightIcon size={13} strokeWidth={2.2} aria-hidden />
                  {h.label}
                </li>
              );
            })}
          </ul>
        ) : null}
        <HikingHeroActions
          guideStageIds={[stage.id]}
          mapStageId={stage.id}
          routeLabel={`${stopShortName(from)} to ${stopShortName(to)}`}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  );
}

/** The original journey rail: one marker per canonical stage. */
function StageJourney({
  currentStage,
  onNavigate,
}: {
  currentStage: ItineraryStage;
  onNavigate: Navigate;
}) {
  const { stages } = useStore();
  return (
    <section className="card today-glass today-glass--light" aria-label="Journey progress">
      <div className="row-between">
        <span className="card-title">Journey</span>
        <span className="card-sub tnum" style={{ marginTop: 0 }}>
          Day {currentStage.day} of {stages.length}
        </span>
      </div>
      <div className="journey" role="list">
        {stages.map((stage) => {
          const status =
            stage.day < currentStage.day
              ? 'past'
              : stage.day === currentStage.day
                ? 'current'
                : 'future';
          const sFrom = STOPS_BY_ID[stage.fromHutId];
          const sTo = STOPS_BY_ID[stage.toHutId];
          return (
            <button
              key={stage.id}
              role="listitem"
              className={`journey-step is-${status}`}
              onClick={() => onNavigate('stages')}
              aria-label={`Day ${stage.day}: ${stopShortName(sFrom)} to ${stopShortName(sTo)}${
                status === 'current' ? ' (current stage)' : ''
              }. Opens Stages.`}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className="journey-dot tnum">{stage.day}</span>
            </button>
          );
        })}
      </div>
      <div className="journey-legend row-between">
        <span>{stopShortName(STOPS_BY_ID[stages[0].fromHutId])}</span>
        <span>{stopShortName(STOPS_BY_ID[stages[stages.length - 1].toHutId])}</span>
      </div>
    </section>
  );
}

/**
 * Tonight at a canonical stop — unchanged behaviour, now driven by the
 * effective overnight rather than always by the walking endpoint. When there
 * is no overnight the card is omitted and the space is left alone.
 *
 * The card's internal composition is a fixed three-row hierarchy (the
 * .tonight-card grid): the TONIGHT label sharing only a narrow chevron
 * gutter, then the location name across the full card width, then one
 * metadata row — facilities left, elevation right. Nothing is ever laid out
 * BESIDE the title, so the name renders in full even when quick actions
 * narrow the card.
 */
function TonightCard({ stopId, onNavigate }: { stopId: string; onNavigate: Navigate }) {
  const stop = STOPS_BY_ID[stopId];
  if (!stop) return null;
  const displayName =
    stop.type === 'village' ? stopShortName(stop) : `STF ${stopShortName(stop)}`;
  const waypoint = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]];
  const elevation = waypoint?.elevation != null ? Math.round(waypoint.elevation) : null;
  const noShop = importantAbsences(stop).some((f) => f.id === 'shop');
  // Four icons at most (down from the original five): the metadata row
  // shares the card with a right-aligned elevation, and the card itself can
  // sit beside two quick actions — a fifth icon wraps exactly where the
  // space is tightest. Same priority order and icon set as Stops.
  const facilities = collapsedFacilities(stop, 4);
  const labels = facilities.map((f) => f.label);
  const facilitySentence =
    labels.length > 0
      ? ` Facilities include ${
          labels.length > 1
            ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
            : labels[0]
        }.`
      : '';
  return (
    <div className="tonight-row">
      <button
        className="today-action-card tonight-card today-glass today-glass--light"
        onClick={() => onNavigate('huts', { stopId: stop.id })}
        aria-label={`Tonight: ${displayName}${
          elevation != null ? `, ${elevation} metres elevation` : ''
        }${noShop ? ', no shop' : ''}.${facilitySentence} Opens stop details in Stops.`}
      >
        <span className="tonight-card__label">Tonight</span>
        <span className="tonight-card__title">{displayName}</span>
        {facilities.length > 0 || noShop || elevation != null ? (
          <span className="tonight-card__meta" aria-hidden>
            <span className="tonight-card__facilities">
              {facilities.map((f) => (
                <span key={f.id} className="tonight-card__facility" title={f.label}>
                  <FacilityIcon id={f.id} size={15} />
                </span>
              ))}
              {noShop ? (
                <span className="tonight-card__warning" title="No shop at this stop">
                  <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                </span>
              ) : null}
            </span>
            {elevation != null ? (
              <span className="tonight-card__elevation tnum">
                <Mountain size={13} strokeWidth={2} aria-hidden />
                {elevation.toLocaleString('en-US')} m
              </span>
            ) : null}
          </span>
        ) : null}
        <ChevronRight className="tonight-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      <MembershipQuickAccess />
    </div>
  );
}

/**
 * Tonight at a personal Stay linked to a CURATED OFF-ROUTE Journey Place
 * (e.g. STF Kiruna). The title stays the user's own Stay title — the place
 * supplies only verified metadata: up to four facility icons in the shared
 * priority order, and navigation to the Place in Stops & places. No
 * elevation is rendered — off-route Places carry no verified waypoint, and
 * nothing is ever invented. Same three-row hierarchy as the canonical card;
 * the metadata row simply has an empty right-hand column.
 */
function CuratedPlaceTonightCard({
  place,
  title,
  onNavigate,
}: {
  place: CuratedOffRoutePlace;
  title: string;
  onNavigate: Navigate;
}) {
  const facilities = collapsedFacilityList(place.facilities, 4);
  const labels = facilities.map((f) => f.label);
  const facilitySentence =
    labels.length > 0
      ? ` Facilities include ${
          labels.length > 1
            ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
            : labels[0]
        }.`
      : '';
  return (
    <div className="tonight-row">
      <button
        className="today-action-card tonight-card today-glass today-glass--light"
        onClick={() => onNavigate('huts', { placeId: place.id })}
        aria-label={`Tonight: ${title}.${facilitySentence} Opens place details in Stops & places.`}
      >
        <span className="tonight-card__label">Tonight</span>
        <span className="tonight-card__title">{title}</span>
        {facilities.length > 0 ? (
          <span className="tonight-card__meta" aria-hidden>
            <span className="tonight-card__facilities">
              {facilities.map((f) => (
                <span key={f.id} className="tonight-card__facility" title={f.label}>
                  <FacilityIcon id={f.id} size={15} />
                </span>
              ))}
            </span>
          </span>
        ) : null}
        <ChevronRight className="tonight-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      <MembershipQuickAccess />
    </div>
  );
}

/** Tonight at a personal Trip stay — off-route accommodation the app cannot describe. */
function StayTonightCard({ title, onNavigate }: { title: string; onNavigate: Navigate }) {
  return (
    <div className="tonight-row">
      <button
        className="today-action-card tonight-card today-glass today-glass--light"
        onClick={() => onNavigate('checklist', { lists: { section: 'trip' } })}
        aria-label={`Tonight: ${title}. Opens your Trip plan.`}
      >
        <span className="tonight-card__label">Tonight</span>
        <span className="tonight-card__title">{title}</span>
        <ChevronRight className="tonight-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      <MembershipQuickAccess />
    </div>
  );
}
