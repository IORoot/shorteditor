import { useState } from 'react';
import { Check, CornerLeftUp, Folder, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useLoad } from '../../../shared/hooks/useLoad';
import { Button } from '../../../shared/components/ui/Button';

export interface FolderPickerProps {
  startPath: string;
  onChoose: (path: string) => void;
  onClose: () => void;
}

function parentOf(path: string): string {
  return path.replace(/\/[^/]*$/, '') || '/';
}

export function FolderPicker({ startPath, onChoose, onClose }: FolderPickerProps) {
  const [path, setPath] = useState<string | undefined>(startPath || undefined);
  const listing = useLoad(() => api.browse(path), [path]);
  const current = listing.state.status === 'ready' ? listing.state.data : null;

  return (
    <dialog open aria-label="Choose a folder" className="modal modal-open">
      <div className="modal-box flex max-h-[80vh] w-[520px] max-w-full flex-col gap-4 rounded-[20px] bg-surface p-6">
        <h2 className="text-h3 font-semibold">Choose a folder</h2>
        <p className="truncate font-mono text-small text-text-2">{current?.path ?? path ?? '…'}</p>
        <div className="min-h-40 flex-1 overflow-y-auto">
          {listing.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading…</p> : null}
          {listing.state.status === 'error' ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="text-small text-bad">{listing.state.message}</p>
              {path && path !== '/' ? <Button icon={<CornerLeftUp size={15} aria-hidden="true" />} onClick={() => setPath(parentOf(path))}>Go to parent folder</Button> : null}
            </div>
          ) : null}
          {current ? (
            <ul className="flex flex-col">
              {current.parent ? (
                <li>
                  <button type="button" onClick={() => setPath(current.parent ?? undefined)} className="w-full rounded-lg px-2 py-2 text-left text-small text-text-2 hover:bg-fill-2">
                    ..
                  </button>
                </li>
              ) : null}
              {current.entries.map((entry) => (
                <li key={entry.path}>
                  <button type="button" onClick={() => setPath(entry.path)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-small hover:bg-fill-2">
                    <Folder size={14} aria-hidden="true" className="text-text-2" />
                    {entry.name}
                  </button>
                </li>
              ))}
              {current.entries.length === 0 ? <li className="px-2 py-2 text-small text-text-3">No subfolders.</li> : null}
            </ul>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button icon={<X size={15} aria-hidden="true" />} onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Check size={15} aria-hidden="true" />} disabled={!current} onClick={() => current && onChoose(current.path)}>
            Choose this folder
          </Button>
        </div>
      </div>
    </dialog>
  );
}
