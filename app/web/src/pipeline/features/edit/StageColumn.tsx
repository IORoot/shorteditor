import { GripVertical, Plus } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { iconOf, summaryFor } from '../../lib/stageMeta';
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
  onSelect: (uid: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
  onMoveTo: (from: number, to: number) => void;
  onAdd: () => void;
}

interface Drag {
  from: number;
  over: number;
}

/** The pipeline's steps in order: number, icon, name, what it is set to, an on/off switch, and a grip to drag it. */
export function StageColumn({ rows, library, selected, onSelect, onToggle, onMoveTo, onAdd }: StageColumnProps) {
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // The gap the pointer is in: slot k sits above row k, and slot rows.length sits below the last row.
  const slotFor = (clientY: number): number => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>(':scope > li[data-row]') ?? []);
    const found = items.findIndex((item) => {
      const box = item.getBoundingClientRect();
      return clientY < box.top + box.height / 2;
    });
    return found === -1 ? items.length : found;
  };

  // Dropping into the gap just above or below the stage itself changes nothing.
  const moves = (d: Drag) => d.over !== d.from && d.over !== d.from + 1;

  const finish = () => {
    if (drag && moves(drag)) onMoveTo(drag.from, drag.over > drag.from ? drag.over - 1 : drag.over);
    setDrag(null);
  };
  const dropLine = <li key="drop-line" role="presentation" data-testid="drop-line" className="h-[3px] rounded-full bg-primary" />;

  return (
    <section aria-label="Stages" className="flex w-[320px] shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-label font-semibold tracking-wide text-text-3">STAGES</h2>
        <span className="text-caption text-text-3">{rows.length}</span>
      </div>
      <ol ref={list} className="flex flex-col gap-2">
        {rows.map(({ uid, step }, index) => {
          const title = titleOf(step, library);
          const Icon = iconOf(step.key);
          const info = library.find((candidate) => candidate.key === step.key);
          const dropHere = drag !== null && moves(drag) && drag.over === index;
          return (
            <Fragment key={uid}>
              {dropHere ? dropLine : null}
              <li data-row aria-label={`Stage ${index + 1} ${title}`} className={`flex items-center gap-2 rounded-xl border-2 bg-surface px-2 py-3 ${uid === selected ? 'border-primary' : 'border-transparent'} ${drag?.from === index ? 'opacity-50' : ''}`}>
                <button
                  type="button"
                  aria-label={`Drag ${title} ${index + 1}`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    setDrag({ from: index, over: index });
                  }}
                  onPointerMove={(event) => {
                    if (drag) setDrag({ from: drag.from, over: slotFor(event.clientY) });
                  }}
                  onPointerUp={finish}
                  onPointerCancel={() => setDrag(null)}
                  className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-text-3 active:cursor-grabbing"
                >
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fill-2 text-caption font-semibold text-text-2">{index + 1}</span>
                <button type="button" aria-label={`Select ${title} ${index + 1}`} aria-current={uid === selected ? 'step' : undefined} onClick={() => onSelect(uid)} className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${step.enabled ? '' : 'opacity-60'}`}>
                  <Icon size={16} aria-hidden="true" className="shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-small font-semibold">{title}</span>
                    <span className="truncate text-caption text-text-2">{summaryFor(step.key, info, step)}</span>
                  </span>
                </button>
                <Toggle label={`Use ${title} ${index + 1}`} checked={step.enabled} onChange={(on) => onToggle(index, on)} />
              </li>
            </Fragment>
          );
        })}
        {drag !== null && moves(drag) && drag.over === rows.length ? dropLine : null}
      </ol>
      <Button className="w-full justify-center" icon={<Plus size={14} aria-hidden="true" />} onClick={onAdd}>Add stage</Button>
    </section>
  );
}
