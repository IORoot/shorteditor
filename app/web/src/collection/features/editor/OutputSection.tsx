import { useRef } from 'react';
import { FolderTree, Tag } from 'lucide-react';
import type { CollectorConfig, GroupBy, Transfer } from '../../lib/types';
import { insertToken } from '../../lib/tokens';
import { FormField } from '../../../components/ui/FormField';
import { SectionCard } from '../../../components/ui/SectionCard';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FolderField } from './FolderField';
import { DateSourceSelect, FilenamePatternField } from './DateSourceFields';
import { TokenRow } from './TokenRow';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const TRANSFER_OPTIONS: { value: Transfer; label: string }[] = [
  { value: 'move', label: 'Move' },
  { value: 'copy', label: 'Copy' },
  { value: 'link', label: 'Link' },
];

export interface OutputSectionProps {
  config: CollectorConfig;
  onChange: (config: CollectorConfig) => void;
  onBrowseOutput: () => void;
}

export function OutputSection({ config, onChange, onBrowseOutput }: OutputSectionProps) {
  const templateRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<CollectorConfig>) => onChange({ ...config, ...patch });

  const insert = (token: string) => {
    const input = templateRef.current;
    const length = config.folderTemplate.length;
    const result = insertToken(config.folderTemplate, token, input?.selectionStart ?? length, input?.selectionEnd ?? length);
    set({ folderTemplate: result.value });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  return (
    <SectionCard title="Output" description="Where clips land. Build the folder structure with tokens; nested paths are allowed.">
      <FolderField label="Output folder" value={config.outputFolder} onChange={(outputFolder) => set({ outputFolder })} onBrowse={onBrowseOutput} />
      <FormField
        ref={templateRef}
        label="Folder structure"
        value={config.folderTemplate}
        icon={<FolderTree size={14} aria-hidden="true" />}
        className="font-mono"
        onChange={(event) => set({ folderTemplate: event.target.value })}
      />
      <TokenRow onInsert={insert} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-text-2">Date for folder names</span>
          <DateSourceSelect label="Folder date" value={config.dateSource} onChange={(dateSource) => set({ dateSource })} />
        </div>
        {config.dateSource === 'filename' ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold text-text-2">Filename pattern</span>
            <FilenamePatternField label="Folder filename pattern" value={config.filenamePattern} onChange={(filenamePattern) => set({ filenamePattern })} />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-text-2">Group by</span>
          <SegmentedControl label="Group by" options={GROUP_OPTIONS} value={config.groupBy} onChange={(groupBy) => set({ groupBy })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-text-2">Transfer</span>
          <SegmentedControl label="Transfer" options={TRANSFER_OPTIONS} value={config.transfer} onChange={(transfer) => set({ transfer })} />
        </div>
      </div>
      <FormField label="Suffix" value={config.suffix} icon={<Tag size={14} aria-hidden="true" />} className="w-60" onChange={(event) => set({ suffix: event.target.value })} />
    </SectionCard>
  );
}
