import {
  IconToday,
  IconMap,
  IconStages,
  IconHuts,
  IconChecklist,
  IconJournal,
  IconSettings,
} from './Icons';

export type TabId =
  | 'today'
  | 'map'
  | 'stages'
  | 'huts'
  | 'checklist'
  | 'journal'
  | 'settings';

const TABS: { id: TabId; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: 'today', label: 'Today', Icon: IconToday },
  { id: 'map', label: 'Map', Icon: IconMap },
  { id: 'stages', label: 'Stages', Icon: IconStages },
  { id: 'huts', label: 'Huts', Icon: IconHuts },
  { id: 'checklist', label: 'List', Icon: IconChecklist },
  { id: 'journal', label: 'Journal', Icon: IconJournal },
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
          aria-current={active === id}
          onClick={() => onChange(id)}
        >
          <Icon className="ic" />
          {label}
        </button>
      ))}
    </nav>
  );
}
