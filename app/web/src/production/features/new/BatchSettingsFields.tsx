import { FormField } from '../../../shared/components/ui/FormField';
import type { BrowseResult } from '../../../shared/lib/types';
import { secondsHint, sizeHint, type Fit, type OrderBy, type SettingsForm } from '../../lib/presets';
import type { Defaults } from '../../lib/types';
import { FolderField } from './FolderField';
import { Select } from './Select';

const ORDER: { value: OrderBy; label: string }[] = [
  { value: 'capture_time', label: 'Capture time' },
  { value: 'created', label: 'Created date' },
  { value: 'name', label: 'Name' },
  { value: 'duration', label: 'Duration' },
  { value: 'random', label: 'Random' },
];

const FIT: { value: Fit; label: string }[] = [
  { value: 'crop', label: 'Crop to centre' },
  { value: 'blur', label: 'Blurred background' },
];

export interface BatchSettingsFieldsProps {
  value: SettingsForm;
  onChange: (patch: Partial<SettingsForm>) => void;
  defaults: Defaults;
  browse: (path?: string) => Promise<BrowseResult>;
}

/** The settings every batch shares: order, fit, limits, where it runs and where the result goes. */
export function BatchSettingsFields({ value, onChange, defaults, browse }: BatchSettingsFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Order clips by" value={value.orderBy} onChange={(orderBy) => onChange({ orderBy })}>
          {ORDER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select label="Fit different shapes" value={value.fit} onChange={(fit) => onChange({ fit })}>
          {FIT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <FormField label="Max length (seconds)" inputMode="decimal" error={secondsHint(value.maxSeconds) ?? undefined} value={value.maxSeconds} onChange={(event) => onChange({ maxSeconds: event.target.value })} />
        <FormField label="Max size (MB)" inputMode="decimal" error={sizeHint(value.maxSizeMb) ?? undefined} value={value.maxSizeMb} onChange={(event) => onChange({ maxSizeMb: event.target.value })} />
      </div>
      <Select label="Run on" value={value.runOn} onChange={(runOn) => onChange({ runOn })}>
        <option value="any">Any worker</option>
        {defaults.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.label}</option>)}
      </Select>
      <FolderField label="Output folder" value={value.outputRoot} onChange={(outputRoot) => onChange({ outputRoot })} browse={browse} placeholder={defaults.outputRoot} />
      <p className="text-small text-text-2">Leave the output folder empty to use the default. It must be new or empty, and separate from the input folder.</p>
    </>
  );
}
