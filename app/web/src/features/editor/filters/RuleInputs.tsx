import type { FilterRule, RandomSelection } from '../../../lib/types';
import { SelectField } from '../../../components/ui/SelectField';
import { DayPicker } from '../../schedule/DayPicker';

const BOX = 'input input-sm rounded-[10px] border border-line bg-surface px-3 text-small focus:outline-none focus:ring-2 focus:ring-primary/40';

const PLACEHOLDER: Record<string, string> = { name: 'proxy', glob: 'GX01*.MP4', regex: '^GX\\d{4}' };

export interface RuleInputsProps {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
}

export function RuleInputs({ rule, onChange }: RuleInputsProps) {
  const set = (patch: Partial<FilterRule>) => onChange({ ...rule, ...patch });
  if (rule.kind === 'random') {
    const setRandom = (patch: Partial<RandomSelection>) => set({ random: { ...rule.random, ...patch } });
    return <RandomInputs value={rule.random} onChange={setRandom} />;
  }
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

const NUMBER = (text: string, fallback: number) => (text === '' ? fallback : Math.max(0, Math.floor(Number(text)) || 0));

/** Random sample fields: pick N (or N%) of what the rules before it matched, overall or per folder, from a seed. */
function RandomInputs({ value, onChange }: { value: RandomSelection; onChange: (patch: Partial<RandomSelection>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-small text-text-2">
      <span>Pick</span>
      <input aria-label="Amount" inputMode="numeric" className={`${BOX} w-20 font-mono`} value={value.value} onChange={(e) => onChange({ value: NUMBER(e.target.value, 0) })} />
      <SelectField
        label="Amount type"
        className="w-36"
        surface
        value={value.mode}
        options={[{ value: 'percent', label: '% of clips' }, { value: 'count', label: 'clips' }]}
        onChange={(mode) => onChange({ mode })}
      />
      <span>from</span>
      <SelectField
        label="Selection scope"
        className="w-40"
        surface
        value={value.scope}
        options={[{ value: 'overall', label: 'all clips' }, { value: 'folder', label: 'each folder' }]}
        onChange={(scope) => onChange({ scope })}
      />
      <span>seed</span>
      <input aria-label="Seed" inputMode="numeric" className={`${BOX} w-20 font-mono`} value={value.seed} onChange={(e) => onChange({ seed: NUMBER(e.target.value, 0) })} />
    </div>
  );
}
