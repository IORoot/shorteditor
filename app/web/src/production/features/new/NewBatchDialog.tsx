import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import type { BrowseResult } from '../../../shared/lib/types';
import { useFolderPreview } from '../../hooks/useFolderPreview';
import { createCount, defaultForm, defaultManyForm, isValid, manyIsValid, type ManyForm, type NewBatchForm } from '../../lib/presets';
import type { Defaults, FolderPreview } from '../../lib/types';
import { BatchSettingsFields } from './BatchSettingsFields';
import { FolderField } from './FolderField';
import { ManyFoldersForm } from './ManyFoldersForm';
import { Select } from './Select';

type Mode = 'one' | 'many';

export interface NewBatchDialogProps {
  defaults: Defaults;
  busy: boolean;
  error: string | null;
  onCreate: (form: NewBatchForm) => void;
  onCreateMany: (form: ManyForm) => void;
  onClose: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
  previewFolders: (parentFolder: string, pattern: string, outputRoot?: string) => Promise<FolderPreview>;
}

export function NewBatchDialog({ defaults, busy, error, onCreate, onCreateMany, onClose, browse, previewFolders }: NewBatchDialogProps) {
  const [mode, setMode] = useState<Mode>('one');
  const [form, setForm] = useState<NewBatchForm>(defaultForm);
  const [many, setMany] = useState<ManyForm>(defaultManyForm);
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
  const count = preview.status === 'ready' ? createCount(preview.data, many.include) : 0;
  const ready = mode === 'one' ? isValid(form) : manyIsValid(many) && preview.status === 'ready' && count > 0;
  const label = busy ? 'Creating…' : mode === 'one' ? 'Create batch' : count === 0 ? 'Create batches' : `Create ${count} ${count === 1 ? 'batch' : 'batches'}`;

  return (
    <dialog open aria-label="New batch" className="modal modal-open">
      <div className={`modal-box flex max-h-[90vh] ${mode === 'many' ? 'w-[760px]' : 'w-[560px]'} max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7`}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-h3 font-semibold">{mode === 'one' ? 'New batch' : 'New batches'}</h2>
          <div className="w-72">
            <SegmentedControl
              label="What to create"
              value={mode}
              onChange={setMode}
              options={[{ value: 'one', label: 'One folder' }, { value: 'many', label: 'Folders inside a folder' }]}
            />
          </div>
        </div>
        {mode === 'one' ? (
          <>
            <FormField label="Name" autoFocus placeholder="e.g. Coach Saturdays – 14 Nov" value={form.name} onChange={(event) => set({ name: event.target.value })} />
            <FolderField label="Input folder" value={form.inputFolder} onChange={(inputFolder) => set({ inputFolder })} browse={browse} />
            <Select label="Pipeline" value="join" onChange={() => undefined}>
              <option value="join">Join clips</option>
              <option value="action" disabled>Action clips (coming with AI detect)</option>
            </Select>
            <BatchSettingsFields value={form} onChange={set} defaults={defaults} browse={browse} />
          </>
        ) : (
          <ManyFoldersForm form={many} onChange={setManyForm} defaults={defaults} browse={browse} preview={preview} />
        )}
        {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !ready} onClick={() => (mode === 'one' ? onCreate(form) : onCreateMany(many))}>
            {label}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
