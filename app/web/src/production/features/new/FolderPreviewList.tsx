import { Folder, Info } from 'lucide-react';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import type { Tone } from '../../../shared/lib/types';
import type { FolderPreview, PreviewStatus } from '../../lib/types';

const CHIP: Record<PreviewStatus, { label: string; tone: Tone }> = {
  will_create: { label: 'Will create', tone: 'ok' },
  already_batched: { label: 'Already batched', tone: 'info' },
  no_videos: { label: 'No videos', tone: 'warn' },
  unreadable: { label: 'Cannot be fully read', tone: 'warn' },
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export interface FolderPreviewListProps {
  preview: FolderPreview;
  include: string[];
  onToggle: (name: string) => void;
}

function counts(preview: FolderPreview): string {
  const count = (status: PreviewStatus) => preview.matches.filter((m) => m.status === status).length;
  const will = count('will_create');
  const batched = count('already_batched');
  const none = count('no_videos');
  const unreadable = count('unreadable');
  return [
    will ? `${will} will be created` : '',
    batched ? `${batched} already batched` : '',
    none ? plural(none, 'has no videos', 'have no videos') : '',
    unreadable ? `${unreadable} cannot be fully read` : '',
    preview.notMatching ? plural(preview.notMatching, 'does not match', 'do not match') : '',
  ].filter(Boolean).join(' · ');
}

export function FolderPreviewList({ preview, include, onToggle }: FolderPreviewListProps) {
  const anyBatched = preview.matches.some((m) => m.status === 'already_batched');
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-fill-2 p-3.5">
      <p className="text-caption font-semibold text-text-2">{counts(preview)}</p>
      {preview.matches.length === 0 ? <p className="text-small text-text-3">No folders match this pattern.</p> : null}
      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {preview.matches.map((item) => (
          <li key={item.path} className="flex min-w-0 items-center gap-2.5 rounded-[10px] bg-surface px-3 py-2">
            {item.status === 'will_create' || item.status === 'already_batched' ? (
              <input
                type="checkbox"
                aria-label={item.name}
                className="checkbox checkbox-sm"
                checked={item.status === 'will_create' || include.includes(item.name)}
                disabled={item.status === 'will_create'}
                onChange={() => onToggle(item.name)}
              />
            ) : (
              <span aria-hidden="true" className="size-5 shrink-0" />
            )}
            <Folder size={14} aria-hidden="true" className="shrink-0 text-text-2" />
            <span title={item.name} className="min-w-0 flex-1 truncate font-mono text-small font-semibold">{item.name}</span>
            <span className="shrink-0 text-caption text-text-2">{plural(item.clipCount, 'clip', 'clips')}</span>
            <span className="shrink-0"><StatusChip tone={CHIP[item.status].tone}>{CHIP[item.status].label}</StatusChip></span>
          </li>
        ))}
      </ul>
      {preview.truncated ? <p className="text-caption text-warn">The list was cut at 2000 folders. Make the pattern narrower to see the rest.</p> : null}
      {anyBatched ? (
        <p className="flex items-center gap-1.5 text-caption text-text-3">
          <Info size={13} aria-hidden="true" />
          Folders already batched are skipped. Tick one to include it again.
        </p>
      ) : null}
    </div>
  );
}
