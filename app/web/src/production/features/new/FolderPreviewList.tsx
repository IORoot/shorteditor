import { Folder, Info } from 'lucide-react';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import type { Tone } from '../../../shared/lib/types';
import type { FolderPreview, PreviewItem, PreviewStatus } from '../../lib/types';

const CHIP: Record<PreviewStatus, { label: string; tone: Tone }> = {
  will_create: { label: 'Will create', tone: 'ok' },
  already_batched: { label: 'Already batched', tone: 'info' },
  no_videos: { label: 'No videos', tone: 'warn' },
  unreadable: { label: 'Cannot be fully read', tone: 'warn' },
};

const ALREADY_THERE = { label: 'Already there', tone: 'info' as Tone };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * How the list is read. Undefined: a one-off batch, where Will create is ticked and fixed on.
 * 'create': watching, and the watch's first check batches the folders already there (ticks have no effect).
 * 'skip': watching, and the folders already there are not batched now.
 */
export type WatchReading = 'create' | 'skip';

export interface FolderPreviewListProps {
  preview: FolderPreview;
  include: string[];
  onToggle: (name: string) => void;
  watching?: WatchReading;
}

function counts(preview: FolderPreview, watching?: WatchReading): string {
  const count = (status: PreviewStatus) => preview.matches.filter((m) => m.status === status).length;
  const will = count('will_create');
  const batched = count('already_batched');
  const none = count('no_videos');
  const unreadable = count('unreadable');
  const willPart = watching === 'skip' ? `${will} already there, not batched now` : `${will} will be created`;
  return [
    will ? willPart : '',
    batched ? `${batched} already batched` : '',
    none ? plural(none, 'has no videos', 'have no videos') : '',
    unreadable ? `${unreadable} cannot be fully read` : '',
    preview.notMatching ? plural(preview.notMatching, 'does not match', 'do not match') : '',
  ].filter(Boolean).join(' · ');
}

/** Whether a row gets a box, and whether the box is ticked. Watching never offers to batch an already-batched folder again. */
function box(item: PreviewItem, include: string[], watching?: WatchReading): { show: boolean; checked: boolean; fixed: boolean } {
  if (item.status === 'will_create') return watching === 'skip' ? { show: false, checked: false, fixed: false } : { show: true, checked: true, fixed: true };
  if (item.status === 'already_batched' && watching === undefined) return { show: true, checked: include.includes(item.name), fixed: false };
  return { show: false, checked: false, fixed: false };
}

export function FolderPreviewList({ preview, include, onToggle, watching }: FolderPreviewListProps) {
  const anyBatched = preview.matches.some((m) => m.status === 'already_batched');
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-fill-2 p-3.5">
      <p className="text-caption font-semibold text-text-2">{counts(preview, watching)}</p>
      {preview.matches.length === 0 ? <p className="text-small text-text-3">No folders match this pattern.</p> : null}
      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {preview.matches.map((item) => {
          const state = box(item, include, watching);
          const chip = watching === 'skip' && item.status === 'will_create' ? ALREADY_THERE : CHIP[item.status];
          return (
            <li key={item.path} className="flex min-w-0 items-center gap-2.5 rounded-[10px] bg-surface px-3 py-2">
              {state.show ? (
                <input
                  type="checkbox"
                  aria-label={item.name}
                  className="checkbox checkbox-sm"
                  checked={state.checked}
                  disabled={state.fixed}
                  onChange={() => onToggle(item.name)}
                />
              ) : (
                <span aria-hidden="true" className="size-5 shrink-0" />
              )}
              <Folder size={14} aria-hidden="true" className="shrink-0 text-text-2" />
              <span title={item.name} className="min-w-0 flex-1 truncate font-mono text-small font-semibold">{item.name}</span>
              <span className="shrink-0 text-caption text-text-2">{plural(item.clipCount, 'clip', 'clips')}</span>
              <span className="shrink-0"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></span>
            </li>
          );
        })}
      </ul>
      {preview.truncated ? <p className="text-caption text-warn">The list was cut at 2000 folders. Make the pattern narrower to see the rest.</p> : null}
      {anyBatched && watching === undefined ? (
        <p className="flex items-center gap-1.5 text-caption text-text-3">
          <Info size={13} aria-hidden="true" />
          Folders already batched are skipped. Tick one to include it again.
        </p>
      ) : null}
    </div>
  );
}
