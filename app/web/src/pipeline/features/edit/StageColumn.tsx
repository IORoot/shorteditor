import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '../../../shared/components/ui/Button';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { titleOf } from '../../lib/steps';
import type { StageInfo, StageStep } from '../../lib/types';

export interface Row {
  uid: number;
  step: StageStep;
}

export interface StageColumnProps {
  rows: Row[];
  library: StageInfo[];
  selected: number | null;
  adding: string;
  onSelect: (uid: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onToggle: (index: number, enabled: boolean) => void;
  onRemove: (index: number) => void;
  onPick: (key: string) => void;
  onAdd: () => void;
}

export function StageColumn({ rows, library, selected, adding, onSelect, onMove, onToggle, onRemove, onPick, onAdd }: StageColumnProps) {
  return (
    <section aria-label="Stages" className="flex w-[280px] shrink-0 flex-col gap-3 rounded-[20px] bg-surface p-4">
      <h2 className="text-h3 font-semibold">Stages</h2>
      <ol className="flex flex-col gap-2">
        {rows.map(({ uid, step }, index) => {
          const title = titleOf(step, library);
          return (
            <li key={uid} aria-label={`Stage ${index + 1} ${title}`} className={`flex flex-col gap-1.5 rounded-[12px] p-2.5 ${uid === selected ? 'bg-accent-soft' : 'bg-fill-2'}`}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" aria-label={`Select ${title} ${index + 1}`} onClick={() => onSelect(uid)} className="min-w-0 flex-1 truncate text-left text-small font-semibold">
                  {index + 1}. {title}
                </button>
                <Toggle label={`Use ${title} ${index + 1}`} checked={step.enabled} onChange={(on) => onToggle(index, on)} />
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" aria-label={`Move ${title} ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, -1)} icon={<ArrowUp size={14} aria-hidden="true" />} />
                <Button variant="ghost" aria-label={`Move ${title} ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => onMove(index, 1)} icon={<ArrowDown size={14} aria-hidden="true" />} />
                <Button variant="ghost" aria-label={`Remove ${title} ${index + 1}`} onClick={() => onRemove(index)} icon={<X size={14} aria-hidden="true" />} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <select aria-label="Stage to add" value={adding} onChange={(event) => onPick(event.target.value)} className="select select-sm min-w-0 flex-1 rounded-[10px] border-0 bg-fill-2 text-small">
          {library.map((info) => <option key={info.key} value={info.key}>{info.title}</option>)}
        </select>
        <Button disabled={adding === ''} onClick={onAdd}>Add stage</Button>
      </div>
    </section>
  );
}
