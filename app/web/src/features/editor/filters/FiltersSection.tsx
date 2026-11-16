import { Plus } from 'lucide-react';
import type { CollectorConfig } from '../../../lib/types';
import { newGroup, removeAt, replaceAt } from '../../../lib/filters';
import { SectionCard } from '../../../components/ui/SectionCard';
import { FilterGroupCard } from './FilterGroupCard';
import { RandomSelectionField } from './RandomSelectionField';

export interface FiltersSectionProps {
  config: CollectorConfig;
  onChange: (config: CollectorConfig) => void;
}

export function FiltersSection({ config, onChange }: FiltersSectionProps) {
  const set = (patch: Partial<CollectorConfig>) => onChange({ ...config, ...patch });
  return (
    <SectionCard
      title="Filters"
      description="A clip is collected if it matches any group. Inside a group, every rule must match. Clips that don’t match stay where they are."
    >
      {config.filters.length === 0 ? (
        <p className="text-small text-text-3">No filters: every video file in the input folder is collected.</p>
      ) : null}
      {config.filters.map((group, index) => (
        <div key={index} className="flex flex-col gap-3">
          {index > 0 ? (
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              <span className="text-label font-semibold tracking-[0.8px] text-text-3">OR</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ) : null}
          <FilterGroupCard
            index={index}
            group={group}
            onChange={(next) => set({ filters: replaceAt(config.filters, index, next) })}
            onRemove={() => set({ filters: removeAt(config.filters, index) })}
          />
        </div>
      ))}
      <button type="button" onClick={() => set({ filters: [...config.filters, newGroup()] })} className="flex items-center gap-1.5 self-start text-small font-semibold text-primary">
        <Plus size={14} aria-hidden="true" />
        Add group
      </button>
      <RandomSelectionField value={config.randomSelection} onChange={(randomSelection) => set({ randomSelection })} />
    </SectionCard>
  );
}
