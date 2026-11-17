import { Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { iconOf } from '../../lib/stageMeta';
import type { StageInfo } from '../../lib/types';

export interface StageLibraryDialogProps {
  library: StageInfo[];
  /** The title of the last stage, or null when the pipeline is empty. */
  after: string | null;
  onPick: (info: StageInfo) => void;
  onClose: () => void;
}

/** The stages that can be added, with what each one does. */
export function StageLibraryDialog({ library, after, onPick, onClose }: StageLibraryDialogProps) {
  const [query, setQuery] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const needle = query.trim().toLowerCase();
  const shown = library.filter((info) => `${info.title} ${info.description}`.toLowerCase().includes(needle));

  return (
    <dialog open aria-label="Add a stage" className="modal modal-open">
      <div className="modal-box flex max-h-[90vh] w-[720px] max-w-full flex-col gap-4 overflow-y-auto rounded-[20px] bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 font-bold">Add a stage</h2>
            <p className="text-caption text-text-2">{after ? `Goes after ${after}` : 'Goes first'}</p>
          </div>
          <Button variant="ghost" aria-label="Close" icon={<X size={16} aria-hidden="true" />} onClick={onClose} />
        </div>
        <label className="flex items-center gap-2 rounded-[10px] bg-fill-2 px-3 py-2">
          <Search size={14} aria-hidden="true" className="text-text-2" />
          <input aria-label="Search stages" placeholder="Search stages" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-small focus:outline-none" />
        </label>
        <ul className="flex flex-col">
          {shown.map((info) => {
            const Icon = iconOf(info.key);
            return (
            <li key={info.key} className="flex items-center gap-4 border-t border-line py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-fill-2"><Icon size={16} aria-hidden="true" className="text-text" /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-small font-semibold">{info.title}</span>
                <span className="text-caption text-text-2">{info.description}</span>
                <span className="text-label text-text-3">{info.key}</span>
              </div>
              <Button variant="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => onPick(info)}>Add</Button>
            </li>
            );
          })}
        </ul>
        {shown.length === 0 ? <p className="text-small text-text-3">No stage matches “{query}”.</p> : null}
        <p className="text-caption text-text-3">Your own stages: add a file to the stages folder and it shows up here.</p>
      </div>
    </dialog>
  );
}
