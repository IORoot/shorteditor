import type { RandomSelection } from '../../../lib/types';
import { SelectField } from '../../../components/ui/SelectField';
import { Toggle } from '../../../components/ui/Toggle';

const BOX = 'input input-sm w-20 rounded-[10px] border-0 bg-fill-2 px-3 font-mono text-small focus:outline-none focus:ring-2 focus:ring-primary/40';

export interface RandomSelectionFieldProps {
  value: RandomSelection;
  onChange: (value: RandomSelection) => void;
}

export function RandomSelectionField({ value, onChange }: RandomSelectionFieldProps) {
  const set = (patch: Partial<RandomSelection>) => onChange({ ...value, ...patch });
  const number = (text: string, fallback: number) => (text === '' ? fallback : Math.max(0, Math.floor(Number(text)) || 0));
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-body font-semibold">Random selection</h3>
          <p className="text-caption text-text-2">Runs last, after all filters. The same seed picks the same clips every time.</p>
        </div>
        <Toggle label="Random selection" checked={value.enabled} onChange={(enabled) => set({ enabled })} />
      </div>
      {value.enabled ? (
        <div className="flex flex-wrap items-center gap-2.5 text-small text-text-2">
          <span>Pick</span>
          <input aria-label="Amount" inputMode="numeric" className={BOX} value={value.value} onChange={(e) => set({ value: number(e.target.value, 0) })} />
          <SelectField
            label="Amount type"
            className="w-36"
            value={value.mode}
            options={[{ value: 'percent', label: '% of clips' }, { value: 'count', label: 'clips' }]}
            onChange={(mode) => set({ mode })}
          />
          <span>from</span>
          <SelectField
            label="Selection scope"
            className="w-40"
            value={value.scope}
            options={[{ value: 'overall', label: 'all clips' }, { value: 'folder', label: 'each folder' }]}
            onChange={(scope) => set({ scope })}
          />
          <span>seed</span>
          <input aria-label="Seed" inputMode="numeric" className={BOX} value={value.seed} onChange={(e) => set({ seed: number(e.target.value, 0) })} />
        </div>
      ) : null}
    </div>
  );
}
