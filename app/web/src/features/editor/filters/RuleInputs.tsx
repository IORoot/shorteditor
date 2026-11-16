import type { FilterRule } from '../../../lib/types';
import { DayPicker } from '../../schedule/DayPicker';

const BOX = 'input input-sm rounded-[10px] border-0 bg-fill-2 px-3 text-small focus:outline-none focus:ring-2 focus:ring-primary/40';

const PLACEHOLDER: Record<string, string> = { name: 'proxy', glob: 'GX01*.MP4', regex: '^GX\\d{4}' };

export interface RuleInputsProps {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
}

export function RuleInputs({ rule, onChange }: RuleInputsProps) {
  const set = (patch: Partial<FilterRule>) => onChange({ ...rule, ...patch });
  if (rule.kind === 'date_range') {
    return (
      <div className="flex flex-1 items-center gap-2">
        <input type="date" aria-label="From date" className={`${BOX} flex-1 font-mono`} value={rule.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
        <span className="text-caption text-text-2">to</span>
        <input type="date" aria-label="To date" className={`${BOX} flex-1 font-mono`} value={rule.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
      </div>
    );
  }
  if (rule.kind === 'weekday') {
    return <DayPicker compact selected={rule.days} onChange={(days) => set({ days })} />;
  }
  if (rule.kind === 'window') {
    return (
      <div className="flex flex-1 items-center gap-2">
        <DayPicker compact selected={rule.days} onChange={(days) => set({ days })} />
        <input type="time" aria-label="Start time" className={`${BOX} w-24 font-mono`} value={rule.start} onChange={(e) => set({ start: e.target.value })} />
        <span className="text-caption text-text-2">to</span>
        <input type="time" aria-label="End time" className={`${BOX} w-24 font-mono`} value={rule.end} onChange={(e) => set({ end: e.target.value })} />
      </div>
    );
  }
  return (
    <input
      aria-label="Rule value"
      className={`${BOX} flex-1 font-mono`}
      placeholder={PLACEHOLDER[rule.kind]}
      value={rule.value}
      onChange={(event) => set({ value: event.target.value })}
    />
  );
}
