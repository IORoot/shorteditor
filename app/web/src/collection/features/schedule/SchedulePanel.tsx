import { Check, Info, RotateCcw, Shield, PlugZap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ScheduleDraft, ScheduleKind } from '../../lib/types';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { DayPicker } from './DayPicker';

export interface SchedulePanelProps {
  draft: ScheduleDraft;
  summary: string;
  nextRun: string | null;
  saving: boolean;
  error: string | null;
  onChange: (draft: ScheduleDraft) => void;
  onSave: () => void;
}

const KIND_OPTIONS: { value: ScheduleKind; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cron', label: 'Cron' },
];

const RULES: { icon: ReactNode; text: string }[] = [
  { icon: <RotateCcw size={16} aria-hidden="true" />, text: 'If missed, runs once when the backend returns.' },
  { icon: <Shield size={16} aria-hidden="true" />, text: 'Never overlaps. A busy Collector skips the run and logs it.' },
  { icon: <PlugZap size={16} aria-hidden="true" />, text: 'Unreachable source fails cleanly. Nothing is touched.' },
];

export function SchedulePanel({ draft, summary, nextRun, saving, error, onChange, onSave }: SchedulePanelProps) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-[20px] bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold">Schedule</h2>
        <Toggle label="Schedule enabled" checked={draft.enabled} onChange={(enabled) => set({ enabled })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-h2 font-semibold">{summary}</p>
        <p className="text-small font-medium text-primary">{nextRun ? `Next run ${nextRun}` : 'No next run'}</p>
      </div>
      <SegmentedControl label="Schedule type" options={KIND_OPTIONS} value={draft.kind} onChange={(kind) => set({ kind })} />
      {draft.kind === 'weekly' ? (
        <DayPicker selected={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
      ) : null}
      {draft.kind === 'cron' ? (
        <FormField label="Cron expression" value={draft.cron} onChange={(event) => set({ cron: event.target.value })} className="font-mono" />
      ) : (
        <FormField label="Time" type="time" value={draft.time} onChange={(event) => set({ time: event.target.value })} />
      )}
      {error ? <p role="alert" className="text-caption text-bad">{error}</p> : null}
      <Button variant="primary" icon={<Check size={15} aria-hidden="true" />} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save schedule'}
      </Button>
      <ul className="mt-auto flex flex-col gap-2.5 border-t border-line pt-4">
        {RULES.map((rule) => (
          <li key={rule.text} className="flex items-start gap-2.5 text-caption text-text-2">
            <span className="mt-0.5 text-text-2">{rule.icon}</span>
            {rule.text}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-caption text-text-3">
        <Info size={14} aria-hidden="true" />
        Unmatched files stay in place and are listed in each run’s detail.
      </p>
    </div>
  );
}
