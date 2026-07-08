import {
  IconToday,
  IconMap,
  IconStages,
  IconHuts,
  IconChecklist,
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
// global.css). Internal ids 'huts' / 'checklist' are kept: persisted state
// and screen wiring reference them, only the user-facing labels changed.
const TAB_ICONS: Record<TabId, (p: { className?: string }) => JSX.Element> = {
  today: IconToday,
  map: IconMap,
  stages: IconStages,
  huts: IconHuts,
  checklist: IconChecklist,
  settings: IconSettings,
};

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="tabbar" aria-label="Primary">
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
