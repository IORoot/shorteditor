import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DateSourceKind } from '../../../lib/types';
import { DATE_SOURCES, moveBy, orderedSources } from '../../../lib/filters';

const LABEL = Object.fromEntries(DATE_SOURCES.map((s) => [s.value, s.label])) as Record<DateSourceKind, string>;

export interface DateSourcesSectionProps {
  sources: DateSourceKind[];
  filenamePattern: string;
  onChange: (sources: DateSourceKind[], filenamePattern: string) => void;
}

export function DateSourcesSection({ sources, filenamePattern, onChange }: DateSourcesSectionProps) {
  const rows = orderedSources(sources);
  const emit = (next: { kind: DateSourceKind; on: boolean }[]) =>
    onChange(next.filter((row) => row.on).map((row) => row.kind), filenamePattern);
  const toggle = (index: number) => emit(rows.map((row, i) => (i === index ? { ...row, on: !row.on } : row)));
  const canMove = (index: number, delta: number) => {
    const target = rows[index + delta];
    return rows[index].on && target !== undefined && target.on;
  };
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body font-semibold">Date source</h3>
        <p className="text-caption text-text-2">Where a clip’s date comes from. The first source that works is used.</p>
      </div>
      {rows.map((row, index) => (
        <div key={row.kind} className="flex items-center gap-3 rounded-xl bg-fill-2 px-3 py-2.5">
          <span className="w-3.5 text-caption font-semibold text-text-3">{row.on ? index + 1 : ''}</span>
          <input type="checkbox" aria-label={LABEL[row.kind]} className="checkbox checkbox-primary checkbox-sm rounded-[5px]" checked={row.on} onChange={() => toggle(index)} />
          <span className="w-44 text-small font-medium">{LABEL[row.kind]}</span>
          {row.kind === 'filename' && row.on ? (
            <input
              aria-label="Filename pattern"
              placeholder="GX_YYYYMMDD_HHmmss"
              className="input input-sm flex-1 rounded-[10px] border-0 bg-surface px-3 font-mono text-small focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={filenamePattern}
              onChange={(event) => onChange(sources, event.target.value)}
            />
          ) : (
            <span className="flex-1" />
          )}
          <button type="button" aria-label={`Move ${LABEL[row.kind]} up`} disabled={!canMove(index, -1)} onClick={() => emit(moveBy(rows, index, -1))} className="text-text-3 disabled:opacity-30">
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Move ${LABEL[row.kind]} down`} disabled={!canMove(index, 1)} onClick={() => emit(moveBy(rows, index, 1))} className="text-text-3 disabled:opacity-30">
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
