import { Timer } from 'lucide-react';
import type { Collector } from '../../lib/types';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { Toggle } from '../../../shared/components/ui/Toggle';

export interface CollectorRowProps {
  collector: Collector;
  selected: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}

/** "12s ago", "3 min ago": how long since the collector last looked at its source. */
function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 90 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

export function CollectorRow({ collector, selected, onSelect, onToggle }: CollectorRowProps) {
  const { schedule, statusNote, active } = collector;
  return (
    <div
      onClick={() => onSelect(collector.id)}
      className={`flex cursor-pointer flex-col gap-2 rounded-2xl p-3.5 ${selected ? 'bg-surface shadow-[0_2px_12px_#0000000f]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={selected}
          className={`truncate text-h3 text-left font-semibold ${active ? 'text-base-content' : 'text-text-3'}`}
        >
          {collector.name}
        </button>
        {/* the switch turns the collector on or off; it must not also select the row */}
        <div onClick={(event) => event.stopPropagation()}>
          <Toggle label={`Turn on ${collector.name}`} checked={active} onChange={(enabled) => onToggle(collector.id, enabled)} />
        </div>
      </div>
      <p className="truncate text-caption text-text-2">{collector.source}</p>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-caption font-medium ${schedule.enabled || schedule.mode === 'auto' ? 'text-base-content' : 'text-text-3'}`}>
          <Timer size={13} aria-hidden="true" className={schedule.enabled || schedule.mode === 'auto' ? 'text-primary' : 'text-text-3'} />
          {!active ? 'Turned off' : schedule.mode === 'auto' ? `Auto-collecting · ${schedule.lastChecked ? `checked ${ago(schedule.lastChecked)}` : 'not checked yet'}` : schedule.enabled && schedule.nextRun ? `Next · ${schedule.nextRun}` : 'Schedule off'}
        </span>
        {statusNote ? <StatusChip tone={statusNote.tone}>{statusNote.text}</StatusChip> : null}
      </div>
    </div>
  );
}
