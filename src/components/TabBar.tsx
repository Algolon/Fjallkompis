import {
  IconToday,
  IconMap,
  IconJournal,
  IconLists,
  IconSettings,
} from './Icons';
import { TAB_ROUTES } from '../navigation/routes.mjs';

/** The five vNext primary destinations: Today, Map, Guide, Plan, Settings. */
export type TabId = 'today' | 'map' | 'guide' | 'plan' | 'settings';

/** Guide's dossier sections (see navigation/routes.mjs GUIDE_SECTIONS). */
export type GuideSection = 'stages' | 'stops' | 'shops' | 'transport';
/** Plan's personal sections (see navigation/routes.mjs PLAN_SECTIONS). */
export type PlanSection = 'day' | 'packing' | 'travel' | 'wallet';
export type SectionId = GuideSection | PlanSection;

/**
 * Historical navigate() targets still used by screen wiring ('checklist' is
 * the retired Lists destination). They are call-site vocabulary only — never
 * tabs, never URLs; navigation/resolveNavTarget.mjs maps each onto its
 * five-tab destination, so no call site had to be rewritten.
 */
export type LegacyNavTarget = 'stages' | 'huts' | 'checklist';
export type NavTarget = TabId | LegacyNavTarget;

// Destination order and labels come from the shared route table
// (src/navigation/routes.mjs) so the bottom tab bar, the tablet rail and the
// desktop sidebar can never drift apart — they are all this one component,
// restyled by CSS at wider breakpoints (see "Adaptive navigation" in
// global.css). Guide reuses the journal/book glyph (the dossier), Plan the
// checklist glyph (personal preparation) — existing icons, no new set.
const TAB_ICONS: Record<TabId, (p: { className?: string }) => JSX.Element> = {
  today: IconToday,
  map: IconMap,
  guide: IconJournal,
  plan: IconLists,
  settings: IconSettings,
};

export function TabBar({
  active,
  onChange,
  variant = 'bar',
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  /**
   * Which shell slot this instance fills. The app renders BOTH: 'rail'
   * before <main> (shown ≥760px×500px, so keyboard focus reaches the
   * left-hand navigation before the content, matching the visual order)
   * and 'bar' after <main> (the compact bottom bar, same position in the
   * focus order as production mobile). CSS displays exactly one at a time;
   * the display:none instance is out of layout, tab order and the
   * accessibility tree, so there is never a duplicate primary navigation.
   */
  variant?: 'bar' | 'rail';
}) {
  return (
    <nav className={`tabbar tabbar--${variant}`} aria-label="Primary">
      {/* EQUAL GEOMETRY, ALL FIVE. There is no per-destination branch here,
          and that is the contract: every tab renders the identical element
          tree, so no destination can acquire exceptional size, offset or
          elevation without changing this map for all of them.

          Today used to render an extra elevated disc in the bottom bar. It
          was removed because it failed at the two things a tab bar must do.
          It was present whether or not Today was selected, so a bright 54px
          circle out-shouted whichever tab actually WAS current; and it cost
          geometry — the disc pushed Today's label 10px below its four
          siblings, leaving 1px of clearance at 375x812 and landing exactly on
          the system-navigation seam under Samsung's 3-button navigation.
          Today keeps its primacy the honest way: centre position, the default
          destination, the operational home. */}
      {TAB_ROUTES.map(({ tab, label }) => {
        const Icon = TAB_ICONS[tab];
        return (
          <button
            key={tab}
            className="tab"
            aria-current={active === tab ? 'page' : undefined}
            onClick={() => onChange(tab)}
          >
            {/* Pill wraps icon + label so the active tab reads as one chip —
                legible from shape + fill, not colour alone. */}
            <span className="tab-pill">
              <Icon className="ic" />
              <span className="tab-label">{label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
