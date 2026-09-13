export type TabId = 'agent' | 'search';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'agent', label: 'Agent' },
  { id: 'search', label: 'Search Campaigns' },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
