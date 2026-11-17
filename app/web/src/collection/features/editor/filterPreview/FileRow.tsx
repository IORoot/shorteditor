import type { ClipVerdict } from '../../../lib/types';
import { iconForFile } from './fileIcon';

export interface FileRowProps {
  clip: ClipVerdict;
}

export function FileRow({ clip }: FileRowProps) {
  const Icon = iconForFile(clip.name);
  const state = clip.selected ? 'selected' : 'filtered';
  const style = clip.selected ? 'bg-accent-soft opacity-100' : 'bg-fill-2 opacity-45';
  return (
    <li
      data-state={state}
      title={`${clip.name} · ${clip.reason}`}
      className={`flex h-9 shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 transition-all duration-300 ease-out ${style}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon size={15} aria-hidden="true" className={`shrink-0 transition-colors duration-300 ${clip.selected ? 'text-primary' : 'text-text-3'}`} />
        <span className={`truncate font-mono text-caption ${clip.selected ? 'font-semibold' : 'font-medium'}`}>{clip.name}</span>
      </span>
      <span className="shrink-0 text-caption text-text-2">{clip.label}</span>
      <span className="sr-only">{clip.selected ? 'Collected' : `Filtered out: ${clip.reason}`}</span>
    </li>
  );
}
