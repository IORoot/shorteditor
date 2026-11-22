import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import type { BrowseResult } from '../../../shared/lib/types';
import { useFolderPreview } from '../../hooks/useFolderPreview';
import { batchesNow, defaultManyForm, folderNameOf, ignoresSubfolders, manyIsValid, type ManyForm } from '../../lib/presets';
import type { Defaults, FolderPreview, PipelineChoice } from '../../lib/types';
import { ManyFoldersForm } from './ManyFoldersForm';

export interface NewBatchDialogProps {
  defaults: Defaults;
  pipelines: PipelineChoice[];
  onManagePipelines?: () => void;
  busy: boolean;
  error: string | null;
  onCreateMany: (form: ManyForm) => void;
  onClose: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
  previewFolders: (parentFolder: string, pattern: string, outputRoot?: string) => Promise<FolderPreview>;
}

export function NewBatchDialog({ defaults, pipelines, onManagePipelines, busy, error, onCreateMany, onClose, browse, previewFolders }: NewBatchDialogProps) {
  const [many, setMany] = useState<ManyForm>(defaultManyForm);
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
    if (watchingNow) return busy ? 'Starting…' : 'Create batch and start watching';
    return busy ? 'Creating…' : count === 0 ? 'Create batches' : `Create ${batches}`;
  })();
  const submit = () => {
    onCreateMany(many);
  };
  const title = 'New batch';

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
          watch="optional"
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
