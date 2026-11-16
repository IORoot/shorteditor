import { CalendarClock, History, Hand } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Run, RunStatus, Tone } from '../../lib/types';
import { StatusChip } from '../../components/ui/StatusChip';

const STATUS: Record<RunStatus, { tone: Tone; label: string }> = {
  done: { tone: 'ok', label: 'Done' },
  skipped: { tone: 'warn', label: 'Skipped' },
  failed: { tone: 'bad', label: 'Failed' },
};

const TRIGGER: Record<Run['trigger'], { label: string; icon: ReactNode }> = {
  scheduled: { label: 'Scheduled', icon: <CalendarClock size={14} aria-hidden="true" /> },
  manual: { label: 'Manual', icon: <Hand size={14} aria-hidden="true" /> },
  caught_up: { label: 'Caught up', icon: <History size={14} aria-hidden="true" /> },
};

export interface RunRowProps {
  run: Run;
  onUndo: (id: number) => void;
}

export function RunRow({ run, onUndo }: RunRowProps) {
  const status = STATUS[run.status];
  const trigger = TRIGGER[run.trigger];
  return (
    <tr className="border-b border-line align-middle">
      <td className="py-4 pr-4">
        <div className="flex flex-col gap-1">
          <span className="text-small font-semibold">{run.startedAt}</span>
          <span className="flex items-center gap-1.5 text-small text-text-2">
            {trigger.icon}
            {trigger.label}
          </span>
        </div>
      </td>
      <td className="py-4 pr-4 text-small leading-snug">{run.outcome}</td>
      <td className="py-4 pr-4">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </td>
      <td className="py-4 text-right">
        {run.canUndo ? (
          <button type="button" onClick={() => onUndo(run.id)} className="text-small font-semibold text-primary">
            Undo
          </button>
        ) : null}
      </td>
    </tr>
  );
}
