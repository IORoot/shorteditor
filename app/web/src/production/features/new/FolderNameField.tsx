import { FormField } from '../../../shared/components/ui/FormField';
import { DEFAULT_FOLDER_TEMPLATE, folderTemplateError, previewFolderName } from '../../lib/folderTemplate';

export interface FolderNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The batch's output folder, shown before the folder name in the preview. */
  outputRoot: string;
}

/** The folder name under the output folder, as a template with tags. The preview uses a sample batch. */
export function FolderNameField({ value, onChange, outputRoot }: FolderNameFieldProps) {
  const template = value.trim() || DEFAULT_FOLDER_TEMPLATE;
  const error = folderTemplateError(value);
  const folder = previewFolderName(template, 'My batch', 12, new Date().toISOString().slice(0, 10));
  const base = outputRoot.trim() || 'the default output folder';
  return (
    <div className="flex flex-col gap-2">
      <FormField
        label="Folder name"
        value={value}
        placeholder={DEFAULT_FOLDER_TEMPLATE}
        onChange={(event) => onChange(event.target.value)}
        error={error ?? undefined}
        helper={error ? undefined : 'Tags: {{name}} the batch name, {{id}} its number, {{date}} the day it was made. Use {{id}} so each batch gets its own folder.'}
        className="font-mono"
      />
      {error ? null : (
        <p className="break-words text-caption text-text-2">
          Videos go in <span className="font-mono text-text">{base}/{folder}/pass-1</span>
        </p>
      )}
    </div>
  );
}
