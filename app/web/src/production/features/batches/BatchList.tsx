import { Check } from 'lucide-react';
import { FILTERS, inFilter, type BatchFilter } from '../../lib/batchList';
import type { BatchListItem } from '../../lib/types';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import type { Tone } from '../../../shared/lib/types';
import { lastSegment } from '../../lib/board';

const TONE: Record<BatchListItem['status'], Tone> = {
  empty: 'warn',
  queued: 'info',
  running: 'info',
  review: 'ok',
  failed: 'bad',
  approved: 'ok',
};

const LABEL: Record<BatchListItem['status'], string> = {
  empty: 'No cards',
  queued: 'Queued',
  running: 'Running',
  review: 'Review',
  failed: 'Failed',
  approved: 'Approved',
};

export interface BatchListProps {
  items: BatchListItem[];
  filter: BatchFilter;
  onFilter: (filter: BatchFilter) => void;
  onOpen: (item: BatchListItem) => void;
  /** The batches chosen for deleting. Undefined while the list is not choosing. */
  chosen?: ReadonlySet<number>;
}

const COLUMNS = 'grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_90px_120px_minmax(0,1.4fr)_120px]';

export function BatchList({ items, filter, onFilter, onOpen, chosen }: BatchListProps) {
  const shown = items.filter((item) => inFilter(item, filter));
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filter batches" className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((tab) => {
          const count = items.filter((item) => inFilter(item, tab.id)).length;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => onFilter(tab.id)}
              className={`rounded-full px-3 py-1.5 text-small font-semibold ${filter === tab.id ? 'bg-primary text-primary-content' : 'bg-fill-2 text-text-2 hover:bg-fill-3'}`}
            >
              {tab.label} {count}
            </button>
          );
        })}
      </div>
      <section aria-label="Batches" className="flex flex-col rounded-[20px] bg-surface p-3">
        <div role="row" className={`grid ${COLUMNS} gap-4 px-4 py-2 font-sans text-caption font-semibold uppercase tracking-wide text-text-3`}>
          <span>Batch</span><span>Pipeline</span><span>Cards</span><span>Status</span><span>Result</span><span>Last run</span>
        </div>
        {shown.length === 0 ? <p className="px-4 py-6 text-body text-text-3">No batches match this filter.</p> : null}
        {shown.map((item) => {
          const picked = chosen?.has(item.id) ?? false;
          const blocked = item.status === 'running' || item.status === 'queued';
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`${item.name}, ${LABEL[item.status]}`}
              aria-pressed={chosen ? picked : undefined}
              disabled={chosen !== undefined && blocked}
              onClick={() => onOpen(item)}
              className={`grid ${COLUMNS} items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-fill-2 disabled:opacity-60 ${picked ? 'bg-accent-soft' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                {chosen ? (
                  <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${picked ? 'border-primary bg-primary text-primary-content' : 'border-line'}`} aria-hidden="true">
                    {picked ? <Check size={13} /> : null}
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body font-semibold">{item.name}</span>
                  <span className="truncate text-caption text-text-3">{lastSegment(item.inputFolder)} · {item.folderCount} {item.folderCount === 1 ? 'card' : 'cards'}</span>
                </span>
              </span>
              <span className="truncate text-small text-text-2">{item.pipelineName ?? 'No pipeline'}</span>
              <span className="text-small text-text-2">{item.folderCount}</span>
              <span><StatusChip tone={TONE[item.status]}>{LABEL[item.status]}</StatusChip></span>
              <span className="truncate text-small text-text-2">{item.approvedCount} of {item.folderCount} approved{item.failedCount ? `, ${item.failedCount} failed` : ''}</span>
              <span className="text-small text-text-3">{item.runNumber ? `Run ${item.runNumber}` : 'Not run yet'}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
