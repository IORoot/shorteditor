import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import type { BrowseResult } from '../../../shared/lib/types';
import { useFolderPreview } from '../../hooks/useFolderPreview';
import { batchesNow, defaultManyForm, folderNameOf, formFromWatch, ignoresSubfolders, manyIsValid, type ManyForm } from '../../lib/presets';
import type { Defaults, FolderPreview, PipelineChoice, WatchView } from '../../lib/types';
import { ManyFoldersForm } from './ManyFoldersForm';

/** Opened from the Watches panel: adding a new watch, or changing a saved one. */
export type WatchTarget = { kind: 'add' } | { kind: 'edit'; watch: WatchView };

export interface NewBatchDialogProps {
  defaults: Defaults;
  pipelines: PipelineChoice[];
  onManagePipelines?: () => void;
  busy: boolean;
  error: string | null;
  onCreateMany: (form: ManyForm) => void;
  /** A watch is saved: `watchId` is null for a new one. */
  onSaveWatch: (form: ManyForm, watchId: number | null) => void;
  onClose: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
  previewFolders: (parentFolder: string, pattern: string, outputRoot?: string) => Promise<FolderPreview>;
  watchTarget?: WatchTarget;
}

function initialMany(target: WatchTarget | undefined): ManyForm {
  if (!target) return defaultManyForm();
  return target.kind === 'edit' ? formFromWatch(target.watch) : { ...defaultManyForm(), watching: true };
}

export function NewBatchDialog({ defaults, pipelines, onManagePipelines, busy, error, onCreateMany, onSaveWatch, onClose, browse, previewFolders, watchTarget }: NewBatchDialogProps) {
  const [many, setMany] = useState<ManyForm>(() => initialMany(watchTarget));
  const watchingNow = many.watching;
  const ignoring = ignoresSubfolders(many);
  const preview = useFolderPreview(previewFolders, many.parentFolder, many.pattern, many.outputRoot, 400, !ignoring);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // with the folder picker open, Escape belongs to the picker
      if (event.key === 'Escape' && !document.querySelector('dialog[aria-label="Choose a folder"]')) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setManyForm = (patch: Partial<ManyForm>) =>
    setMany((current) => {
      const next = { ...current, ...patch };
      // the batch name follows the parent folder until it is typed over
      if (patch.parentFolder !== undefined && (current.batchName === '' || current.batchName === folderNameOf(current.parentFolder))) {
        next.batchName = folderNameOf(patch.parentFolder);
      }
      return next;
    });
  const count = ignoring ? 1 : preview.status === 'ready' ? batchesNow(many, preview.data) : 0;
  const ready = ignoring ? manyIsValid(many) : manyIsValid(many) && preview.status === 'ready' && (watchingNow || count > 0);
  const batches = `${count} ${count === 1 ? 'batch' : 'batches'}`;
  const label = (() => {
    if (watchTarget?.kind === 'edit') return busy ? 'Saving…' : 'Save watch';
    if (watchingNow) return busy ? 'Starting…' : count > 0 && many.watchExisting ? `Create ${batches} and start watching` : 'Start watching';
    return busy ? 'Creating…' : count === 0 ? 'Create batches' : `Create ${batches}`;
  })();
  const submit = () => {
    if (watchingNow) onSaveWatch(many, watchTarget?.kind === 'edit' ? watchTarget.watch.id : null);
    else onCreateMany(many);
  };
  const title = watchTarget ? (watchTarget.kind === 'edit' ? 'Edit watch' : 'New watch') : 'New batch';

  return (
    <dialog open aria-label={title} className="modal modal-open">
      <div className="modal-box flex max-h-[90vh] w-[760px] max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7">
        <h2 className="text-h3 font-semibold">{title}</h2>
        <ManyFoldersForm
          form={many}
          onChange={setManyForm}
          defaults={defaults}
          pipelines={pipelines}
          onManagePipelines={onManagePipelines}
          browse={browse}
          preview={preview}
          watch={watchTarget ? (watchTarget.kind === 'edit' ? 'edit' : 'locked') : 'optional'}
        />
        {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !ready} onClick={submit}>
            {label}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
