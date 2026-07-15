import { useState } from 'react';
import {
  ArrowRight,
  Binoculars,
  ChevronDown,
  ChevronLeft,
  Info,
  Leaf,
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
  RouteExperience,
} from '../types';
import {
  PLANNING_FIT_LABEL,
  experiencesForStage,
  groupForDisplay,
  isInlineExperience,
  isPlanningCost,
} from '../data/routeExperiences';
import { formatVerifiedDate } from '../utils/format';

/**
 * The "Along the way" experience layer for a stage (see
 * docs/proposals/explore-more.md). Anchored to Stages, kept quiet and
 * progressive: on-route sights expand inline to a sentence; detours and larger
 * options open a scale-aware detail view. Category is carried by icon + label
 * only — never colour, so the semantic palette is untouched.
 *
 * Component boundaries are intentionally clean so the section could later move
 * inside the Day Guide (Option B) with minimal refactoring: `ExperienceList`
 * takes only a stageId + an onOpenDetail callback, and owns no stage-card markup.
 */

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

/** Difficulty as filled pips — severity encoded in FORM, not colour. */
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

function PlanningFitTag({ experience }: { experience: RouteExperience }) {
  const plan = isPlanningCost(experience.planningFit);
  return (
    <span className={`exp-fit ${plan ? 'exp-fit--plan' : ''}`}>
      {PLANNING_FIT_LABEL[experience.planningFit]}
    </span>
  );
}

/**
 * One experience row. On-route sights expand inline (chevron) to a one-line
 * "why notice"; everything larger opens a detail view (arrow). The trailing
 * icon tells the user the outcome before they tap.
 */
function ExperienceRow({
  experience,
  onOpenDetail,
}: {
  experience: RouteExperience;
  onOpenDetail: (experience: RouteExperience) => void;
}) {
  const Icon = TYPE_ICON[experience.type];
  const inline = isInlineExperience(experience.scale);
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
            <PlanningFitTag experience={experience} />
            {experience.difficulty ? (
              <>
                <span className="exp-sep" aria-hidden />
                <DifficultyPips difficulty={experience.difficulty} />
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
        <p id={noteId} className="exp-note">
          {experience.whyNotice}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The list under the "Along the way" disclosure. Groups by rising commitment
 * (On the route → Short detours → Larger options) only when there is enough to
 * warrant headers; a short list stays flat.
 */
export function ExperienceList({
  stageId,
  onOpenDetail,
}: {
  stageId: string;
  onOpenDetail: (experience: RouteExperience) => void;
}) {
  const experiences = experiencesForStage(stageId);
  if (experiences.length === 0) return null;

  // Flat when short; grouped by rising commitment once it earns headers.
  // The flat/grouped decision and ordering live in the tested pure model.
  const display = groupForDisplay(experiences);
  if (!display.grouped) {
    return (
      <div className="exp-list">
        {display.items.map((x) => (
          <ExperienceRow key={x.id} experience={x} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    );
  }

  return (
    <div className="exp-list">
      {display.groups.map((g) => (
        <div key={g.group} className="exp-group">
          <span className="exp-group__label">{g.label}</span>
          {g.items.map((x) => (
            <ExperienceRow key={x.id} experience={x} onOpenDetail={onOpenDetail} />
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

/**
 * Scale-aware detail. Small detours get a light layout; a `major-adventure`
 * carries the bordered "Before you commit" expedition block (guide, equipment,
 * turnaround, warnings) — a summit must never read like a casual recommendation.
 */
export function ExperienceDetail({
  experience,
  onBack,
}: {
  experience: RouteExperience;
  onBack: () => void;
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
        <span className="tnum">~{experience.roundTripKm}</span>{' '}
        <small>km</small>
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

      {experience.routeRelationship ? (
        <p className="exp-anchor">{experience.routeRelationship}</p>
      ) : null}

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

      <p className="exp-verified">
        Source: {experience.source.label} · verified{' '}
        {formatVerifiedDate(experience.source.lastVerified)} · confidence:{' '}
        {experience.confidence}
      </p>
    </div>
  );
}
