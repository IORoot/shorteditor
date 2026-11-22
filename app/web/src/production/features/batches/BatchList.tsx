import { Check, Pause, Pencil, Play, RotateCw, Square, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { FILTERS, inFilter, type BatchFilter } from '../../lib/batchList';
import type { ActionName, BatchListItem } from '../../lib/types';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import type { Tone } from '../../../shared/lib/types';
import { lastSegment } from '../../lib/board';

const TONE: Record<BatchListItem['status'], Tone> = {
  empty: 'warn',
  queued: 'info',
  held: 'warn',
  paused: 'warn',
  running: 'info',
  review: 'ok',
  failed: 'bad',
  stopped: 'warn',
  approved: 'ok',
};

const LABEL: Record<BatchListItem['status'], string> = {
  empty: 'No cards',
  queued: 'Queued',
  held: 'Not started',
  paused: 'Paused',
  running: 'Running',
  review: 'Review',
  failed: 'Failed',
  stopped: 'Stopped',
  approved: 'Approved',
};

export interface BatchListProps {
  items: BatchListItem[];
  filter: BatchFilter;
  onFilter: (filter: BatchFilter) => void;
  onOpen: (item: BatchListItem) => void;
  /** The batches chosen for an action. Undefined while the list is not choosing. */
  chosen?: ReadonlySet<number>;
  /** Runs one action on one batch from its row's icons. Without it the icons are not shown. */
  onAct?: (item: BatchListItem, action: ActionName) => void;
  /** Opens the batch's settings. Without it the Edit icon is not shown. */
  onEdit?: (item: BatchListItem) => void;
  /** Disables the row icons while an action is running. */
  busy?: boolean;
}

/** The icons on a row: Pause or Resume, then Stop or Run again, then Delete. Only the ones that apply are shown. */
export function rowIcons(status: BatchListItem['status']): { toggle: 'pause' | 'resume' | null; second: 'stop' | 'rerun' } {
  const toggle = status === 'queued' || status === 'running' ? 'pause' : status === 'paused' || status === 'stopped' || status === 'held' ? 'resume' : null;
  const second = status === 'queued' || status === 'running' || status === 'paused' || status === 'held' ? 'stop' : 'rerun';
  return { toggle, second };
}

const ICON_LABEL: Record<ActionName, string> = { pause: 'Pause', resume: 'Resume', stop: 'Stop', rerun: 'Run again', delete: 'Delete' };
const ICON: Record<ActionName, ReactNode> = {
  pause: <Pause size={15} aria-hidden="true" />,
  resume: <Play size={15} aria-hidden="true" />,
  stop: <Square size={14} aria-hidden="true" />,
  rerun: <RotateCw size={15} aria-hidden="true" />,
  delete: <Trash2 size={15} aria-hidden="true" />,
};

function RowIcon({ action, item, busy, disabled, onAct }: { action: ActionName; item: BatchListItem; busy: boolean; disabled?: boolean; onAct: (item: BatchListItem, action: ActionName) => void }) {
  const label = `${ICON_LABEL[action]} ${item.name}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={ICON_LABEL[action]}
      disabled={busy || disabled}
      onClick={() => onAct(item, action)}
      className={`grid size-8 shrink-0 place-items-center rounded-full text-text-2 hover:bg-fill-3 disabled:opacity-35 ${action === 'delete' ? 'hover:text-bad' : ''}`}
    >
      {ICON[action]}
    </button>
  );
}

const COLUMNS = 'grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_90px_120px_minmax(0,1.4fr)_120px]';

export function BatchList({ items, filter, onFilter, onOpen, chosen, onAct, onEdit, busy = false }: BatchListProps) {
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
      <section aria-label="Batches" className="flex flex-col gap-2 rounded-[20px] bg-surface p-3">
        <div role="row" className={`grid ${COLUMNS} gap-4 px-4 py-2 font-sans text-caption font-semibold uppercase tracking-wide text-text-3`}>
          <span>Batch</span><span>Pipeline</span><span>Cards</span><span>Status</span><span>Result</span><span>Last run</span>
          {onAct ? <span aria-hidden="true" /> : null}
        </div>
        {shown.length === 0 ? <p className="px-4 py-6 text-body text-text-3">No batches match this filter.</p> : null}
        {shown.map((item) => {
          const picked = chosen?.has(item.id) ?? false;
          const icons = rowIcons(item.status);
          return (
            <div key={item.id} className={`flex items-center gap-2 rounded-xl pr-2 ${picked ? 'bg-accent-soft' : 'bg-fill-2 hover:bg-fill-3'}`}>
            <button
              type="button"
              aria-label={`${item.name}, ${LABEL[item.status]}`}
              aria-pressed={chosen ? picked : undefined}
              onClick={() => onOpen(item)}
              className={`grid min-w-0 flex-1 ${COLUMNS} items-center gap-4 rounded-xl px-4 py-3 text-left disabled:opacity-60`}
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
            {onAct ? (
              <span className="flex shrink-0 items-center gap-0.5">
                {onEdit ? (
                  <button type="button" aria-label={`Edit ${item.name}`} title="Edit" disabled={busy} onClick={() => onEdit(item)} className="grid size-8 shrink-0 place-items-center rounded-full text-text-2 hover:bg-fill-3 disabled:opacity-35">
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                ) : null}
                {icons.toggle ? <RowIcon action={icons.toggle} item={item} busy={busy} onAct={onAct} /> : <span aria-hidden="true" className="size-8" />}
                <RowIcon action={icons.second} item={item} busy={busy} onAct={onAct} />
                <RowIcon action="delete" item={item} busy={busy} disabled={item.status === 'running'} onAct={onAct} />
              </span>
            ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
