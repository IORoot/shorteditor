import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';
import type { SettingsForm } from '../../lib/presets';
import type { Batch, BatchUpdate, Defaults, PipelineChoice } from '../../lib/types';
import { BatchSettingsFields } from '../new/BatchSettingsFields';

export interface EditBatchDialogProps {
  batch: Batch;
  defaults: Defaults;
  pipelines: PipelineChoice[];
  browse: (path?: string) => Promise<BrowseResult>;
  busy: boolean;
  error: string | null;
  /** Called with only the settings that changed. */
  onSave: (patch: BatchUpdate) => void;
  onClose: () => void;
}

/** Everything a batch is set up with, except its input folder: its name, pipeline, worker, output folder, folder name and auto run. */
export function EditBatchDialog({ batch, defaults, pipelines, browse, busy, error, onSave, onClose }: EditBatchDialogProps) {
  const [name, setName] = useState(batch.name);
  const [settings, setSettings] = useState<SettingsForm>({ outputRoot: batch.outputRoot, folderTemplate: batch.folderTemplate, runOn: batch.runOn, pipelineId: batch.pipelineId, autoRun: batch.autoRun });
  const set = (patch: Partial<SettingsForm>) => setSettings((current) => ({ ...current, ...patch }));
  const valid = name.trim() !== '';

  const save = () => {
    const patch: BatchUpdate = {};
    if (name.trim() !== batch.name) patch.name = name.trim();
    if (settings.pipelineId !== null && settings.pipelineId !== batch.pipelineId) patch.pipelineId = settings.pipelineId;
    if (settings.runOn !== batch.runOn) patch.runOn = settings.runOn;
    if (settings.outputRoot.trim() !== '' && settings.outputRoot.trim() !== batch.outputRoot) patch.outputRoot = settings.outputRoot.trim();
    if (settings.folderTemplate.trim() !== '' && settings.folderTemplate !== batch.folderTemplate) patch.folderTemplate = settings.folderTemplate;
    if (settings.autoRun !== batch.autoRun) patch.autoRun = settings.autoRun;
    onSave(patch);
  };

  return (
    <dialog open aria-label="Edit batch" className="modal modal-open">
      <form
        className="modal-box flex max-h-[90vh] w-[760px] max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) save();
        }}
      >
        <h2 className="text-h3 font-semibold">Edit batch</h2>
        <FormField label="Batch name" value={name} onChange={(event) => setName(event.target.value)} />
        <p className="break-words text-small text-text-2">
          Input folder <span className="font-mono text-text">{batch.inputFolder}</span>. To use another input folder, make a new batch.
        </p>
        <BatchSettingsFields value={settings} onChange={set} defaults={defaults} pipelines={pipelines} browse={browse} showAutoRun showFolderTemplate inputFolder={batch.inputFolder} />
        <p className="text-caption text-text-3">The pipeline and worker apply from the next run, and can change only while no card is waiting or running. The output folder and folder name can change only before any card has a finished video.</p>
        {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || !valid}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </dialog>
  );
}
