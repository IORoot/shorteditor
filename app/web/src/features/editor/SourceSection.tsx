import { KeyRound, Server, User } from 'lucide-react';
import type { CollectorConfig, SourceType } from '../../lib/types';
import { FormField } from '../../components/ui/FormField';
import { SectionCard } from '../../components/ui/SectionCard';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { FolderField } from './FolderField';

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'local', label: 'Local folder' },
  { value: 'ssh', label: 'SSH' },
];

export interface SourceSectionProps {
  config: CollectorConfig;
  onChange: (config: CollectorConfig) => void;
  onBrowseInput: () => void;
}

export function SourceSection({ config, onChange, onBrowseInput }: SourceSectionProps) {
  const set = (patch: Partial<CollectorConfig>) => onChange({ ...config, ...patch });
  const isSsh = config.sourceType === 'ssh';
  return (
    <SectionCard title="Source" description="Where clips are collected from. Local folders and SSH hosts are supported.">
      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold text-text-2">Source type</span>
        <SegmentedControl label="Source type" options={SOURCE_OPTIONS} value={config.sourceType} onChange={(sourceType) => set({ sourceType })} />
      </div>
      {isSsh ? (
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Host" value={config.host} icon={<Server size={14} aria-hidden="true" />} className="font-mono" onChange={(e) => set({ host: e.target.value })} />
          <FormField label="User" value={config.user} icon={<User size={14} aria-hidden="true" />} onChange={(e) => set({ user: e.target.value })} />
          <FormField label="Key path" value={config.keyPath} icon={<KeyRound size={14} aria-hidden="true" />} className="font-mono" onChange={(e) => set({ keyPath: e.target.value })} />
        </div>
      ) : null}
      <FolderField
        label="Input folder"
        value={config.inputFolder}
        onChange={(inputFolder) => set({ inputFolder })}
        onBrowse={onBrowseInput}
        browseDisabled={isSsh}
        helper={isSsh ? 'Browsing SSH folders is not available yet. Type the path on the host.' : undefined}
      />
      <p className="text-caption text-text-3">Checked before every run. If the folder is unreachable, the run fails and nothing is touched.</p>
    </SectionCard>
  );
}
