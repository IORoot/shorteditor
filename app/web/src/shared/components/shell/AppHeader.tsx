import { Scissors, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

export interface HeaderTab {
  id: string;
  label: string;
  enabled: boolean;
}

export interface AppHeaderProps {
  tabs: HeaderTab[];
  activeTab: string;
  status: ReactNode;
  onSelect?: (id: string) => void;
  /** The cog at the far right, opening Settings. */
  onSettings?: () => void;
  settingsActive?: boolean;
}

export function AppHeader({ tabs, activeTab, status, onSelect, onSettings, settingsActive = false }: AppHeaderProps) {
  return (
    <header className="sticky top-4 z-10 flex h-[52px] items-center justify-between rounded-full bg-surface pl-5 pr-2.5 shadow-[0_6px_28px_#0000001a]">
      <div className="flex w-64 items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-content">
          <Scissors size={16} aria-hidden="true" />
        </span>
        <span className="text-body font-semibold">Short Editor</span>
      </div>
      <nav aria-label="Sections" className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled}
            onClick={() => onSelect?.(tab.id)}
            aria-current={tab.id === activeTab ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-small ${
              tab.id === activeTab ? 'bg-fill-2 font-semibold' : 'font-medium text-text-3 disabled:cursor-not-allowed'
            }`}
          >
            {tab.label}
            {tab.enabled ? null : <span className="text-label font-medium text-text-3">Soon</span>}
          </button>
        ))}
      </nav>
      <div className="flex w-64 items-center justify-end gap-2 pr-1 text-caption font-medium text-text-2">
        {status}
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
          aria-current={settingsActive ? 'page' : undefined}
          className={`grid size-9 place-items-center rounded-full ${settingsActive ? 'bg-fill-2 text-base-content' : 'text-text-2 hover:bg-fill-2'}`}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
