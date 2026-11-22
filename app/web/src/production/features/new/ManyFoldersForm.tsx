import { FormField } from '../../../shared/components/ui/FormField';
import { Toggle } from '../../../shared/components/ui/Toggle';
import type { BrowseResult } from '../../../shared/lib/types';
import type { PreviewState } from '../../hooks/useFolderPreview';
import { folderNameOf, ignoresSubfolders, PATTERN_PRESETS, type ManyForm } from '../../lib/presets';
import type { Defaults, PipelineChoice } from '../../lib/types';
import { BatchSettingsFields } from './BatchSettingsFields';
import { FolderField } from './FolderField';
import { FolderPreviewList, type WatchReading } from './FolderPreviewList';
import { Select } from './Select';
import { WatchOptions, type WatchOptionsMode } from './WatchOptions';

export interface ManyFoldersFormProps {
  form: ManyForm;
  onChange: (patch: Partial<ManyForm>) => void;
  defaults: Defaults;
  pipelines: PipelineChoice[];
  onManagePipelines?: () => void;
  browse: (path?: string) => Promise<BrowseResult>;
  preview: PreviewState;
  /** undefined: a one-off batch run. Otherwise the watch options are shown in this mode. */
  watch?: WatchOptionsMode;
}

export function ManyFoldersForm({ form, onChange, defaults, pipelines, onManagePipelines, browse, preview, watch }: ManyFoldersFormProps) {
  // A watch that does not batch the folders already there reads them as "already there"; the edit form never does.
  const watching = watch !== undefined && (watch !== 'optional' || form.watching);
  const reading: WatchReading | undefined = watching ? (watch === 'edit' || !form.watchExisting ? 'skip' : 'create') : undefined;
  const willCreate = preview.status === 'ready' ? preview.data.matches.filter((m) => m.status === 'will_create').length : 0;
  const ignoring = ignoresSubfolders(form);
  return (
    <>
      {watching ? null : (
        <FormField
          label="Batch name"
          value={form.batchName}
          placeholder={folderNameOf(form.parentFolder.trim()) || 'The parent folder’s name'}
          helper="Defaults to the parent folder’s name. Type a name to change it."
          onChange={(event) => onChange({ batchName: event.target.value })}
        />
      )}
      <FolderField label="Parent folder" value={form.parentFolder} onChange={(parentFolder) => onChange({ parentFolder })} browse={browse} />
      {watching ? null : (
        <label className="flex items-center gap-3 text-small text-text-2">
          <Toggle label="Ignore subfolders" checked={form.ignoreSubfolders} onChange={(ignoreSubfolders) => onChange({ ignoreSubfolders })} />
          <span>
            <span className="font-semibold text-text">Ignore subfolders</span> · {form.ignoreSubfolders ? 'the parent folder itself is the one card' : 'each subfolder with videos is a card'}
          </span>
        </label>
      )}
      {ignoring ? null : (
        <div className="flex items-end gap-3">
          <FormField
            label="Folder name pattern (regular expression)"
            className="flex-1 font-mono"
            value={form.pattern}
            onChange={(event) => onChange({ presetId: 'custom', pattern: event.target.value })}
          />
          <div className="w-64">
            <Select
              label="Pattern preset"
              value={form.presetId}
              onChange={(id) => onChange({ presetId: id, pattern: PATTERN_PRESETS.find((p) => p.id === id)?.pattern ?? '' })}
            >
              {PATTERN_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </Select>
          </div>
        </div>
      )}
      {watching ? (
        <FormField label="Name each batch" helper="{name} is the folder name. Groups in the pattern are {1}, {2} or {group_name}." value={form.nameTemplate} onChange={(event) => onChange({ nameTemplate: event.target.value })} />
      ) : null}
      {ignoring ? null : (
        <section aria-label="Preview" className="flex flex-col gap-2">
          {preview.status === 'idle' ? <p className="text-small text-text-3">Choose a parent folder to see the folders inside it.</p> : null}
          {preview.status === 'loading' ? <p role="status" className="text-small text-text-3">Looking at the folders…</p> : null}
          {preview.status === 'error' ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{preview.message}</p> : null}
          {preview.status === 'ready' ? (
            <>
              {preview.refreshing ? <p className="text-caption text-text-3">Updating…</p> : null}
              <FolderPreviewList preview={preview.data} watching={reading} />
            </>
          ) : null}
        </section>
      )}
      {watch !== undefined ? <WatchOptions value={form} onChange={onChange} mode={watch} folderCount={willCreate} /> : null}
      <p className="text-caption font-semibold tracking-wide text-text-3">Settings for every batch</p>
      <BatchSettingsFields value={form} onChange={onChange} defaults={defaults} pipelines={pipelines} onManagePipelines={onManagePipelines} browse={browse} showAutoRun={watch === undefined} showFolderTemplate={!watching} />
    </>
  );
}
