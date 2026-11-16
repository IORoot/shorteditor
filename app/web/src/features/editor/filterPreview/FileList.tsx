import type { ClipVerdict } from '../../../lib/types';
import { FileRow } from './FileRow';

export interface FileListProps {
  clips: ClipVerdict[];
  busy?: boolean;
}

/** Fixed height with its own scrollbar, so a long folder never pushes the cards below it down. */
export function FileList({ clips, busy = false }: FileListProps) {
  return (
    <ul aria-label="Input folder files" aria-busy={busy} className="flex h-[480px] flex-col gap-1 overflow-y-auto pr-2">
      {clips.map((clip) => (
        <FileRow key={clip.name} clip={clip} />
      ))}
    </ul>
  );
}
