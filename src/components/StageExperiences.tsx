import { useState } from 'react';
import {
  ArrowRight,
  Binoculars,
  ChevronDown,
  ChevronLeft,
  Info,
  Leaf,
  MapPin,
  Mountain,
  ShieldAlert,
  Tent,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type {
  ExperienceDifficulty,
  ExperienceType,
  RouteDirection,
  RouteExperience,
} from '../types';
import {
  ACCESS_LABEL,
  PLANNING_FIT_LABEL,
  canViewOnMap,
  experienceCountForStage,
  isBasecamp,
  isInlineExperience,
  isPlanningCost,
  provenanceLevel,
  stageExperienceSections,
} from '../data/routeExperiences';
import { formatVerifiedDate } from '../utils/format';

/**
 * The "Along the way" experience layer for a stage (docs/proposals/explore-more.md).
 * Anchored to Stages, quiet and progressive:
 *  - list ORDER follows the physical journey (position along the segment,
 *    direction-aware); basecamp trips are a separate trailing group;
 *  - on-route sights that fit inline expand to a sentence; items with real
 *    planning/safety depth open a detail view (content-depth rule, not scale);
 *  - category is icon + label only (never colour); difficulty pips appear only
 *    where a detour makes effort a genuine choice.
 * Component boundaries stay clean so the section can move inside the Day Guide
 * (Option B) with minimal change. `onViewOnMap` is a one-shot deep-link to Map.
 */

export type ViewOnMap = (experience: RouteExperience) => void;

const TYPE_ICON: Record<ExperienceType, LucideIcon> = {
  viewpoint: Binoculars,
  water: Waves,
  landform: Mountain,
  nature: Leaf,
  culture: Tent,
};

const DIFFICULTY_LABEL: Record<ExperienceDifficulty, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  alpine: 'Alpine',
};
const DIFFICULTY_LEVEL: Record<ExperienceDifficulty, number> = {
  easy: 1,
  moderate: 2,
  hard: 3,
  alpine: 4,
};

/** Difficulty is a real choice only for a detour/side-route/basecamp trip; an
 *  on-trail sight shares the stage's own difficulty, so we don't repeat it. */
function difficultyMatters(experience: RouteExperience): boolean {
  const a = experience.location.access;
  return (
    experience.difficulty != null &&
    (a === 'short-detour' || a === 'side-route' || a === 'basecamp-trip')
  );
}

function DifficultyPips({ difficulty }: { difficulty: ExperienceDifficulty }) {
  const level = DIFFICULTY_LEVEL[difficulty];
  return (
    <span className="exp-diff">
      {DIFFICULTY_LABEL[difficulty]}
      <span className="exp-pips" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= level ? 'on' : ''} />
        ))}
      </span>
    </span>
  );
}

/** One experience row. Inline items expand to a sentence (+ View on map);
 *  detail items open a scale-aware view. The trailing icon signals which. */
function ExperienceRow({
  experience,
  onOpenDetail,
  onViewOnMap,
}: {
  experience: RouteExperience;
  onOpenDetail: (experience: RouteExperience) => void;
  onViewOnMap: ViewOnMap;
}) {
  const Icon = TYPE_ICON[experience.type];
  const inline = isInlineExperience(experience);
  const timeCost = isPlanningCost(experience.planningFit);
  const [open, setOpen] = useState(false);
  const noteId = `exp-note-${experience.id}`;

  return (
    <div className={`exp-row ${inline && open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="exp-row__btn"
        aria-expanded={inline ? open : undefined}
        aria-controls={inline ? noteId : undefined}
        onClick={() => (inline ? setOpen((o) => !o) : onOpenDetail(experience))}
      >
        <span className="exp-glyph" aria-hidden>
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span className="exp-main">
          <span className="exp-title">{experience.title}</span>
          <span className="exp-sub">
            {timeCost ? (
              <span className="exp-fit exp-fit--plan">
                {PLANNING_FIT_LABEL[experience.planningFit]}
              </span>
            ) : (
              <span className="exp-access">{ACCESS_LABEL[experience.location.access]}</span>
            )}
            {difficultyMatters(experience) ? (
              <>
                <span className="exp-sep" aria-hidden />
                <DifficultyPips difficulty={experience.difficulty!} />
              </>
            ) : null}
          </span>
        </span>
        {inline ? (
          <ChevronDown className="exp-go exp-chev" size={18} strokeWidth={2} aria-hidden />
        ) : (
          <ArrowRight className="exp-go" size={18} strokeWidth={2} aria-hidden />
        )}
      </button>
      {inline && open ? (
        <div id={noteId} className="exp-note">
          <p>{experience.whyNotice}</p>
          {/* View on map only when the Map has VERIFIED geometry for this item;
              off until real spatial data is supplied (never derived from an
              editorial position). */}
          {canViewOnMap(experience) ? (
            <button
              type="button"
              className="exp-maplink"
              onClick={() => onViewOnMap(experience)}
            >
              <MapPin size={14} strokeWidth={1.9} aria-hidden /> View on map
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The list under the disclosure — ordered sections from the pure model. */
export function ExperienceList({
  stageId,
  direction,
  onOpenDetail,
  onViewOnMap,
}: {
  stageId: string;
  direction: RouteDirection;
  onOpenDetail: (experience: RouteExperience) => void;
  onViewOnMap: ViewOnMap;
}) {
  const sections = stageExperienceSections(stageId, direction);
  if (sections.length === 0) return null;
  return (
    <div className="exp-list">
      {sections.map((s) => (
        <div key={s.key} className={`exp-group ${s.larger ? 'exp-group--larger' : ''}`}>
          {s.label ? <span className="exp-group__label">{s.label}</span> : null}
          {s.items.map((x) => (
            <ExperienceRow
              key={x.id}
              experience={x}
              onOpenDetail={onOpenDetail}
              onViewOnMap={onViewOnMap}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Stat({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

/** The derived spatial line for the detail header (from `access`, or an override). */
function spatialLine(experience: RouteExperience): string {
  if (experience.routeRelationship) return experience.routeRelationship;
  return ACCESS_LABEL[experience.location.access];
}

/** Source/verification, shown per the progressive-provenance level. */
function Provenance({ experience }: { experience: RouteExperience }) {
  const level = provenanceLevel(experience);
  if (level === 'hidden') return null;
  const line = (
    <>
      Source: {experience.source.label} · verified{' '}
      {formatVerifiedDate(experience.source.lastVerified)} · confidence:{' '}
      {experience.confidence}
    </>
  );
  if (level === 'optional') {
    return (
      <details className="exp-source">
        <summary>Source</summary>
        <p className="exp-verified">{line}</p>
      </details>
    );
  }
  return <p className="exp-verified">{line}</p>;
}

/** Scale-aware detail. Major adventures carry the "Before you commit" block. */
export function ExperienceDetail({
  experience,
  onBack,
  onViewOnMap,
}: {
  experience: RouteExperience;
  onBack: () => void;
  onViewOnMap: ViewOnMap;
}) {
  const Icon = TYPE_ICON[experience.type];
  const { expedition } = experience;
  const stats: React.ReactNode[] = [];
  if (experience.difficulty) {
    stats.push(
      <Stat k="Difficulty" key="d">
        <DifficultyPips difficulty={experience.difficulty} />
      </Stat>,
    );
  }
  if (experience.roundTripKm != null) {
    stats.push(
      <Stat k="Round trip" key="rt">
        <span className="tnum">~{experience.roundTripKm}</span> <small>km</small>
      </Stat>,
    );
  }
  if (experience.elevationGainM != null) {
    stats.push(
      <Stat k="Ascent" key="asc">
        <span className="tnum">~{experience.elevationGainM}</span> <small>m</small>
      </Stat>,
    );
  }
  if (experience.addedTimeText) {
    stats.push(
      <Stat k="Added time" key="t">
        <span className="tnum">{experience.addedTimeText}</span>
      </Stat>,
    );
  }

  return (
    <div className="exp-detail">
      <div className="exp-detail__top">
        <button type="button" className="exp-back" onClick={onBack}>
          <ChevronLeft size={17} strokeWidth={2} aria-hidden /> Along the way
        </button>
      </div>

      <div className="exp-detail__head">
        <span className="exp-glyph exp-glyph--lg" aria-hidden>
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <h1 className="exp-detail__title">{experience.title}</h1>
      </div>

      <p className="exp-anchor">{spatialLine(experience)}</p>

      {stats.length > 0 ? (
        <div className={`stat-grid ${stats.length % 2 === 1 ? 'is-odd' : ''}`}>
          {stats}
        </div>
      ) : null}

      <div className="banner-info">
        <Info size={16} strokeWidth={1.9} aria-hidden />
        <span>
          <strong>{PLANNING_FIT_LABEL[experience.planningFit]}</strong>
          {experience.weatherSensitivity === 'high'
            ? ' — weather-dependent. Feasibility also depends on daylight, pace and fatigue.'
            : '.'}
        </span>
      </div>

      <div className="exp-section">
        <span className="section-label">Why it’s worth it</span>
        <p>{experience.description ?? experience.whyNotice}</p>
      </div>

      {expedition ? (
        <div className="exp-expedition">
          <div className="exp-expedition__hd">
            <ShieldAlert size={15} strokeWidth={1.9} aria-hidden /> Before you commit
          </div>
          <div className="exp-expedition__bd">
            {expedition.warnings?.map((w) => (
              <div className="banner-warn" key={w}>
                <TriangleAlert size={16} strokeWidth={1.9} aria-hidden />
                <span>{w}</span>
              </div>
            ))}
            <dl className="exp-kv">
              {expedition.turnaroundAdvice ? (
                <>
                  <dt>Turnaround</dt>
                  <dd>{expedition.turnaroundAdvice}</dd>
                </>
              ) : null}
              {expedition.equipment && expedition.equipment.length > 0 ? (
                <>
                  <dt>Equipment</dt>
                  <dd>{expedition.equipment.join(' · ')}</dd>
                </>
              ) : null}
              {expedition.season ? (
                <>
                  <dt>Season</dt>
                  <dd>{expedition.season}</dd>
                </>
              ) : null}
              {expedition.guide?.recommended ? (
                <>
                  <dt>Guide</dt>
                  <dd>Recommended{expedition.guide.note ? ` — ${expedition.guide.note}` : ''}</dd>
                </>
              ) : null}
            </dl>
            <div className="banner-info">
              <Info size={16} strokeWidth={1.9} aria-hidden />
              <span>
                Informational support only — not a substitute for a current weather
                check or a guide’s judgement on the day.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="detail-actions">
        <button
          type="button"
          className="btn btn-glacier"
          onClick={() => onViewOnMap(experience)}
        >
          <MapPin size={16} strokeWidth={1.9} aria-hidden /> View on map
        </button>
      </div>

      <Provenance experience={experience} />
    </div>
  );
}

export { experienceCountForStage, isBasecamp };
