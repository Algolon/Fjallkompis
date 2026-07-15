import { useState } from 'react';
import {
  Bird,
  Binoculars,
  ChevronDown,
  Gem,
  Info,
  Leaf,
  MapPin,
  Milestone,
  Mountain,
  MountainSnow,
  ShieldAlert,
  Snowflake,
  Tent,
  Trees,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type {
  ExperienceDifficulty,
  ExperienceIconKey,
  ExperienceRouteShape,
  ExperienceType,
  RouteDirection,
  RouteExperience,
} from '../types';
import {
  ACCESS_LABEL,
  canViewOnMap,
  experienceCountForStage,
  isBasecamp,
  isRouteWide,
  journeyPositionLabel,
  provenanceLevel,
  stageHighlightsAndDetours,
} from '../data/routeExperiences';
import { formatVerifiedDate } from '../utils/format';

/**
 * The "Highlights & detours" experience layer for a stage
 * (docs/proposals/highlights-and-detours.md). One combined disclosure with two
 * internal sections, both derived from the pure model:
 *  - HIGHLIGHTS — things met while following the normal route; compact icon rows
 *    that expand to a sentence (a View-on-map link only where the Map genuinely
 *    adds something — never for a route-wide observation);
 *  - DETOURS — options that leave the route; inline expandable cards whose
 *    collapsed state shows the decision facts (difficulty · distance · time), and
 *    whose expanded state carries the description, route shape, any "before you
 *    commit" safety block and a View-on-map action where verified geometry exists.
 * No separate detail page and no modal — the reader stays inside the Stage
 * accordion and can compare several detours in place. Icon treatment is one
 * restrained semantic glyph; category is never encoded in colour.
 */

export type ViewOnMap = (experience: RouteExperience) => void;

/** WHAT-it-is → default glyph. Overridden by an explicit `icon` where finer. */
const TYPE_ICON: Record<ExperienceType, LucideIcon> = {
  viewpoint: Binoculars,
  water: Waves,
  landform: Mountain,
  nature: Leaf,
  culture: Tent,
};

/** Specific icon key → glyph (a bridge/lake/pass reads better than its `type`). */
const ICON_BY_KEY: Record<ExperienceIconKey, LucideIcon> = {
  bridge: Milestone,
  lake: Waves,
  river: Waves,
  wildlife: Bird,
  forest: Trees,
  pass: MountainSnow,
  glacier: Snowflake,
  geology: Gem,
  valley: Mountain,
  viewpoint: Binoculars,
  summit: MountainSnow,
  culture: Tent,
};

function glyphFor(experience: RouteExperience): LucideIcon {
  return experience.icon ? ICON_BY_KEY[experience.icon] : TYPE_ICON[experience.type];
}

const DIFFICULTY_LABEL: Record<ExperienceDifficulty, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  alpine: 'Alpine',
};

const ROUTE_SHAPE_LABEL: Record<ExperienceRouteShape, string> = {
  'out-and-back': 'Out-and-back',
  loop: 'Loop',
  'one-way': 'One-way',
};

/** Short planning token for the collapsed Detour meta line (only committing ones). */
const PLANNING_SHORT: Partial<Record<RouteExperience['planningFit'], string>> = {
  'shorter-hiking-day': 'Shorter day',
  'best-from-overnight': 'From an overnight',
  'extra-day-recommended': 'Extra day',
  'separate-day-required': 'Separate day',
};

/** The Highlight's short route relationship (route-wide → "Along this stage"). */
function relationshipLabel(experience: RouteExperience): string {
  if (isRouteWide(experience) && experience.location.access === 'on-trail') {
    return 'Along this stage';
  }
  return ACCESS_LABEL[experience.location.access];
}

/** "1.2" from 1.23 — one decimal, no trailing zeros beyond it. */
function km(value: number): string {
  return value.toFixed(1);
}

// ── Highlights ───────────────────────────────────────────────────────────────

/** One compact Highlight row: icon + title + relationship/position; expands to a
 *  sentence. Kept close to the density of a plain guide list. */
function HighlightRow({
  experience,
  direction,
  onViewOnMap,
}: {
  experience: RouteExperience;
  direction: RouteDirection;
  onViewOnMap: ViewOnMap;
}) {
  const Icon = glyphFor(experience);
  const [open, setOpen] = useState(false);
  const noteId = `hl-note-${experience.id}`;
  const position = journeyPositionLabel(experience, direction);
  const mappable = canViewOnMap(experience);

  return (
    <div className={`hl-row ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="hl-row__btn"
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hl-glyph" aria-hidden>
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <span className="hl-main">
          <span className="hl-title">{experience.title}</span>
          <span className="hl-meta">
            <span className="hl-rel">{relationshipLabel(experience)}</span>
            {position ? (
              <>
                <span className="hl-sep" aria-hidden />
                <span className="hl-pos">{position}</span>
              </>
            ) : null}
          </span>
        </span>
        <ChevronDown className="hl-chev" size={17} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div id={noteId} className="hl-note">
          <p>{experience.whyNotice}</p>
          {mappable ? (
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

// ── Detours ──────────────────────────────────────────────────────────────────

function DifficultyLabel({ difficulty }: { difficulty: ExperienceDifficulty }) {
  return <span className="dt-diff">{DIFFICULTY_LABEL[difficulty]}</span>;
}

/** Source/verification, shown per the progressive-provenance level (never the
 *  internal spatial fields — only a hiker-facing source line). */
function Provenance({ experience }: { experience: RouteExperience }) {
  const level = provenanceLevel(experience);
  if (level === 'hidden') return null;
  const line = (
    <>
      Source: {experience.source.label} · verified{' '}
      {formatVerifiedDate(experience.source.lastVerified)}
    </>
  );
  if (level === 'optional') {
    return (
      <details className="dt-source">
        <summary>Source</summary>
        <p className="dt-verified">{line}</p>
      </details>
    );
  }
  return <p className="dt-verified">{line}</p>;
}

/** The "before you commit" safety block — present only for a major adventure. */
function ExpeditionBlock({ experience }: { experience: RouteExperience }) {
  const { expedition } = experience;
  if (!expedition) return null;
  return (
    <div className="dt-expedition">
      <div className="dt-expedition__hd">
        <ShieldAlert size={15} strokeWidth={1.9} aria-hidden /> Before you commit
      </div>
      <div className="dt-expedition__bd">
        {expedition.warnings?.map((w) => (
          <div className="banner-warn" key={w}>
            <TriangleAlert size={16} strokeWidth={1.9} aria-hidden />
            <span>{w}</span>
          </div>
        ))}
        <dl className="dt-kv">
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
  );
}

/** One inline Detour card. Collapsed shows the decision facts; expanded carries
 *  the description, route shape, any safety block and a View-on-map action. */
function DetourCard({
  experience,
  onViewOnMap,
}: {
  experience: RouteExperience;
  onViewOnMap: ViewOnMap;
}) {
  const Icon = glyphFor(experience);
  const [open, setOpen] = useState(false);
  const bodyId = `dt-body-${experience.id}`;

  const meta: React.ReactNode[] = [];
  if (experience.difficulty) {
    meta.push(<DifficultyLabel key="d" difficulty={experience.difficulty} />);
  }
  if (experience.roundTripKm != null) {
    meta.push(<span key="km">{km(experience.roundTripKm)} km return</span>);
  } else if (experience.detourDistanceKm != null) {
    meta.push(<span key="km">{km(experience.detourDistanceKm)} km</span>);
  }
  if (experience.addedTimeText) {
    meta.push(<span key="t">{experience.addedTimeText}</span>);
  } else {
    const plan = PLANNING_SHORT[experience.planningFit];
    if (plan) meta.push(<span key="p">{plan}</span>);
  }

  const mappable = canViewOnMap(experience);
  const weatherDependent =
    experience.weatherSensitivity === 'high' && !experience.expedition;

  return (
    <div className={`dt-card ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="dt-card__btn"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dt-glyph" aria-hidden>
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <span className="dt-main">
          <span className="dt-title">{experience.title}</span>
          <span className="dt-meta">
            {meta.map((node, i) => (
              <span className="dt-meta__part" key={i}>
                {i > 0 ? <span className="dt-dot" aria-hidden>·</span> : null}
                {node}
              </span>
            ))}
          </span>
        </span>
        <ChevronDown className="dt-chev" size={18} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div id={bodyId} className="dt-body">
          <p className="dt-why">{experience.whyNotice}</p>
          {experience.description ? (
            <p className="dt-desc">{experience.description}</p>
          ) : null}
          {experience.routeShape || weatherDependent ? (
            <dl className="dt-facts">
              {experience.routeShape ? (
                <>
                  <dt>Route</dt>
                  <dd>{ROUTE_SHAPE_LABEL[experience.routeShape]}</dd>
                </>
              ) : null}
              {weatherDependent ? (
                <>
                  <dt>Weather</dt>
                  <dd>Visibility depends on the weather</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <ExpeditionBlock experience={experience} />
          {mappable ? (
            <button
              type="button"
              className="exp-maplink"
              onClick={() => onViewOnMap(experience)}
            >
              <MapPin size={14} strokeWidth={1.9} aria-hidden /> View on map
            </button>
          ) : null}
          <Provenance experience={experience} />
        </div>
      ) : null}
    </div>
  );
}

// ── The combined section ─────────────────────────────────────────────────────

/**
 * The two internal sections under the "Highlights & detours" disclosure. Each
 * subsection renders only when it has items; basecamp trips are grouped last,
 * under a quiet label. Returns null if the stage has nothing.
 */
export function HighlightsAndDetours({
  stageId,
  direction,
  onViewOnMap,
}: {
  stageId: string;
  direction: RouteDirection;
  onViewOnMap: ViewOnMap;
}) {
  const { highlights, detours, basecamp } = stageHighlightsAndDetours(stageId, direction);
  if (highlights.length === 0 && detours.length === 0) return null;
  const routeDetours = detours.filter((d) => !isBasecamp(d));

  return (
    <div className="hd-list">
      {highlights.length > 0 ? (
        <section className="hd-section" aria-label="Highlights">
          <h3 className="hd-subhead">
            Highlights <span className="hd-count">· {highlights.length}</span>
          </h3>
          <div className="hl-group">
            {highlights.map((x) => (
              <HighlightRow
                key={x.id}
                experience={x}
                direction={direction}
                onViewOnMap={onViewOnMap}
              />
            ))}
          </div>
        </section>
      ) : null}

      {detours.length > 0 ? (
        <section className="hd-section" aria-label="Detours">
          <h3 className="hd-subhead">
            Detours <span className="hd-count">· {detours.length}</span>
          </h3>
          <div className="dt-group">
            {routeDetours.map((x) => (
              <DetourCard key={x.id} experience={x} onViewOnMap={onViewOnMap} />
            ))}
          </div>
          {basecamp.length > 0 ? (
            <div className="dt-basecamp">
              <span className="dt-basecamp__label">From the mountain station</span>
              <div className="dt-group">
                {basecamp.map((x) => (
                  <DetourCard key={x.id} experience={x} onViewOnMap={onViewOnMap} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export { experienceCountForStage, isBasecamp };
