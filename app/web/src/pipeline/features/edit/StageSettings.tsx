import { ArrowDown, ArrowUp, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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

/** Every field is this wide, so the column lines up down the page. */
const COLUMN = 'w-full max-w-[420px]';
/** The label above every control, the same for every kind of field. */
const LABEL = 'font-sans text-caption font-semibold text-text-2';

/** "drop_shortest" reads as "Drop shortest". */
const sentence = (choice: string): string => {
  const words = choice.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One size and style for every small action in the panel, so they line up. */
function IconButton({ label, icon: Icon, disabled, onClick }: { label: string; icon: LucideIcon; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-fill-2 disabled:opacity-40">
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

export function StageSettings({ step, info, position, total, drafts, problems, onText, onValue, onToggle, onMove, onRemove }: StageSettingsProps) {
  const title = info?.title ?? 'Missing stage';
  const Icon = iconOf(step.key);
  return (
    <section aria-label="Settings" className="flex flex-col gap-5 rounded-[14px] bg-surface p-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-h3 font-semibold">{title}</h2>
            <span className="text-caption text-text-3">Step {position} of {total}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="grid h-8 place-items-center px-1">
            <Toggle label={`Use ${title}`} checked={step.enabled} onChange={onToggle} />
          </span>
          <IconButton label={`Move ${title} up`} icon={ArrowUp} disabled={position === 1} onClick={() => onMove(-1)} />
          <IconButton label={`Move ${title} down`} icon={ArrowDown} disabled={position === total} onClick={() => onMove(1)} />
          <IconButton label={`Remove ${title}`} icon={X} onClick={onRemove} />
        </div>
      </header>
      {info ? (
        <p className="text-small text-text-2">{info.description}</p>
      ) : (
        <>
          <p className="text-small text-text-2">There is no stage called {step.key} any more. Remove it, or restore its file.</p>
          <pre className="overflow-x-auto rounded-xl bg-fill-2 p-3 font-mono text-caption">{JSON.stringify(step.settings, null, 2)}</pre>
        </>
      )}
      {info ? (
        <div className="flex flex-col gap-5 border-t border-fill-2 pt-5">
          {fieldsOf(info.settingsSchema).map((field) => renderField(field, step, drafts, problems, onText, onValue))}
        </div>
      ) : null}
    </section>
  );
}

/** A switch on the right, its label and description on the left. */
function switchRow(field: Field, checked: boolean, onChange: (on: boolean) => void): ReactNode {
  return (
    <div key={field.name} className={`flex items-center justify-between gap-6 ${COLUMN}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={LABEL}>{field.label}</span>
        {field.help ? <span className="text-caption text-text-3">{field.help}</span> : null}
      </div>
      <Toggle label={field.label} checked={checked} onChange={onChange} />
    </div>
  );
}

function renderField(field: Field, step: StageStep, drafts: Record<string, string>, problems: Record<string, string>, onText: (field: Field, text: string) => void, onValue: (field: Field, value: unknown) => void): ReactNode {
  const value = step.settings[field.name];
  if (field.kind === 'boolean') {
    return switchRow(field, value === undefined ? field.defaultValue === true : value === true, (on) => onValue(field, on));
  }
  if (field.kind === 'choice') {
    const options = [...(field.nullable ? [{ value: '', label: 'Ask me' }] : []), ...field.choices.map((choice) => ({ value: choice, label: sentence(choice) }))];
    const current = (value as string | null | undefined) ?? (field.nullable ? '' : String(field.defaultValue));
    return (
      <div key={field.name} className={`flex flex-col gap-1.5 ${COLUMN}`}>
        <span className={LABEL}>{field.label}</span>
        <SegmentedControl label={field.label} options={options} value={current} onChange={(next) => onValue(field, next === '' ? null : next)} />
        {field.help ? <span className="text-caption text-text-3">{field.help}</span> : null}
      </div>
    );
  }
  if (field.kind === 'text' && field.multiline) {
    return (
      <label key={field.name} className={`flex flex-col gap-1.5 ${COLUMN}`}>
        <span className={LABEL}>{field.label}</span>
        <textarea
          id={`f-${field.name}`}
          rows={6}
          value={drafts[field.name] ?? toText(field, value)}
          onChange={(event) => onText(field, event.target.value)}
          className="w-full rounded-[10px] bg-fill-2 px-3 py-2 font-mono text-caption focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {problems[field.name] ? <span className="text-caption text-bad">{problems[field.name]}</span> : field.help ? <span className="text-caption text-text-3">{field.help}</span> : null}
      </label>
    );
  }
  if (field.kind === 'readonly') {
    return (
      <div key={field.name} className={`flex flex-col gap-1.5 ${COLUMN}`}>
        <span className={LABEL}>{field.label}</span>
        <code className="rounded-[10px] bg-fill-2 px-3 py-2 font-mono text-caption">{JSON.stringify(value ?? field.defaultValue ?? null)}</code>
        <span className="text-caption text-text-3">This setting cannot be edited here yet.</span>
      </div>
    );
  }
  return (
    <FormField
      key={field.name}
      label={field.label}
      id={`f-${field.name}`}
      value={drafts[field.name] ?? toText(field, value)}
      placeholder={field.nullable ? 'No limit' : undefined}
      helper={field.help || undefined}
      error={problems[field.name]}
      className={COLUMN}
      onChange={(event) => onText(field, event.target.value)}
    />
  );
}
