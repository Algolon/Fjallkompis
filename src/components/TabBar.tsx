import {
  IconToday,
  IconMap,
  IconStages,
  IconHuts,
  IconChecklist,
  IconSettings,
} from './Icons';

export type TabId =
  | 'today'
  | 'map'
  | 'stages'
  | 'huts'
  | 'checklist'
  | 'settings';

const TABS: { id: TabId; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: 'today', label: 'Today', Icon: IconToday },
  { id: 'map', label: 'Map', Icon: IconMap },
  { id: 'stages', label: 'Stages', Icon: IconStages },
  // Internal ids 'huts' / 'checklist' are kept: persisted state and screen
  // wiring reference them, only the user-facing labels changed.
  { id: 'huts', label: 'Stops', Icon: IconHuts },
  { id: 'checklist', label: 'Lists', Icon: IconChecklist },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className="tab"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {/* Pill wraps icon + label so the active tab reads as one chip —
              legible from shape + fill, not colour alone. */}
          <span className="tab-pill">
            <Icon className="ic" />
            <span className="tab-label">{label}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
