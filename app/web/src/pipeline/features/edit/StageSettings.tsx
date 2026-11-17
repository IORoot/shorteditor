import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '../../../shared/components/ui/Button';
import { Checkbox } from '../../../shared/components/ui/Checkbox';
import { FormField } from '../../../shared/components/ui/FormField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { fieldsOf, toText, type Field } from '../../lib/schemaForm';
import { iconOf } from '../../lib/stageMeta';
import type { StageInfo, StageStep } from '../../lib/types';

export interface StageSettingsProps {
  step: StageStep;
  info: StageInfo | undefined;
  position: number;
  total: number;
  /** Text the user is typing, by field name, with its problem if any. */
  drafts: Record<string, string>;
  problems: Record<string, string>;
  onText: (field: Field, text: string) => void;
  onValue: (field: Field, value: unknown) => void;
  onToggle: (enabled: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** "drop_shortest" reads as "Drop shortest". */
const sentence = (choice: string): string => {
  const words = choice.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function StageSettings({ step, info, position, total, drafts, problems, onText, onValue, onToggle, onMove, onRemove }: StageSettingsProps) {
  const title = info?.title ?? 'Missing stage';
  const Icon = iconOf(step.key);
  return (
    <section aria-label="Settings" className="flex flex-col gap-5 rounded-[14px] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <Icon size={18} aria-hidden="true" className="text-primary" />
            <h2 className="text-h3 font-semibold">{title}</h2>
          </div>
          <span className="text-caption text-text-3">Step {position} of {total}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Toggle label={`Use ${title}`} checked={step.enabled} onChange={onToggle} />
          <Button variant="ghost" aria-label={`Move ${title} up`} disabled={position === 1} onClick={() => onMove(-1)} icon={<ArrowUp size={14} aria-hidden="true" />} />
          <Button variant="ghost" aria-label={`Move ${title} down`} disabled={position === total} onClick={() => onMove(1)} icon={<ArrowDown size={14} aria-hidden="true" />} />
          <Button variant="ghost" aria-label={`Remove ${title}`} onClick={onRemove} icon={<X size={14} aria-hidden="true" />} />
        </div>
      </div>
      {info ? <p className="text-small text-text-2">{info.description}</p> : (
        <>
          <p className="text-small text-text-2">There is no stage called {step.key} any more. Remove it, or restore its file.</p>
          <pre className="overflow-x-auto rounded-xl bg-fill-2 p-3 font-mono text-caption">{JSON.stringify(step.settings, null, 2)}</pre>
        </>
      )}
      {info ? <div className="flex flex-wrap items-end gap-5">{fieldsOf(info.settingsSchema).map((field) => renderField(field, step, drafts, problems, onText, onValue))}</div> : null}
    </section>
  );
}

function renderField(field: Field, step: StageStep, drafts: Record<string, string>, problems: Record<string, string>, onText: (field: Field, text: string) => void, onValue: (field: Field, value: unknown) => void) {
  const value = step.settings[field.name];
  if (field.kind === 'boolean') return <Checkbox key={field.name} label={field.label} checked={value === undefined ? field.defaultValue === true : value === true} onChange={(on) => onValue(field, on)} />;
  if (field.kind === 'choice') {
    const options = [...(field.nullable ? [{ value: '', label: 'Ask me' }] : []), ...field.choices.map((choice) => ({ value: choice, label: sentence(choice) }))];
    const current = (value as string | null | undefined) ?? (field.nullable ? '' : String(field.defaultValue));
    return (
      <div key={field.name} className="flex w-full flex-col gap-2">
        <span className="text-caption font-semibold text-text-2">{field.label}</span>
        <SegmentedControl label={field.label} options={options} value={current} onChange={(next) => onValue(field, next === '' ? null : next)} />
      </div>
    );
  }
  if (field.kind === 'readonly') {
    return (
      <div key={field.name} className="flex w-full flex-col gap-1.5">
        <span className="text-caption font-semibold text-text-2">{field.label}</span>
        <code className="rounded-lg bg-fill-2 px-3 py-2 font-mono text-caption">{JSON.stringify(value ?? field.defaultValue ?? null)}</code>
        <span className="text-caption text-text-3">This setting cannot be edited here yet.</span>
      </div>
    );
  }
  if (field.kind === 'text' && field.multiline) {
    return (
      <label key={field.name} className="flex w-full flex-col gap-1.5">
        <span className="text-caption font-semibold text-text-2">{field.label}</span>
        <textarea
          id={`f-${field.name}`}
          rows={6}
          value={drafts[field.name] ?? toText(field, value)}
          onChange={(event) => onText(field, event.target.value)}
          className="w-full rounded-xl bg-fill-2 px-3 py-2 font-mono text-caption focus:outline-none"
        />
        {problems[field.name] ? <span className="text-caption text-bad">{problems[field.name]}</span> : null}
      </label>
    );
  }
  return (
    <FormField
      key={field.name}
      label={field.label}
      id={`f-${field.name}`}
      value={drafts[field.name] ?? toText(field, value)}
      placeholder={field.nullable && field.kind !== 'text' ? 'No limit' : undefined}
      error={problems[field.name]}
      className="w-[220px]"
      onChange={(event) => onText(field, event.target.value)}
    />
  );
}
