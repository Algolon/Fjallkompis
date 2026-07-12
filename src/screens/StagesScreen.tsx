import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { STAGE_GUIDES } from '../data/stageGuides.mjs';
import type { StageGuide } from '../data/stageGuides.mjs';
import {
  formatDistanceKm,
  formatHoursEstimate,
  formatVerifiedDate,
} from '../utils/format';
import { ROUTE } from '../route/routeData';

/**
 * The expanded day guide: editorial, hedged route guidance from
 * src/data/stageGuides.mjs — deliberately calm prose, not another stats
 * dashboard, and NOT live conditions. Sources/verification stay auditable in
 * the data module; the panel shows only the verification date.
 */
function StageGuidePanel({ guide }: { guide: StageGuide }) {
  return (
    <>
      <p className="stage-guide__overview">{guide.overview}</p>

      <div className="stage-guide__section">
        <span className="stage-guide__label">Trail character</span>
        <p>{guide.terrain}</p>
      </div>

      <div className="stage-guide__section">
        <span className="stage-guide__label">Highlights</span>
        <ul className="stage-guide__list">
          {guide.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
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
}: {
  /** Today's "Stage Guide" deep link: open this stage's guide on arrival. */
  initialGuideStageId?: string | null;
}) {
  const { state, currentStage, setCurrentStage } = useStore();
  // Independent disclosure per card; collapsed on entry unless deep-linked
  // from Today's Stage Guide action (matches the Stops accordion pattern:
  // local state only, nothing persisted).
  const [openGuides, setOpenGuides] = useState<ReadonlySet<string>>(
    () => new Set<string>(initialGuideStageId ? [initialGuideStageId] : []),
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

  return (
    <div className="screen screen--stages">
      <ScreenHeader eyebrow="7 days · 8 stops" title="Stages">
        The week from Abisko to Nikkaluokta as seven day stages. Distances and
        climbing come from the GPX; ± times are personal estimates. Open a
        day’s guide for what to expect, and use the pill in its corner to set
        the stage you’re walking.
      </ScreenHeader>

      <div className="card" style={{ marginBottom: 14 }}>
        <span className="card-title">{ROUTE.name}</span>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span className="pill tnum">{formatDistanceKm(ROUTE.statistics.distanceKm)} total</span>
          <span className="pill tnum">↗ {ROUTE.statistics.totalAscentM} m</span>
          <span className="pill tnum">↘ {ROUTE.statistics.totalDescentM} m</span>
          <span className="pill tnum">
            {Math.round(ROUTE.statistics.minimumElevationM ?? 0)}–
            {Math.round(ROUTE.statistics.maximumElevationM ?? 0)} m
          </span>
        </div>
      </div>

      <div className="stack">
        {STAGES.map((stage) => {
          const from = STOPS_BY_ID[stage.fromHutId];
          const to = STOPS_BY_ID[stage.toHutId];
          const isCurrent = state.currentStageId === stage.id;
          const guide = STAGE_GUIDES[stage.id];
          const guideOpen = openGuides.has(stage.id);
          const guidePanelId = `stage-guide-${stage.id}`;
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
                      <StageGuidePanel guide={guide} />
                    </div>
                  ) : null}
                </>
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
