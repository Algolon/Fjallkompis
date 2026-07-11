import {
  IconToday,
  IconMap,
  IconStages,
  IconHuts,
  IconLists,
  IconSettings,
} from './Icons';
import { TAB_ROUTES } from '../navigation/routes.mjs';

export type TabId =
  | 'today'
  | 'map'
  | 'stages'
  | 'huts'
  | 'checklist'
  | 'settings';

// Destination order and labels come from the shared route table
// (src/navigation/routes.mjs) so the bottom tab bar, the tablet rail and the
// desktop sidebar can never drift apart — they are all this one component,
// restyled by CSS at wider breakpoints (see "Adaptive navigation" in
// global.css). Internal ids 'huts' / 'checklist' are historical and kept:
// screen wiring references them, only the user-facing labels changed
// ('checklist' is the Lists destination — the packing list).
const TAB_ICONS: Record<TabId, (p: { className?: string }) => JSX.Element> = {
  today: IconToday,
  map: IconMap,
  stages: IconStages,
  huts: IconHuts,
  checklist: IconLists,
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
