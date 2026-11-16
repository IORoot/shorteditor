import { X } from 'lucide-react';
import type { FilterRule, RuleKind } from '../../../lib/types';
import { RULE_KINDS, newRule } from '../../../lib/filters';
import { SelectField } from '../../../components/ui/SelectField';
import { RuleInputs } from './RuleInputs';

export interface FilterRuleRowProps {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}

export function FilterRuleRow({ rule, onChange, onRemove }: FilterRuleRowProps) {
  const changeKind = (kind: RuleKind) => onChange(newRule(kind, rule.exclude));
  return (
    <div className="flex items-center gap-2.5">
      <SelectField
        label="Include or exclude"
        className="w-28"
        surface
        value={rule.exclude ? 'exclude' : 'include'}
        options={[{ value: 'include', label: 'Include' }, { value: 'exclude', label: 'Exclude' }]}
        onChange={(mode) => onChange({ ...rule, exclude: mode === 'exclude' })}
      />
      <SelectField label="Rule type" className="w-44" surface value={rule.kind} options={RULE_KINDS} onChange={changeKind} />
      <RuleInputs rule={rule} onChange={onChange} />
      <button type="button" aria-label="Remove rule" onClick={onRemove} className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-fill-2">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
