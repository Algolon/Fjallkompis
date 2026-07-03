import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, Mountain, Route, TriangleAlert } from 'lucide-react';
import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader, OnlineBadge } from '../components/ui';
import { STOPS_BY_ID, importantAbsences, stopShortName } from '../data/stops';
import { pickTodayBackground } from '../data/todayBackgrounds';
import { formatDistanceKm, formatHours, formatDateLong } from '../utils/format';
import { HUT_TO_WAYPOINT, STAGE_BY_ID, WAYPOINT_BY_ID } from '../route/routeData';
import type { TabId } from '../components/TabBar';
import type { ListsMode } from './ListsScreen';

export interface NavPayload {
  stopId?: string;
  listsMode?: ListsMode;
}

type Navigate = (t: TabId, payload?: NavPayload) => void;

/** Subtle elevation silhouette drawn behind the hero card content. */
function HeroSilhouette({ stageId }: { stageId: string }) {
  const path = useMemo(() => {
    const profile = STAGE_BY_ID[stageId]?.elevationProfile;
    if (!profile || profile.length < 2) return null;
    const W = 400;
    const H = 120;
    const xMax = profile[profile.length - 1].distanceKm;
    const x0 = profile[0].distanceKm;
    const eles = profile.map((p) => p.elevationM);
    const yMin = Math.min(...eles);
    const yMax = Math.max(...eles);
    const sx = (d: number) => ((d - x0) / (xMax - x0)) * W;
    const sy = (e: number) => H - 6 - ((e - yMin) / (yMax - yMin || 1)) * (H - 30);
    const buckets = 90;
    const step = profile.length / buckets;
    const pts: string[] = [];
    for (let b = 0; b <= buckets; b++) {
      const i = Math.min(profile.length - 1, Math.floor(b * step));
      const p = profile[i];
      pts.push(`${b === 0 ? 'M' : 'L'}${sx(p.distanceKm).toFixed(1)},${sy(p.elevationM).toFixed(1)}`);
    }
    return { line: pts.join(''), area: `${pts.join('')}L${W},${H}L0,${H}Z`, W, H };
  }, [stageId]);

  if (!path) return null;
  return (
    <svg
      className="hero-silhouette"
      viewBox={`0 0 ${path.W} ${path.H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path.area} fill="rgba(255,255,255,0.10)" />
      <path d={path.line} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
    </svg>
  );
}

export function TodayScreen({ onNavigate }: { onNavigate: Navigate }) {
  const {
    currentStage,
    checklistCheckedCount,
    checklistTotal,
    latestJournalEntry,
  } = useStore();

  // Picked once per mount (lazy initializer): the photo stays stable through
  // checklist/journal/state updates and changes only when Today is re-opened.
  const [background] = useState(pickTodayBackground);

  const from = currentStage ? STOPS_BY_ID[currentStage.fromHutId] : null;
  const to = currentStage ? STOPS_BY_ID[currentStage.toHutId] : null;
  const nextStop = to;
  const nextStopElevation =
    nextStop && WAYPOINT_BY_ID[HUT_TO_WAYPOINT[nextStop.id]]?.elevation != null
      ? Math.round(WAYPOINT_BY_ID[HUT_TO_WAYPOINT[nextStop.id]].elevation as number)
      : null;
  const nextStopNoShop = nextStop
    ? importantAbsences(nextStop).some((f) => f.id === 'shop')
    : false;

  const checklistPct =
    checklistTotal === 0 ? 0 : (checklistCheckedCount / checklistTotal) * 100;

  const journalPreview = latestJournalEntry
    ? latestJournalEntry.highlight?.trim() ||
      latestJournalEntry.reflection?.trim() ||
      'No highlight written yet.'
    : 'No entries yet — jot down one good moment tonight.';

  return (
    <div className="screen today-screen">
      {/* Decorative photo layer: local WebP, behind everything, unmounts with
          this screen. Overlay gradient lives in CSS on the same element. */}
      <div
        className="today-bg"
        aria-hidden
        style={
          background
            ? {
                '--today-bg-image': `url("${background.src}")`,
                '--today-bg-position': background.objectPosition,
              } as CSSProperties
            : undefined
        }
      />

      <div className="row-between today-topline" style={{ marginBottom: 8 }}>
        <span className="eyebrow today-eyebrow">Kungsleden</span>
        <OnlineBadge />
      </div>

      <ScreenHeader eyebrow="" title="Today">
        Your day at a glance. Everything here works offline.
      </ScreenHeader>

      {currentStage && from && to ? (
        <>
          {/* A. Hero: current stage (unchanged spruce anchor) */}
          <section className="hero" aria-label={`Current stage, day ${currentStage.day}`}>
            <HeroSilhouette stageId={currentStage.id} />
            <div className="hero-content">
              <div className="row-between">
                <span className="hero-day">Day {currentStage.day} of {STAGES.length}</span>
                <button
                  className="hero-cta"
                  onClick={() => onNavigate('map')}
                  aria-label="View today’s route on the map"
                >
                  <Route size={14} strokeWidth={2} aria-hidden /> View route
                </button>
              </div>
              <h2 className="hero-title">
                {stopShortName(from)} <span aria-hidden>→</span> {stopShortName(to)}
              </h2>
              <div className="hero-stats tnum">
                <span>{formatDistanceKm(currentStage.distanceKm)}</span>
                <span aria-hidden>·</span>
                <span>
                  ↗ {currentStage.totalAscentM ?? '—'} m · ↘ {currentStage.totalDescentM ?? '—'} m
                </span>
                <span aria-hidden>·</span>
                <span>~{formatHours(currentStage.estimatedHours)} est.</span>
              </div>
              <p className="hero-note">
                Distance & climbing from GPX — time is a personal estimate.
              </p>
            </div>
          </section>

          {/* B. Journey progress */}
          <section className="card today-glass today-glass--light" aria-label="Journey progress">
            <div className="row-between">
              <span className="card-title">Journey</span>
              <span className="card-sub tnum" style={{ marginTop: 0 }}>
                Day {currentStage.day} of {STAGES.length}
              </span>
            </div>
            <div className="journey" role="list">
              {STAGES.map((stage) => {
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
                    // Opens the Stages screen — changing the current stage
                    // stays an explicit action there.
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
              <span>{stopShortName(STOPS_BY_ID[STAGES[0].fromHutId])}</span>
              <span>{stopShortName(STOPS_BY_ID[STAGES[STAGES.length - 1].toHutId])}</span>
            </div>
          </section>

          {/* C. Tonight's stop — compact navigation card */}
          {nextStop ? (
            <button
              className="today-action-card today-glass today-glass--light"
              onClick={() => onNavigate('huts', { stopId: nextStop.id })}
              aria-label={`Tonight: ${stopShortName(nextStop)}${
                nextStopElevation != null ? `, ${nextStopElevation} metres elevation` : ''
              }${nextStopNoShop ? ', no shop' : ''}. Opens stop details in Stops.`}
            >
              <span className="today-action-card__body">
                <span className="today-action-card__label">Tonight</span>
                <span className="today-action-card__title">{stopShortName(nextStop)}</span>
              </span>
              <span className="today-action-card__side">
                {nextStopElevation != null ? (
                  <span className="today-action-card__value tnum">
                    <Mountain size={13} strokeWidth={2} aria-hidden />
                    {nextStopElevation.toLocaleString('en-US')} m
                  </span>
                ) : null}
                {nextStopNoShop ? (
                  <span className="today-action-card__warn">
                    <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                  </span>
                ) : null}
              </span>
              <ChevronRight
                className="today-action-card__chevron"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
            </button>
          ) : null}

          {/* D. Daily list — compact navigation card */}
          <button
            className="today-action-card today-glass today-glass--light"
            onClick={() => onNavigate('checklist', { listsMode: 'daily' })}
            aria-label={`Daily list: ${checklistCheckedCount} of ${checklistTotal} done. Opens the daily list in Lists.`}
          >
            <span className="today-action-card__body">
              <span className="today-action-card__row">
                <span className="today-action-card__title">Daily list</span>
                <span className="today-action-card__value tnum">
                  {checklistCheckedCount}/{checklistTotal} done
                </span>
              </span>
              <span className="today-action-card__progress" aria-hidden>
                <span
                  className="today-action-card__progress-fill"
                  style={{ width: `${checklistPct}%` }}
                />
              </span>
            </span>
            <ChevronRight
              className="today-action-card__chevron"
              size={18}
              strokeWidth={2}
              aria-hidden
            />
          </button>

          {/* E. Latest journal — compact, whole card opens Journal */}
          <button
            className="today-action-card today-glass today-glass--opaque"
            onClick={() => onNavigate('journal')}
            aria-label={
              latestJournalEntry
                ? `Latest journal, ${formatDateLong(latestJournalEntry.date)}. Opens Journal.`
                : 'No journal entries yet. Opens Journal to write the first one.'
            }
          >
            <span className="today-action-card__body">
              <span className="today-action-card__row">
                <span className="today-action-card__title">Latest journal</span>
                {latestJournalEntry ? (
                  <span className="today-action-card__value">
                    {formatDateLong(latestJournalEntry.date)}
                  </span>
                ) : null}
              </span>
              <span className="today-action-card__preview">{journalPreview}</span>
            </span>
            <ChevronRight
              className="today-action-card__chevron"
              size={18}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </>
      ) : (
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
      )}
    </div>
  );
}
