import { useState } from 'react';
import { stillUrl } from '../../lib/api';
import { clipRows, filterClips, type ClipFilter, type ClipRow } from '../../lib/clips';
import { span } from '../../lib/passDetail';
import type { StageRun, Pass } from '../../lib/types';

const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';
const FILTERS: { value: ClipFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'action', label: 'Action found' },
  { value: 'none', label: 'No action' },
  { value: 'edited', label: 'Edited by me' },
];

export interface ClipLibraryProps {
  passId: number;
  stages: StageRun[];
  overrides: Pass['overrides'];
  /** The clip open in the editor, by file name. */
  selected: string | null;
  onSelect: (name: string) => void;
}

function tagOf(row: ClipRow): string {
  if (row.found === 'waiting') return 'Waiting';
  if (row.found === 'none') return 'No action';
  return `${row.parts.length} ${row.parts.length === 1 ? 'segment' : 'segments'}`;
}

/** Image tiles of the card's clips, filtered, each opening its clip in the editor. */
export function ClipLibrary({ passId, stages, overrides, selected, onSelect }: ClipLibraryProps) {
  const [filter, setFilter] = useState<ClipFilter>('all');
  const rows = clipRows(stages, overrides);
  const shown = filterClips(rows, filter);

  return (
    <section aria-label="Clips" className="flex min-w-0 flex-col gap-3.5 rounded-[20px] bg-surface px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={LABEL}>Clips {rows.length > 0 ? rows.length : ''}</h2>
        <div role="group" aria-label="Filter clips" className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-3 py-1 text-caption font-semibold ${filter === item.value ? 'bg-primary text-on-accent' : 'bg-fill-2 text-text-2 hover:bg-fill-3'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <p className="text-small text-text-3">No clips have been scanned yet.</p> : null}
      {rows.length > 0 && shown.length === 0 ? <p className="text-small text-text-3">No clips match this filter.</p> : null}
      <ul className="grid max-h-[560px] grid-cols-2 gap-3 overflow-auto md:grid-cols-3 2xl:grid-cols-4">
        {shown.map((row) => (
          <li key={row.name} className="min-w-0">
            <button
              type="button"
              aria-pressed={selected === row.name}
              onClick={() => onSelect(row.name)}
              className={`flex w-full min-w-0 flex-col gap-2 rounded-[12px] p-1 text-left ${selected === row.name ? 'ring-2 ring-accent' : ''}`}
            >
              <ClipImage src={stillUrl(passId, row.name, row.stillAt)} />
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${row.found === 'found' ? 'bg-accent-soft text-primary' : 'bg-fill-2 text-text-2'}`}>{tagOf(row)}</span>
                <span className="text-caption font-semibold tabular-nums text-text-2">{span(row.length * 1000)}</span>
              </span>
              <span title={row.name} className="truncate text-caption text-text-2">
                {row.name}
                {row.trims.length > 0 ? <span className="ml-2 font-semibold text-primary">Edited</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The picture of a clip; a grey box stays in its place when no picture can be made. */
function ClipImage({ src }: { src: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="relative block h-[120px] overflow-hidden rounded-[10px] bg-fill-2">
      {missing ? null : <img src={src} alt="" loading="lazy" onError={() => setMissing(true)} className="h-full w-full object-cover" />}
    </span>
  );
}
