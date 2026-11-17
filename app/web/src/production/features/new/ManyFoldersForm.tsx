import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';
import type { PreviewState } from '../../hooks/useFolderPreview';
import { PATTERN_PRESETS, type ManyForm } from '../../lib/presets';
import type { Defaults } from '../../lib/types';
import { BatchSettingsFields } from './BatchSettingsFields';
import { FolderField } from './FolderField';
import { FolderPreviewList } from './FolderPreviewList';
import { Select } from './Select';

export interface ManyFoldersFormProps {
  form: ManyForm;
  onChange: (patch: Partial<ManyForm>) => void;
  defaults: Defaults;
  browse: (path?: string) => Promise<BrowseResult>;
  preview: PreviewState;
}

export function ManyFoldersForm({ form, onChange, defaults, browse, preview }: ManyFoldersFormProps) {
  const toggle = (name: string) => onChange({ include: form.include.includes(name) ? form.include.filter((n) => n !== name) : [...form.include, name] });
  return (
    <>
      <FolderField label="Parent folder" value={form.parentFolder} onChange={(parentFolder) => onChange({ parentFolder })} browse={browse} />
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
      <FormField label="Name each batch" helper="{name} is the folder name. Groups in the pattern are {1}, {2} or {group_name}." value={form.nameTemplate} onChange={(event) => onChange({ nameTemplate: event.target.value })} />
      <section aria-label="Preview" className="flex flex-col gap-2">
        {preview.status === 'idle' ? <p className="text-small text-text-3">Choose a parent folder to see the folders inside it.</p> : null}
        {preview.status === 'loading' ? <p role="status" className="text-small text-text-3">Looking at the folders…</p> : null}
        {preview.status === 'error' ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{preview.message}</p> : null}
        {preview.status === 'ready' ? (
          <>
            {preview.refreshing ? <p className="text-caption text-text-3">Updating…</p> : null}
            <FolderPreviewList preview={preview.data} include={form.include} onToggle={toggle} />
          </>
        ) : null}
      </section>
      <p className="text-caption font-semibold tracking-wide text-text-3">Settings for every batch</p>
      <BatchSettingsFields value={form} onChange={onChange} defaults={defaults} browse={browse} />
    </>
  );
}
