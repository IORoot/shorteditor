import { X } from 'lucide-react';
import type { FilterRule, RuleKind } from '../../../lib/types';
import { DATE_KINDS, RULE_KINDS, TEXT_KINDS, newRule } from '../../../lib/filters';
import { DateSourceSelect, FilenamePatternField } from '../DateSourceFields';
import { SelectField } from '../../../components/ui/SelectField';
import { RuleInputs } from './RuleInputs';

export interface FilterRuleRowProps {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}

export function FilterRuleRow({ rule, onChange, onRemove }: FilterRuleRowProps) {
  const changeKind = (kind: RuleKind) =>
    onChange({ ...newRule(kind, rule.exclude), caseSensitive: rule.caseSensitive, dateSource: rule.dateSource, filenamePattern: rule.filenamePattern });
  const isText = TEXT_KINDS.includes(rule.kind);
  const isDate = DATE_KINDS.includes(rule.kind);
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
      {isText ? (
        <button
          type="button"
          aria-pressed={rule.caseSensitive}
          aria-label="Match case"
          title="Match case"
          onClick={() => onChange({ ...rule, caseSensitive: !rule.caseSensitive })}
          className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-lg border text-small font-semibold ${rule.caseSensitive ? 'border-primary bg-accent-soft text-primary' : 'border-line bg-surface text-text-3'}`}
        >
          Aa
        </button>
      ) : null}
      {isDate ? (
        <DateSourceSelect label="Date from" value={rule.dateSource} surface onChange={(dateSource) => onChange({ ...rule, dateSource })} />
      ) : null}
      {isDate && rule.dateSource === 'filename' ? (
        <FilenamePatternField label="Filename pattern" value={rule.filenamePattern} onChange={(filenamePattern) => onChange({ ...rule, filenamePattern })} />
      ) : null}
      <button type="button" aria-label="Remove rule" onClick={onRemove} className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-fill-2">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
