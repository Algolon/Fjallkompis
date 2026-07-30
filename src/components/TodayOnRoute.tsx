import { useStore } from '../store/AppStore';
import {
  BookOpen,
  BusFront,
  ChevronRight,
  Coffee,
  Footprints,
  Mountain,
  Route,
  TriangleAlert,
} from 'lucide-react';
import { FacilityIcon } from './FacilityIcon';
import { MembershipQuickAccess } from './MembershipQuickAccess';
import {
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { stageHighlights } from '../data/stageHighlights.mjs';
import { formatDistanceKm, formatHoursEstimate } from '../utils/format';
import { formatDateFieldLabel } from '../utils/dateTimeField.mjs';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';
import { HERO_HIGHLIGHT_ICONS, HeroSilhouette } from './TodayHero';
import { activityOrderPhrase, travelPresentation } from '../plan/dayPresentation.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';
import type { ItineraryStage } from '../route/activeItinerary';
import type { DayActivityKind, RouteDirection, TripItem } from '../types';
import type { NavPayload } from '../screens/TodayScreen';
import type { TabId } from './TabBar';

type Navigate = (t: TabId, payload?: NavPayload) => void;

/**
 * "Sat 5 Sep" — the compact hero date, formatted from the PLAN's stored date.
 * Uses the deterministic, fixed-English helper the pickers use, which builds
 * dates from numeric parts only. Nothing here reads the clock: the day shown
 * is the one the user selected, never today's system date.
 */
function formatDayDate(iso: string): string | null {
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
  // How the shown day was resolved, and the way back from a manual override.
  // A pointer set via Stages → "Set as current" never expires by itself, so
  // while one is active Today says so and offers ONE quiet action to return
  // to following the plan's dates. Hidden the moment no override is active.
  const { todaySource, followPlanDates } = useStore();

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

  return (
    <>
      <PlannedDayHero
        day={day}
        dayCount={plannedDays.length}
        routeDirection={routeDirection}
        onNavigate={onNavigate}
      />
      {todaySource === 'override' ? (
        <div className="today-override today-glass today-glass--light">
          <span className="today-override__label">Manually selected day</span>
          <button
            type="button"
            className="stage-set-pill"
            onClick={followPlanDates}
            aria-label="Follow plan dates — show the planned day for today’s date again"
          >
            Follow plan dates
          </button>
        </div>
      ) : null}
      <PlannedJourney day={day} plannedDays={plannedDays} onNavigate={onNavigate} />
      {overnightStopId ? (
        <TonightCard stopId={overnightStopId} onNavigate={onNavigate} />
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
function DayTypeBadge({ kinds }: { kinds: DayActivityKind[] }) {
  return (
    <span className="hero-day__type" aria-hidden>
      {kinds.map((kind) => {
        const Icon = ACTIVITY_ICON[kind];
        return <Icon key={kind} size={14} strokeWidth={2.1} />;
      })}
    </span>
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
  onNavigate,
}: {
  day: PlannedDay;
  dayCount: number;
  routeDirection: RouteDirection;
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
  // Chips only on a plain single-stage hiking day. A combined day would have
  // to merge two capped lists into one capped list, silently dropping half
  // the metadata; a mixed day already spends that line on the transfer. Both
  // cases also need the height — the hero has none spare at 375x667.
  const highlights =
    hiking && !multiStage && !travel && leadStage
      ? stageHighlights(leadStage.id, undefined, routeDirection)
      : [];
  // One shared helper decides the wording AND the position, so Today and the
  // Settings planner can never disagree about which happened first.
  const travelLine = travelPresentation(day);

  return (
    <section
      className="hero"
      aria-label={`Today: day ${day.number} of ${dayCount}${
        dayDate ? `, ${dayDate}` : ''
      }. ${kindWords}.`}
    >
      {hiking ? <HeroSilhouette profile={day.elevationProfile} /> : null}
      <div className="hero-content">
        <span className="hero-day">
          Day {day.number} of {dayCount}
          {dayDate ? <span className="hero-day__date"> · {dayDate}</span> : null}
          <DayTypeBadge kinds={day.kinds} />
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
          <p className="hero-via">
            via {day.viaStopIds.map((id) => stopShortName(STOPS_BY_ID[id])).join(' and ')}
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

        <div className="hero-actions">
          {hiking && multiStage && leadStage ? (
            // One honest action: a single Stage Guide or View Route would open
            // only ONE of the day's stages. Stages lists them adjacently, and
            // this day's FIRST stage is where it opens.
            <button
              className="hero-action hero-action--primary"
              onClick={() => onNavigate('stages', { guideStageId: leadStage.id })}
              aria-label={`Open in Stages — today’s ${day.stages.length} stages, each with its own guide and map`}
            >
              <BookOpen size={15} strokeWidth={2} aria-hidden /> Open in Stages
            </button>
          ) : hiking && leadStage ? (
            <>
              <button
                className="hero-action hero-action--primary"
                onClick={() => onNavigate('stages', { guideStageId: leadStage.id })}
                aria-label="Stage Guide — open today’s full day guide in Stages"
              >
                <BookOpen size={15} strokeWidth={2} aria-hidden /> Stage Guide
              </button>
              <button
                className="hero-action"
                onClick={() => onNavigate('map', { mapStageId: leadStage.id })}
                aria-label="View Route — show today’s stage on the map"
              >
                <Route size={15} strokeWidth={2} aria-hidden /> View Route
              </button>
            </>
          ) : null}
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
      </div>
    </section>
  );
}

/** Journey rail over the PLANNED calendar days. */
function PlannedJourney({
  day,
  plannedDays,
  onNavigate,
}: {
  day: PlannedDay;
  plannedDays: PlannedDay[];
  onNavigate: Navigate;
}) {
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
    <section className="card today-glass today-glass--light" aria-label="Journey progress">
      <div className="row-between">
        <span className="card-title">Journey</span>
        <span className="card-sub tnum" style={{ marginTop: 0 }}>
          Day {day.number} of {plannedDays.length}
        </span>
      </div>
      <div className="journey" role="list">
        {plannedDays.map((d) => {
          const status =
            d.number < day.number ? 'past' : d.number === day.number ? 'current' : 'future';
          return (
            <button
              key={d.id}
              role="listitem"
              className={`journey-step is-${status}${d.stages.length === 0 ? ' is-off-trail' : ''}`}
              onClick={() => onNavigate('stages')}
              aria-label={`Day ${d.number}: ${label(d)}${
                status === 'current' ? ' (current day)' : ''
              }. Opens Stages.`}
              aria-current={status === 'current' ? 'step' : undefined}
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
    </section>
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
        <div className="hero-actions">
          <button
            className="hero-action hero-action--primary"
            onClick={() => onNavigate('stages', { guideStageId: stage.id })}
            aria-label="Stage Guide — open today’s full day guide in Stages"
          >
            <BookOpen size={15} strokeWidth={2} aria-hidden /> Stage Guide
          </button>
          <button
            className="hero-action"
            onClick={() => onNavigate('map', { mapStageId: stage.id })}
            aria-label="View Route — show today’s stage on the map"
          >
            <Route size={15} strokeWidth={2} aria-hidden /> View Route
          </button>
        </div>
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
 */
function TonightCard({ stopId, onNavigate }: { stopId: string; onNavigate: Navigate }) {
  const stop = STOPS_BY_ID[stopId];
  if (!stop) return null;
  const waypoint = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]];
  const elevation = waypoint?.elevation != null ? Math.round(waypoint.elevation) : null;
  const noShop = importantAbsences(stop).some((f) => f.id === 'shop');
  const facilities = collapsedFacilities(stop, 5);
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
        className="today-action-card today-glass today-glass--light"
        onClick={() => onNavigate('huts', { stopId: stop.id })}
        aria-label={`Tonight: ${stopShortName(stop)}${
          elevation != null ? `, ${elevation} metres elevation` : ''
        }${noShop ? ', no shop' : ''}.${facilitySentence} Opens stop details in Stops.`}
      >
        <span className="today-action-card__body">
          <span className="today-action-card__label">Tonight</span>
          <span className="today-action-card__title">{stopShortName(stop)}</span>
          {facilities.length > 0 || noShop ? (
            <span className="today-stop-facilities" aria-hidden>
              {facilities.map((f) => (
                <span key={f.id} className="today-stop-facility" title={f.label}>
                  <FacilityIcon id={f.id} size={15} />
                </span>
              ))}
              {noShop ? (
                <span className="today-stop-warning" title="No shop at this stop">
                  <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="today-action-card__side">
          {elevation != null ? (
            <span className="today-action-card__value tnum">
              <Mountain size={13} strokeWidth={2} aria-hidden />
              {elevation.toLocaleString('en-US')} m
            </span>
          ) : null}
        </span>
        <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
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
        className="today-action-card today-glass today-glass--light"
        onClick={() => onNavigate('checklist', { lists: { section: 'trip' } })}
        aria-label={`Tonight: ${title}. Opens your Trip plan.`}
      >
        <span className="today-action-card__body">
          <span className="today-action-card__label">Tonight</span>
          <span className="today-action-card__title">{title}</span>
        </span>
        <ChevronRight className="today-action-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      <MembershipQuickAccess />
    </div>
  );
}
