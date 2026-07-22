import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  BookOpen,
  ChevronRight,
  Droplets,
  Mountain,
  MountainSnow,
  Route,
  Sailboat,
  Signpost,
  Snowflake,
  TreePine,
  Trees,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Waves,
  Wind,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { FacilityIcon } from '../components/FacilityIcon';
import { TodayPrepare } from '../components/TodayPrepare';
import { MembershipQuickAccess } from '../components/MembershipQuickAccess';
import { readTodayMode, saveTodayMode } from '../utils/todayMode.mjs';
import type { TodayMode } from '../utils/todayMode.mjs';
import {
  STOPS_BY_ID,
  collapsedFacilities,
  importantAbsences,
  stopShortName,
} from '../data/stops';
import { stageHighlights } from '../data/stageHighlights.mjs';
import type { StageHighlightIcon } from '../data/stageHighlights.mjs';
import { formatDistanceKm, formatHoursEstimate } from '../utils/format';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';
import type { ElevationSample } from '../route/types';
import type { TabId } from '../components/TabBar';
import type { LatLng } from '../types';
import type { ListsDeepLink } from './ListsScreen';
import type { SettingsDeepLinkSection } from './SettingsScreen';

export interface NavPayload {
  stopId?: string;
  mapStageId?: string | null;
  /** Stages: open (and scroll to) this stage's day guide on arrival. */
  guideStageId?: string;
  /** Lists: one-shot deep link into a sub-section (from a Stop's chips). */
  lists?: ListsDeepLink;
  /** Settings: one-shot deep link opening a section (Prepare's readiness card). */
  settings?: { section: SettingsDeepLinkSection };
  /**
   * Map: one-shot "View on map" focus for an experience (from Stages). Geometry
   * comes only from VERIFIED sources — a point, an owner GPX detour route, or the
   * whole Stage (route-wide). The Map shows a temporary highlight; it does NOT
   * enable a persistent experience layer.
   */
  mapFocus?: {
    kind: 'point' | 'route' | 'stage';
    stageId: string;
    label: string;
    coord?: LatLng;
    track?: LatLng[];
    start?: LatLng;
    destination?: LatLng;
    note?: string;
  };
}

type Navigate = (t: TabId, payload?: NavPayload) => void;

/**
 * Decorative topographic-contour background (local SVG, PWA-precached).
 * Subtlety (stroke opacity/width) is baked into the asset; see
 * public/images/today/README.md for how it was produced.
 */
const TODAY_BG_SRC = `${import.meta.env.BASE_URL}images/today/contours.svg`;

/**
 * Highlight icon key → lucide component (same offline, tree-shaken icon
 * system as FacilityIcon). Every StageHighlightIcon key must appear here —
 * fenced by tests/stage-highlights.test.mjs.
 */
const HIGHLIGHT_ICONS: Record<StageHighlightIcon, typeof Wind> = {
  wind: Wind,
  snowflake: Snowflake,
  'mountain-snow': MountainSnow,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  mountain: Mountain,
  trees: Trees,
  signpost: Signpost,
  waves: Waves,
  droplets: Droplets,
  sailboat: Sailboat,
  users: Users,
  'tree-pine': TreePine,
};

/**
 * Subtle elevation silhouette drawn behind the hero card content. The profile
 * is the ACTIVE stage's oriented elevation profile (0 km at the direction's
 * stage start), so the silhouette follows the direction being walked.
 */
function HeroSilhouette({ profile }: { profile: ElevationSample[] }) {
  const path = useMemo(() => {
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
  }, [profile]);

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

/**
 * The two Today contexts. Prepare first (it precedes the hike), On route
 * second — the pre-existing day view and the default when nothing is
 * remembered. The compact header control carries full visible labels
 * (measured to fit beside the title at 320px); no icons — they would force
 * a wider control without adding meaning the words don't already carry.
 */
const MODE_TABS: { id: TodayMode; label: string }[] = [
  { id: 'prepare', label: 'Prepare' },
  { id: 'onroute', label: 'On route' },
];

export function TodayScreen({ onNavigate }: { onNavigate: Navigate }) {
  const { currentStage, stages, routeDirection } = useStore();

  // Manual mode only — remembered per device (non-versioned UI preference,
  // see utils/todayMode.mjs), never switched by dates, GPS or trip phase.
  const [mode, setMode] = useState<TodayMode>(() => readTodayMode(window.localStorage));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectMode = (next: TodayMode) => {
    setMode(next);
    saveTodayMode(window.localStorage, next);
  };
  // Horizontal tablist keyboard support: arrows move focus AND selection
  // (selection follows focus — the standard segmented-tabs pattern), with a
  // roving tabindex so the control is one Tab stop.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = MODE_TABS.findIndex((t) => t.id === mode);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (current + 1) % MODE_TABS.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + MODE_TABS.length) % MODE_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODE_TABS.length - 1;
    if (next === null || next === current) return;
    e.preventDefault();
    selectMode(MODE_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  // Static, priority-capped stage metadata (max four) — deterministic and
  // offline; no GPS, network or time-of-day input. Direction-aware: the
  // climb/descent chips reflect the way this physical segment is walked.
  const highlights = currentStage
    ? stageHighlights(currentStage.id, undefined, routeDirection)
    : [];
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
  // Same source and priority order as the collapsed Stop cards; absences are
  // already excluded by collapsedFacilities, so "No shop" stays a separate
  // warning and never appears as a normal facility icon.
  const nextStopFacilities = nextStop ? collapsedFacilities(nextStop, 5) : [];
  const facilityLabels = nextStopFacilities.map((f) => f.label);
  const facilitySentence =
    facilityLabels.length > 0
      ? ` Facilities include ${
          facilityLabels.length > 1
            ? `${facilityLabels.slice(0, -1).join(', ')} and ${facilityLabels[facilityLabels.length - 1]}`
            : facilityLabels[0]
        }.`
      : '';

  return (
    <div className="screen today-screen">
      {/* Decorative contour layer: behind everything, unmounts with this
          screen. Base colour and sizing live in CSS on the same element. */}
      <div
        className="today-bg"
        aria-hidden
        style={{ '--today-bg-image': `url("${TODAY_BG_SRC}")` } as CSSProperties}
      />

      {/* Prepare | On route lives IN the title row as the header accessory —
          a compact capsule of semantic tabs (never an on/off switch). Both
          modes stay available at all times; no separate selector row. */}
      <ScreenHeader
        eyebrow="Kungsleden"
        title="Today"
        action={
          <div
            className="today-mode"
            role="tablist"
            aria-label="Today view"
            onKeyDown={onTablistKeyDown}
          >
            {MODE_TABS.map((t, i) => (
              <button
                key={t.id}
                id={`today-tab-${t.id}`}
                role="tab"
                aria-selected={mode === t.id}
                aria-controls={`today-panel-${t.id}`}
                tabIndex={mode === t.id ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className="today-mode__tab"
                onClick={() => selectMode(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {mode === 'prepare'
          ? 'Your trip preparation at a glance.'
          : 'Your day at a glance. Everything here works offline.'}
      </ScreenHeader>

      {mode === 'prepare' ? (
        <div
          role="tabpanel"
          id="today-panel-prepare"
          aria-labelledby="today-tab-prepare"
        >
          <TodayPrepare onNavigate={onNavigate} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="today-panel-onroute"
          aria-labelledby="today-tab-onroute"
        >
          {currentStage && from && to ? (
        <>
          {/* A. Hero: the stage block (spruce anchor). Fixed responsibility
              (docs/design-reviews/2026-07-v0.18-today-stage-block-direction.md):
              today's stage, its essential characteristics, and the two
              follow-up actions — nothing else grows in here. */}
          <section className="hero" aria-label={`Current stage, day ${currentStage.day}`}>
            <HeroSilhouette profile={currentStage.elevationProfile} />
            <div className="hero-content">
              <span className="hero-day">Day {currentStage.day} of {stages.length}</span>
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
                <span>{formatHoursEstimate(currentStage.estimatedHours)}</span>
              </div>
              {highlights.length > 0 ? (
                // Static stage metadata, not controls (pill = metadata is the
                // established convention, see the Stages stat pills). No
                // heading on purpose — deliberate vertical-space decision in
                // the review direction. Nothing renders when a stage has no
                // highlights: no empty placeholder row.
                <ul className="hero-chips" aria-label="Stage characteristics">
                  {highlights.map((h) => {
                    const HighlightIcon = HIGHLIGHT_ICONS[h.icon];
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
                {/* Stage Guide = primary information depth; View Route = the
                    complementary spatial action. The mapStageId payload is the
                    ONLY thing that overwrites the remembered in-session Map
                    browse state (see App.tsx). */}
                <button
                  className="hero-action hero-action--primary"
                  onClick={() => onNavigate('stages', { guideStageId: currentStage.id })}
                  aria-label="Stage Guide — open today’s full day guide in Stages"
                >
                  <BookOpen size={15} strokeWidth={2} aria-hidden /> Stage Guide
                </button>
                <button
                  className="hero-action"
                  onClick={() => onNavigate('map', { mapStageId: currentStage.id })}
                  aria-label="View Route — show today’s stage on the map"
                >
                  <Route size={15} strokeWidth={2} aria-hidden /> View Route
                </button>
              </div>
            </div>
          </section>

          {/* B. Journey progress */}
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
              <span>{stopShortName(STOPS_BY_ID[stages[0].fromHutId])}</span>
              <span>{stopShortName(STOPS_BY_ID[stages[stages.length - 1].toHutId])}</span>
            </div>
          </section>

          {/* C. Tonight's stop — compact navigation card. When an STF
              membership document is explicitly marked for Today (and its file
              is locally available), a compact quick-access action shares this
              row; otherwise Tonight keeps the full width on its own. Two
              SIBLING interactive cards — never nested. */}
          {nextStop ? (
            <div className="tonight-row">
            <button
              className="today-action-card today-glass today-glass--light"
              onClick={() => onNavigate('huts', { stopId: nextStop.id })}
              aria-label={`Tonight: ${stopShortName(nextStop)}${
                nextStopElevation != null ? `, ${nextStopElevation} metres elevation` : ''
              }${nextStopNoShop ? ', no shop' : ''}.${facilitySentence} Opens stop details in Stops.`}
            >
              <span className="today-action-card__body">
                <span className="today-action-card__label">Tonight</span>
                <span className="today-action-card__title">{stopShortName(nextStop)}</span>
                {nextStopFacilities.length > 0 || nextStopNoShop ? (
                  // Informational preview only; facilities are announced via
                  // the button's aria-label, so the row is hidden from SRs to
                  // avoid repetitive output. Titles remain for pointer users.
                  <span className="today-stop-facilities" aria-hidden>
                    {nextStopFacilities.map((f) => (
                      <span key={f.id} className="today-stop-facility" title={f.label}>
                        <FacilityIcon id={f.id} size={15} />
                      </span>
                    ))}
                    {nextStopNoShop ? (
                      <span className="today-stop-warning" title="No shop at this stop">
                        <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No shop
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="today-action-card__side">
                {nextStopElevation != null ? (
                  <span className="today-action-card__value tnum">
                    <Mountain size={13} strokeWidth={2} aria-hidden />
                    {nextStopElevation.toLocaleString('en-US')} m
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
            <MembershipQuickAccess />
            </div>
          ) : null}

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
      )}
    </div>
  );
}
