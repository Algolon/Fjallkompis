import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Compass } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { ElevationProfile } from '../components/ElevationProfile';
import { HighlightsAndDetours } from '../components/StageExperiences';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { stageGuide } from '../data/stageGuides.mjs';
import type { StageGuide } from '../data/stageGuides.mjs';
import { experienceCountForStage } from '../data/routeExperiences';
import { experienceTrack, experienceWaypoint } from '../data/experienceGeometry';
import {
  formatDistanceKm,
  formatHoursEstimate,
  formatVerifiedDate,
} from '../utils/format';
import type { ItineraryStage } from '../route/activeItinerary';
import type { NavPayload } from './TodayScreen';
import type { RouteExperience } from '../types';

/**
 * The expanded day guide: this stage's own elevation profile first, then
 * editorial, hedged route guidance from src/data/stageGuides.mjs —
 * deliberately calm prose, not another stats dashboard, and NOT live
 * conditions. The chart uses the ACTIVE itinerary stage's oriented data
 * (stage-local distances 0 → stage length and direction-aware ascent/descent),
 * never a crop of the overview profile. Sources/verification stay auditable in
 * the data module; the panel shows only the verification date.
 */
function StageGuidePanel({ stage, guide }: { stage: ItineraryStage; guide: StageGuide }) {
  return (
    <>
      <div className="stage-guide__section stage-guide__elevation">
        <span className="stage-guide__label">Elevation profile</span>
        <ElevationProfile
          profile={stage.elevationProfile}
          statistics={stage.statistics}
        />
      </div>

      <p className="stage-guide__overview">{guide.overview}</p>

      <div className="stage-guide__section">
        <span className="stage-guide__label">Trail character</span>
        <p>{guide.terrain}</p>
      </div>

      {guide.watchFor && guide.watchFor.length > 0 ? (
        <div className="stage-guide__section">
          <span className="stage-guide__label">Plan for</span>
          <ul className="stage-guide__list">
            {guide.watchFor.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="stage-guide__verified">
        Route guidance verified {formatVerifiedDate(guide.lastVerified)} —
        trail, water and weather conditions vary; check locally.
      </p>
    </>
  );
}

export function StagesScreen({
  initialGuideStageId,
  onNavigate,
}: {
  /** Today's "Stage Guide" deep link: open this stage's guide on arrival. */
  initialGuideStageId?: string | null;
  /** Router, for the "View on map" one-shot focus deep-link. */
  onNavigate?: (tab: 'map', payload?: NavPayload) => void;
}) {
  const { state, itinerary, stages, currentStage, setCurrentStage } = useStore();
  const startStop = itinerary.startStopId ? STOPS_BY_ID[itinerary.startStopId] : null;
  const endStop = itinerary.endStopId ? STOPS_BY_ID[itinerary.endStopId] : null;
  const startName = startStop ? stopShortName(startStop) : 'the start';
  const endName = endStop ? stopShortName(endStop) : 'the end';
  // Independent disclosure per card; collapsed on entry unless deep-linked
  // from Today's Stage Guide action (matches the Stops accordion pattern:
  // local state only, nothing persisted).
  const [openGuides, setOpenGuides] = useState<ReadonlySet<string>>(
    () => new Set<string>(initialGuideStageId ? [initialGuideStageId] : []),
  );
  // The full-route elevation profile is an on-demand disclosure inside the
  // summary card — collapsed by default so the default Stages page stays
  // compact; the pills above already carry the headline figures.
  const [routeElevOpen, setRouteElevOpen] = useState(false);
  const routeElevPanelId = 'route-elevation-panel';
  // "Highlights & detours" is an independent disclosure per card, collapsed on
  // entry — the same local-only pattern as the day guides (nothing persisted).
  // Detours expand inline inside it; there is no pushed detail page.
  const [openExplore, setOpenExplore] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollTargetId = useRef(initialGuideStageId ?? null);

  // When arriving via Stage Guide, bring the (already expanded) current
  // stage card into view once mounted — the user must never have to find
  // it in the list manually. Same pattern as StopsScreen's initialStopId.
  useEffect(() => {
    if (!scrollTargetId.current) return;
    cardRefs.current[scrollTargetId.current]?.scrollIntoView({
      block: 'start',
      behavior: 'auto',
    });
    scrollTargetId.current = null;
  }, []);

  const toggleGuide = (stageId: string) => {
    setOpenGuides((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const toggleExplore = (stageId: string) => {
    setOpenExplore((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  // "View on map": deep-link to the Map with a one-shot, geometry-aware focus.
  // Only reachable when the row/card exposed the action (canViewOnMap). Geometry
  // comes from verified sources only — an owner GPX route, the whole Stage, or an
  // exact point — never derived from an editorial position.
  const viewOnMap = (experience: RouteExperience) => {
    if (!onNavigate) return;
    const loc = experience.location;
    const stageId = experience.segmentIds[0];
    const label = experience.shortTitle ?? experience.title;
    const wp = (role: string) => experienceWaypoint(experience.id, role);
    if (loc.mapAvailability === 'full-stage') {
      onNavigate('map', { mapFocus: { kind: 'stage', stageId, label, note: experience.mapNote } });
    } else if (loc.gpxAssetId) {
      const track = experienceTrack(experience.id);
      onNavigate('map', {
        mapFocus: {
          kind: 'route',
          stageId,
          label,
          track,
          // Start marker: the entry waypoint, or the track's first point when a
          // file supplies no entry (Tarfala starts at the station track point).
          start: wp('entry') ?? track?.[0],
          // Destination marker by role, falling back to the track's last point.
          destination:
            wp('destination') ??
            wp('summit') ??
            wp('viewpoint') ??
            wp('primary') ??
            (track ? track[track.length - 1] : undefined),
        },
      });
    } else if (loc.mapAvailability === 'exact-point') {
      // A verified point with NO route (an off-trail objective, or an exact
      // point). Opens the destination marker only — never a line — with clear
      // off-trail wording so the map is a reference, not a route recommendation.
      const coord = loc.coord ?? wp('destination');
      if (coord) {
        onNavigate('map', {
          mapFocus: {
            kind: 'point',
            stageId,
            label,
            coord,
            note: experience.offTrail
              ? 'Off-trail — no marked or supplied route. This point is a destination reference only; judge the terrain and conditions for yourself.'
              : undefined,
          },
        });
      }
    }
  };

  return (
    <div className="screen screen--stages">
      <ScreenHeader eyebrow="7 days · 8 stops" title="Stages">
        The week from {startName} to {endName} as seven day stages. Distances
        and climbing come from the GPX; ± times are personal estimates. Open a
        day’s guide for what to expect, and use the pill in its corner to set
        the stage you’re walking.
      </ScreenHeader>

      <div className="card" style={{ marginBottom: 14 }}>
        <span className="card-title">{itinerary.displayName}</span>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span className="pill tnum">{formatDistanceKm(itinerary.statistics.distanceKm)} total</span>
          <span className="pill tnum">↗ {itinerary.statistics.totalAscentM} m</span>
          <span className="pill tnum">↘ {itinerary.statistics.totalDescentM} m</span>
          <span className="pill tnum">
            {Math.round(itinerary.statistics.minimumElevationM ?? 0)}–
            {Math.round(itinerary.statistics.maximumElevationM ?? 0)} m
          </span>
        </div>

        {/* Full-route elevation: the same disclosure pattern as the day
            guides below (shared .stage-guide__toggle / .stage-guide styling
            and motion). Collapsed by default — the pills above are the
            information authority, so no statistics grid is repeated here. */}
        <button
          type="button"
          className="stage-guide__toggle"
          aria-expanded={routeElevOpen}
          aria-controls={routeElevPanelId}
          onClick={() => setRouteElevOpen((open) => !open)}
        >
          <span>Elevation profile</span>
          <ChevronDown
            className="stage-guide__chevron"
            size={18}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {routeElevOpen ? (
          <div
            id={routeElevPanelId}
            className="stage-guide"
            role="region"
            aria-label={`${itinerary.displayName} elevation profile`}
          >
            <div className="stage-guide__section stage-guide__elevation">
              <ElevationProfile
                profile={itinerary.overviewElevationProfile}
                statistics={itinerary.statistics}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="stack">
        {stages.map((stage) => {
          const from = STOPS_BY_ID[stage.fromHutId];
          const to = STOPS_BY_ID[stage.toHutId];
          const isCurrent = state.currentStageId === stage.id;
          const guide = stageGuide(stage.id, itinerary.direction);
          const guideOpen = openGuides.has(stage.id);
          const guidePanelId = `stage-guide-${stage.id}`;
          // "Highlights & detours" — count is direction-independent (segment-stable).
          const experienceCount = experienceCountForStage(stage.id);
          const exploreOpen = openExplore.has(stage.id);
          const explorePanelId = `stage-explore-${stage.id}`;
          return (
            <article
              className={`card stage-card ${isCurrent ? 'is-current' : ''}`}
              key={stage.id}
              ref={(el) => {
                cardRefs.current[stage.id] = el;
              }}
            >
              <div className="stage-card__top">
                <div className="row" style={{ gap: 10 }}>
                  <span className={`pill ${isCurrent ? 'pill-current' : ''}`}>
                    Day {stage.day}
                  </span>
                  <span className="tnum" style={{ fontWeight: 700 }}>
                    {formatDistanceKm(stage.distanceKm)}
                  </span>
                </div>
                {isCurrent ? (
                  // Status, not an action: the current stage needs no button.
                  <span className="pill pill-current">
                    <span className="dot" /> Current
                  </span>
                ) : (
                  <button
                    type="button"
                    className="stage-set-pill"
                    onClick={() => setCurrentStage(stage.id)}
                    aria-label={`Set day ${stage.day} as current stage`}
                  >
                    Set as current
                  </button>
                )}
              </div>

              <h2 className="card-title stage-card__route">
                {stopShortName(from)} → {stopShortName(to)}
              </h2>

              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className="pill tnum">↗ {stage.totalAscentM ?? '—'} m</span>
                <span className="pill tnum">↘ {stage.totalDescentM ?? '—'} m</span>
                <span className="pill tnum">
                  {stage.minimumElevationM != null
                    ? `${Math.round(stage.minimumElevationM)}–${Math.round(stage.maximumElevationM ?? 0)} m`
                    : '—'}
                </span>
                <span className="pill tnum" title="Estimated walking time">
                  {formatHoursEstimate(stage.estimatedHours)}
                </span>
              </div>

              <p className="card-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {stage.notes}
              </p>

              {guide || experienceCount > 0 ? (
                <div className="stage-foot">
                  {guide ? (
                    <>
                      <button
                        type="button"
                        className="stage-guide__toggle"
                        aria-expanded={guideOpen}
                        aria-controls={guidePanelId}
                        onClick={() => toggleGuide(stage.id)}
                      >
                        <span>Day guide</span>
                        <ChevronDown
                          className="stage-guide__chevron"
                          size={18}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>
                      {guideOpen ? (
                        <div
                          id={guidePanelId}
                          className="stage-guide"
                          role="region"
                          aria-label={`Day ${stage.day} guide`}
                        >
                          <StageGuidePanel stage={stage} guide={guide} />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* "Highlights & detours" — a second, quiet disclosure. It is
                      a disclosure, not an action: the count (combined Highlights +
                      Detours) is metadata on the trigger, and it stays clear of
                      the top-right current-stage pill. Only rendered when the
                      stage has content — never an empty "· 0". Detours expand
                      inline within it; there is no pushed detail page. */}
                  {experienceCount > 0 ? (
                    <>
                      <button
                        type="button"
                        className="stage-guide__toggle"
                        aria-expanded={exploreOpen}
                        aria-controls={explorePanelId}
                        onClick={() => toggleExplore(stage.id)}
                      >
                        <span className="stage-explore__label">
                          <Compass size={16} strokeWidth={1.9} aria-hidden />
                          Highlights &amp; detours
                          <span className="stage-explore__count">
                            {' '}
                            · {experienceCount}
                          </span>
                        </span>
                        <ChevronDown
                          className="stage-guide__chevron"
                          size={18}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>
                      {exploreOpen ? (
                        <div
                          id={explorePanelId}
                          className="stage-guide"
                          role="region"
                          aria-label={`Day ${stage.day} — highlights and detours`}
                        >
                          <HighlightsAndDetours
                            stageId={stage.id}
                            direction={itinerary.direction}
                            onViewOnMap={viewOnMap}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {!currentStage ? (
        <p className="card-sub" style={{ marginTop: 16, textAlign: 'center' }}>
          Nothing selected yet — pick the day you’re on.
        </p>
      ) : null}
    </div>
  );
}
