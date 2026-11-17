import { Button } from '../../../shared/components/ui/Button';
import type { BrowseResult } from '../../../shared/lib/types';
import type { SettingsForm } from '../../lib/presets';
import type { Defaults, PipelineChoice } from '../../lib/types';
import { FolderField } from './FolderField';
import { Select } from './Select';

export interface BatchSettingsFieldsProps {
  value: SettingsForm;
  onChange: (patch: Partial<SettingsForm>) => void;
  defaults: Defaults;
  /** The switched-on pipelines. The steps themselves are edited on the Pipeline tab. */
  pipelines: PipelineChoice[];
  onManagePipelines?: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
}

/** What every batch in the form shares: its pipeline, where it runs and where the result goes. */
export function BatchSettingsFields({ value, onChange, defaults, pipelines, onManagePipelines, browse }: BatchSettingsFieldsProps) {
  return (
    <>
      {pipelines.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-small text-text-2">No pipelines are switched on yet. Make or switch one on first.</p>
          {onManagePipelines ? <Button onClick={onManagePipelines}>Manage pipelines</Button> : null}
        </div>
      ) : (
        <Select label="Pipeline" value={value.pipelineId === null ? '' : String(value.pipelineId)} onChange={(id) => onChange({ pipelineId: id === '' ? null : Number(id) })}>
          <option value="">Choose a pipeline</option>
          {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </Select>
      )}
      <Select label="Run on" value={value.runOn} onChange={(runOn) => onChange({ runOn })}>
        <option value="any">Any worker</option>
        {defaults.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.label}</option>)}
      </Select>
      <FolderField label="Output folder" value={value.outputRoot} onChange={(outputRoot) => onChange({ outputRoot })} browse={browse} placeholder={defaults.outputRoot} />
      <p className="text-small text-text-2">Leave the output folder empty to use the default. It must be new or empty, and separate from the input folder.</p>
    </>
  );
}
