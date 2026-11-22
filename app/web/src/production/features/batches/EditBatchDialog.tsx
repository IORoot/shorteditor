import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { defaultManyForm, wholeHint, type ManyForm, type SettingsForm } from '../../lib/presets';
import type { Batch, BatchUpdate, Defaults, PipelineChoice } from '../../lib/types';
import { BatchSettingsFields } from '../new/BatchSettingsFields';
import { WatchOptions } from '../new/WatchOptions';

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
  const [watching, setWatching] = useState(batch.watching ?? false);
  const [timing, setTiming] = useState({ intervalMinutes: String(batch.watchIntervalMinutes ?? 5), settleMinutes: String(batch.watchSettleMinutes ?? 10), maxPerCheck: String(batch.watchMaxPerCheck ?? 20) });
  const canWatch = batch.folderPattern !== undefined && batch.folderPattern !== null;
  const timingOk = wholeHint(timing.intervalMinutes, 1, 1440) === null && wholeHint(timing.settleMinutes, 0, 1440) === null && wholeHint(timing.maxPerCheck, 1, 100) === null;
  const valid = name.trim() !== '' && (!watching || timingOk);

  const save = () => {
    const patch: BatchUpdate = {};
    if (name.trim() !== batch.name) patch.name = name.trim();
    if (settings.pipelineId !== null && settings.pipelineId !== batch.pipelineId) patch.pipelineId = settings.pipelineId;
    if (settings.runOn !== batch.runOn) patch.runOn = settings.runOn;
    if (settings.outputRoot.trim() !== '' && settings.outputRoot.trim() !== batch.outputRoot) patch.outputRoot = settings.outputRoot.trim();
    if (settings.folderTemplate.trim() !== '' && settings.folderTemplate !== batch.folderTemplate) patch.folderTemplate = settings.folderTemplate;
    if (settings.autoRun !== batch.autoRun) patch.autoRun = settings.autoRun;
    if (canWatch) {
      if (watching !== (batch.watching ?? false)) patch.watching = watching;
      if (watching) {
        if (Number(timing.intervalMinutes) !== (batch.watchIntervalMinutes ?? 5)) patch.watchIntervalMinutes = Number(timing.intervalMinutes);
        if (Number(timing.settleMinutes) !== (batch.watchSettleMinutes ?? 10)) patch.watchSettleMinutes = Number(timing.settleMinutes);
        if (Number(timing.maxPerCheck) !== (batch.watchMaxPerCheck ?? 20)) patch.watchMaxPerCheck = Number(timing.maxPerCheck);
      }
    }
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
        {canWatch ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-[14px] bg-fill-2 px-3.5 py-3">
              <span className="text-body font-semibold">Keep watching this folder</span>
              <Toggle label="Keep watching this folder" checked={watching} onChange={setWatching} />
            </div>
            {watching ? <WatchOptions value={{ ...defaultManyForm(), watching: true, ...timing } as ManyForm} onChange={(patch) => setTiming((current) => ({ ...current, ...patch }))} mode="edit" folderCount={0} /> : null}
          </div>
        ) : (
          <p className="text-small text-text-3">Only a batch made from subfolders can watch its folder.</p>
        )}
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
