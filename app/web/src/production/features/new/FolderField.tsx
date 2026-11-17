import { FolderOpen, FolderSearch } from 'lucide-react';
import { useState } from 'react';
import { FolderPicker } from '../../../shared/components/FolderPicker';
import { Button } from '../../../shared/components/ui/Button';
import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';

export interface FolderFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  browse: (path?: string) => Promise<BrowseResult>;
  placeholder?: string;
}

export function FolderField({ label, value, onChange, browse, placeholder }: FolderFieldProps) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex items-end gap-3">
      <FormField
        label={label}
        value={value}
        placeholder={placeholder}
        icon={<FolderOpen size={14} aria-hidden="true" />}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1 font-mono"
      />
      <Button icon={<FolderSearch size={15} aria-hidden="true" />} aria-label={`Browse for ${label.toLowerCase()}`} onClick={() => setPicking(true)}>
        Browse…
      </Button>
      {picking ? (
        <FolderPicker
          startPath={value}
          browse={browse}
          onChoose={(path) => {
            onChange(path);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
