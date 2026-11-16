import { Timer } from 'lucide-react';
import type { Collector } from '../../lib/types';
import { StatusChip } from '../../components/ui/StatusChip';
import { Toggle } from '../../components/ui/Toggle';

export interface CollectorRowProps {
  collector: Collector;
  selected: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}

export function CollectorRow({ collector, selected, onSelect, onToggle }: CollectorRowProps) {
  const { schedule, statusNote } = collector;
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl p-3.5 ${selected ? 'bg-surface shadow-[0_2px_12px_#0000000f]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(collector.id)}
          className="truncate text-h3 text-left font-semibold text-base-content"
        >
          {collector.name}
        </button>
        <Toggle
          label={`Schedule for ${collector.name}`}
          checked={schedule.enabled}
          onChange={(enabled) => onToggle(collector.id, enabled)}
        />
      </div>
      <p className="truncate text-caption text-text-2">{collector.source}</p>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-caption font-medium ${schedule.enabled ? 'text-base-content' : 'text-text-3'}`}>
          <Timer size={13} aria-hidden="true" className={schedule.enabled ? 'text-primary' : 'text-text-3'} />
          {schedule.enabled && schedule.nextRun ? `Next · ${schedule.nextRun}` : 'Schedule off'}
        </span>
        {statusNote ? <StatusChip tone={statusNote.tone}>{statusNote.text}</StatusChip> : null}
      </div>
    </div>
  );
}
