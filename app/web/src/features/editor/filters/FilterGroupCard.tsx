import { Plus, Trash2 } from 'lucide-react';
import type { FilterGroup } from '../../../lib/types';
import { newRule, removeAt, replaceAt } from '../../../lib/filters';
import { FilterRuleRow } from './FilterRuleRow';

export interface FilterGroupCardProps {
  index: number;
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
  onRemove: () => void;
}

export function FilterGroupCard({ index, group, onChange, onRemove }: FilterGroupCardProps) {
  return (
    <div role="group" aria-label={`Group ${index + 1}`} className="flex flex-col gap-3 rounded-[14px] border border-line bg-base-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-small font-semibold">Group {index + 1}</span>
          <span className="text-caption text-text-2">match all rules</span>
        </div>
        <button type="button" onClick={onRemove} className="flex items-center gap-1.5 text-caption font-medium text-text-3">
          <Trash2 size={14} aria-hidden="true" />
          Remove group
        </button>
      </div>
      {group.rules.length === 0 ? <p className="text-caption text-text-3">No rules yet. An empty group is ignored.</p> : null}
      {group.rules.map((rule, i) => (
        <FilterRuleRow
          key={i}
          rule={rule}
          onChange={(next) => onChange({ rules: replaceAt(group.rules, i, next) })}
          onRemove={() => onChange({ rules: removeAt(group.rules, i) })}
        />
      ))}
      <button type="button" onClick={() => onChange({ rules: [...group.rules, newRule()] })} className="flex items-center gap-1.5 self-start text-small font-semibold text-primary">
        <Plus size={14} aria-hidden="true" />
        Add rule
      </button>
    </div>
  );
}
