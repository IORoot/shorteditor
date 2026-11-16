import { FolderOpen, FolderSearch } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';

export interface FolderFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
  browseDisabled?: boolean;
  helper?: string;
}

export function FolderField({ label, value, onChange, onBrowse, browseDisabled = false, helper }: FolderFieldProps) {
  return (
    <div className="flex items-end gap-3">
      <FormField
        label={label}
        value={value}
        helper={helper}
        icon={<FolderOpen size={14} aria-hidden="true" />}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1 font-mono"
      />
      <Button icon={<FolderSearch size={15} aria-hidden="true" />} onClick={onBrowse} disabled={browseDisabled} aria-label={`Browse for ${label.toLowerCase()}`}>
        Browse…
      </Button>
    </div>
  );
}
