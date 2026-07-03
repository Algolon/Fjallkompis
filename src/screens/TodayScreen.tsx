import { useMemo } from 'react';
import {
  BookOpen,
  ChevronRight,
  ListChecks,
  Map as MapIcon,
  Mountain,
  Route,
  Signpost,
  TriangleAlert,
} from 'lucide-react';
import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader, ProgressRing, OnlineBadge } from '../components/ui';
import { FacilityIcon } from '../components/FacilityIcon';
import {
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { CHECKLIST } from '../data/checklist';
import { formatDistanceKm, formatHours, formatDateLong } from '../utils/format';
import { HUT_TO_WAYPOINT, STAGE_BY_ID, WAYPOINT_BY_ID } from '../route/routeData';
import type { TabId } from '../components/TabBar';
import type { ListsMode } from './ListsScreen';
import type { ChecklistItem } from '../types';

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

/** Up to two unchecked items, most important categories first. */
function importantUnchecked(checked: Record<string, boolean>): ChecklistItem[] {
  const priority = ['safety', 'food-water', 'morning', 'on-trail', 'evening'];
  const ordered = [...CHECKLIST].sort(
    (a, b) => priority.indexOf(a.id) - priority.indexOf(b.id),
  );
  const out: ChecklistItem[] = [];
  for (const cat of ordered) {
    for (const item of cat.items) {
      if (!checked[item.id]) out.push(item);
      if (out.length === 2) return out;
    }
  }
  return out;
}

export function TodayScreen({ onNavigate }: { onNavigate: Navigate }) {
  const {
    state,
    currentStage,
    checklistPercent,
    checklistCheckedCount,
    checklistTotal,
    latestJournalEntry,
  } = useStore();

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
  const uncheckedImportant = importantUnchecked(state.checklist);

  const quickActions: { label: string; tab: TabId; payload?: NavPayload; Icon: typeof MapIcon }[] = [
    { label: 'Map', tab: 'map', Icon: MapIcon },
    { label: 'Lists', tab: 'checklist', Icon: ListChecks },
    { label: 'Stops', tab: 'huts', Icon: Signpost },
    { label: 'Journal', tab: 'journal', Icon: BookOpen },
  ];

  return (
    <div className="screen">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--glacier)' }}>
          Kungsleden
        </span>
        <OnlineBadge />
      </div>

      <ScreenHeader eyebrow="" title="Today">
        Your day at a glance. Everything here works offline.
      </ScreenHeader>

      {currentStage && from && to ? (
        <>
          {/* A. Hero: current stage */}
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
          <section className="card" aria-label="Journey progress">
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

          {/* C. Next stop */}
          {nextStop ? (
            <section className="card" aria-label="Tonight's stop">
              <span className="card-sub">Tonight’s stop</span>
              <div className="row-between" style={{ marginTop: 4 }}>
                <h3 className="card-title" style={{ fontSize: 18 }}>
                  {stopShortName(nextStop)}
                </h3>
                {nextStopElevation != null ? (
                  <span className="pill tnum">
                    <Mountain size={13} strokeWidth={2} aria-hidden /> {nextStopElevation} m
                  </span>
                ) : null}
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                {collapsedFacilities(nextStop, 5).map((f) => (
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
                {nextStopNoShop ? (
                  <span className="pill pill-warn">
                    <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                  </span>
                ) : null}
              </div>
              <button
                className="btn btn-ghost btn-block"
                style={{ marginTop: 12 }}
                onClick={() => onNavigate('huts', { stopId: nextStop.id })}
              >
                Stop details <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </button>
            </section>
          ) : null}

          {/* D. Daily readiness */}
          <section className="card" aria-label="Daily readiness">
            <div className="ring-wrap">
              <ProgressRing percent={checklistPercent} />
              <div style={{ flex: 1 }}>
                <div className="row-between">
                  <span className="card-title">Daily list</span>
                  <span className="ring-num tnum">{checklistPercent}%</span>
                </div>
                <p className="card-sub" style={{ marginTop: 2 }}>
                  {checklistCheckedCount} of {checklistTotal} done
                </p>
              </div>
            </div>
            {uncheckedImportant.length > 0 && checklistPercent < 100 ? (
              <ul className="readiness-list">
                {uncheckedImportant.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            ) : null}
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('checklist', { listsMode: 'daily' })}
            >
              Open daily list
            </button>
          </section>

          {/* E. Quick actions */}
          <nav className="quick-grid" aria-label="Quick actions">
            {quickActions.map(({ label, tab, payload, Icon }) => (
              <button key={label} className="quick-btn" onClick={() => onNavigate(tab, payload)}>
                <Icon size={22} strokeWidth={1.8} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          {/* F. Latest journal */}
          <section className="card" aria-label="Latest journal entry">
            <span className="card-title">Latest journal</span>
            {latestJournalEntry ? (
              <>
                <p className="card-sub" style={{ marginTop: 6 }}>
                  {formatDateLong(latestJournalEntry.date)}
                </p>
                <p className="journal-peek">
                  {latestJournalEntry.highlight?.trim()
                    ? latestJournalEntry.highlight
                    : latestJournalEntry.reflection?.trim()
                      ? latestJournalEntry.reflection
                      : 'No highlight written yet.'}
                </p>
              </>
            ) : (
              <p className="card-sub" style={{ marginTop: 6 }}>
                No entries yet. Tonight, jot down one good moment and one hard one.
              </p>
            )}
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('journal')}
            >
              {latestJournalEntry ? 'Open journal' : 'Write first entry'}
            </button>
          </section>
        </>
      ) : (
        <div className="card empty">
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
