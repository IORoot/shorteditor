import { Checkbox } from '../../../shared/components/ui/Checkbox';
import { FormField } from '../../../shared/components/ui/FormField';
import { fieldsOf, toText, type Field } from '../../lib/schemaForm';
import type { StageInfo, StageStep } from '../../lib/types';

export interface StageSettingsProps {
  step: StageStep;
  info: StageInfo | undefined;
  /** Text the user is typing, by field name, with its problem if any. */
  drafts: Record<string, string>;
  problems: Record<string, string>;
  onText: (field: Field, text: string) => void;
  onValue: (field: Field, value: unknown) => void;
}

export function StageSettings({ step, info, drafts, problems, onText, onValue }: StageSettingsProps) {
  if (!info) {
    return (
      <section aria-label="Settings" className="flex flex-1 flex-col gap-3 rounded-[20px] bg-surface p-6">
        <h2 className="text-h3 font-semibold">Missing stage</h2>
        <p className="text-small text-text-2">There is no stage called {step.key} any more. Remove it, or restore its file.</p>
        <pre className="overflow-x-auto rounded-xl bg-fill-2 p-3 font-mono text-caption">{JSON.stringify(step.settings, null, 2)}</pre>
      </section>
    );
  }
  return (
    <section aria-label="Settings" className="flex flex-1 flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h2 className="text-h3 font-semibold">{info.title}</h2>
      {fieldsOf(info.settingsSchema).map((field) => {
        const value = step.settings[field.name];
        const label = field.label;
        if (field.kind === 'boolean') return <Checkbox key={field.name} label={label} checked={value === undefined ? field.defaultValue === true : value === true} onChange={(on) => onValue(field, on)} />;
        if (field.kind === 'choice') {
          const empty = field.nullable ? 'Ask each time' : null;
          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              <label htmlFor={`f-${field.name}`} className="text-caption font-semibold text-text-2">{label}</label>
              <select id={`f-${field.name}`} value={(value as string | null | undefined) ?? (field.nullable ? '' : String(field.defaultValue))} onChange={(event) => onValue(field, event.target.value === '' ? null : event.target.value)} className="select select-sm w-64 rounded-[10px] border-0 bg-fill-2 text-small">
                {empty ? <option value="">{empty}</option> : null}
                {field.choices.map((choice) => <option key={choice} value={choice}>{choice.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          );
        }
        if (field.kind === 'readonly') {
          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              <span className="text-caption font-semibold text-text-2">{label}</span>
              <code className="rounded-lg bg-fill-2 px-3 py-2 font-mono text-caption">{JSON.stringify(value ?? field.defaultValue ?? null)}</code>
              <span className="text-caption text-text-3">This setting cannot be edited here yet.</span>
            </div>
          );
        }
        const placeholder = field.nullable && field.kind !== 'text' ? 'No limit' : undefined;
        return (
          <FormField
            key={field.name}
            label={label}
            id={`f-${field.name}`}
            value={drafts[field.name] ?? toText(field, value)}
            placeholder={placeholder}
            error={problems[field.name]}
            className="max-w-sm"
            onChange={(event) => onText(field, event.target.value)}
          />
        );
      })}
    </section>
  );
}
