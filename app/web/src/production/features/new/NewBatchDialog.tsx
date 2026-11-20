import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import type { BrowseResult } from '../../../shared/lib/types';
import { useFolderPreview } from '../../hooks/useFolderPreview';
import { batchesNow, defaultForm, defaultManyForm, formFromWatch, isValid, manyIsValid, type ManyForm, type NewBatchForm } from '../../lib/presets';
import type { Defaults, FolderPreview, PipelineChoice, WatchView } from '../../lib/types';
import { BatchSettingsFields } from './BatchSettingsFields';
import { FolderField } from './FolderField';
import { ManyFoldersForm } from './ManyFoldersForm';

type Mode = 'one' | 'many';

/** Opened from the Watches panel: adding a new watch, or changing a saved one. Watch-only, no one-off mode. */
export type WatchTarget = { kind: 'add' } | { kind: 'edit'; watch: WatchView };

export interface NewBatchDialogProps {
  defaults: Defaults;
  pipelines: PipelineChoice[];
  onManagePipelines?: () => void;
  busy: boolean;
  error: string | null;
  onCreate: (form: NewBatchForm) => void;
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

export function NewBatchDialog({ defaults, pipelines, onManagePipelines, busy, error, onCreate, onCreateMany, onSaveWatch, onClose, browse, previewFolders, watchTarget }: NewBatchDialogProps) {
  const [mode, setMode] = useState<Mode>(watchTarget ? 'many' : 'one');
  const [form, setForm] = useState<NewBatchForm>(defaultForm);
  const [many, setMany] = useState<ManyForm>(() => initialMany(watchTarget));
  const preview = useFolderPreview(previewFolders, many.parentFolder, many.pattern, many.outputRoot, 400, mode === 'many');
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

  const set = (patch: Partial<NewBatchForm>) => setForm((current) => ({ ...current, ...patch }));
  const setManyForm = (patch: Partial<ManyForm>) => setMany((current) => ({ ...current, ...patch }));
  const watchingNow = mode === 'many' && many.watching;
  const count = preview.status === 'ready' ? batchesNow(many, preview.data) : 0;
  const ready = mode === 'one'
    ? isValid(form)
    : manyIsValid(many) && preview.status === 'ready' && (watchingNow || count > 0);
  const batches = `${count} ${count === 1 ? 'batch' : 'batches'}`;
  const label = (() => {
    if (mode === 'one') return busy ? 'Creating…' : 'Create batch';
    if (watchTarget?.kind === 'edit') return busy ? 'Saving…' : 'Save watch';
    if (watchingNow) return busy ? 'Starting…' : count > 0 && many.watchExisting ? `Create ${batches} and start watching` : 'Start watching';
    return busy ? 'Creating…' : count === 0 ? 'Create batches' : `Create ${batches}`;
  })();
  const submit = () => {
    if (mode === 'one') onCreate(form);
    else if (watchingNow) onSaveWatch(many, watchTarget?.kind === 'edit' ? watchTarget.watch.id : null);
    else onCreateMany(many);
  };
  const title = watchTarget ? (watchTarget.kind === 'edit' ? 'Edit watch' : 'New watch') : mode === 'one' ? 'New batch' : 'New batches';

  return (
    <dialog open aria-label={watchTarget ? title : 'New batch'} className="modal modal-open">
      <div className={`modal-box flex max-h-[90vh] ${mode === 'many' ? 'w-[760px]' : 'w-[560px]'} max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7`}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-h3 font-semibold">{title}</h2>
          {watchTarget ? null : (
            <div className="w-72">
              <SegmentedControl
                label="What to create"
                value={mode}
                onChange={setMode}
                options={[{ value: 'one', label: 'One folder' }, { value: 'many', label: 'Subfolders' }]}
              />
            </div>
          )}
        </div>
        {mode === 'one' ? (
          <>
            <FormField label="Name" autoFocus placeholder="e.g. Coach Saturdays – 14 Nov" value={form.name} onChange={(event) => set({ name: event.target.value })} />
            <FolderField label="Input folder" value={form.inputFolder} onChange={(inputFolder) => set({ inputFolder })} browse={browse} />
            <BatchSettingsFields value={form} onChange={set} defaults={defaults} pipelines={pipelines} onManagePipelines={onManagePipelines} browse={browse} showAutoRun={!watchingNow} />
          </>
        ) : (
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
        )}
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
