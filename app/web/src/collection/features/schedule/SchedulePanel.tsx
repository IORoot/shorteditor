import { Check, Info, RotateCcw, Shield, PlugZap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ScheduleDraft, ScheduleKind, ScheduleMode } from '../../lib/types';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { DayPicker } from './DayPicker';

export interface SchedulePanelProps {
  draft: ScheduleDraft;
  summary: string;
  nextRun: string | null;
  /** Matching clips already in the source, shown under Auto-collect so the first run is no surprise. */
  waiting?: number | null;
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

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: 'schedule', label: 'Schedule' },
  { value: 'auto', label: 'Auto-collect' },
];

const number = (text: string, fallback: number): number => (text.trim() === '' || Number.isNaN(Number(text)) ? fallback : Number(text));

const RULES: { icon: ReactNode; text: string }[] = [
  { icon: <RotateCcw size={16} aria-hidden="true" />, text: 'If missed, runs once when the backend returns.' },
  { icon: <Shield size={16} aria-hidden="true" />, text: 'Never overlaps. A busy Collector skips the run and logs it.' },
  { icon: <PlugZap size={16} aria-hidden="true" />, text: 'Unreachable source fails cleanly. Nothing is touched.' },
];

export function SchedulePanel({ draft, summary, nextRun, waiting = null, saving, error, onChange, onSave }: SchedulePanelProps) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-[20px] bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold">{draft.mode === 'auto' ? 'Auto-collect' : 'Schedule'}</h2>
        {draft.mode === 'auto' ? null : <Toggle label="Schedule enabled" checked={draft.enabled} onChange={(enabled) => set({ enabled })} />}
      </div>
      <SegmentedControl label="Run mode" options={MODE_OPTIONS} value={draft.mode} onChange={(mode) => set({ mode })} />
      <div className="flex flex-col gap-1.5">
        <p className="text-h2 font-semibold">{summary}</p>
        {draft.mode === 'auto' ? null : <p className="text-small font-medium text-primary">{nextRun ? `Next run ${nextRun}` : 'No next run'}</p>}
      </div>
      {draft.mode === 'auto' ? (
        <>
          <FormField label="Check every (seconds)" type="number" min={30} value={draft.pollSeconds} onChange={(event) => set({ pollSeconds: number(event.target.value, draft.pollSeconds) })} helper="At least 30. Runs when the filters match clips and the folder has stopped changing." />
          <FormField label="Wait until still for (seconds)" type="number" min={30} value={draft.settleSeconds} onChange={(event) => set({ settleSeconds: number(event.target.value, draft.settleSeconds) })} helper="So a clip still being copied is not taken." />
          <FormField label="Most files per run" type="number" min={1} value={draft.maxFiles} onChange={(event) => set({ maxFiles: number(event.target.value, draft.maxFiles) })} helper="Any others are taken on a later run." />
          {waiting !== null && waiting > 0 ? <p className="text-small font-medium text-primary">{`${waiting} matching ${waiting === 1 ? 'file is' : 'files are'} waiting. The first run will take ${waiting === 1 ? 'it' : 'them'}.`}</p> : null}
        </>
      ) : (
        <>
          <SegmentedControl label="Schedule type" options={KIND_OPTIONS} value={draft.kind} onChange={(kind) => set({ kind })} />
          {draft.kind === 'weekly' ? (
            <DayPicker selected={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
          ) : null}
          {draft.kind === 'cron' ? (
            <FormField label="Cron expression" value={draft.cron} onChange={(event) => set({ cron: event.target.value })} className="font-mono" />
          ) : (
            <FormField label="Time" type="time" value={draft.time} onChange={(event) => set({ time: event.target.value })} />
          )}
        </>
      )}
      {error ? <p role="alert" className="text-caption text-bad">{error}</p> : null}
      <Button variant="primary" icon={<Check size={15} aria-hidden="true" />} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : draft.mode === 'auto' ? 'Save' : 'Save schedule'}
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
