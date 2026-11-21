/** A settings form drawn from a stage's JSON schema, so a new stage needs no web change. */
export type FieldKind = 'boolean' | 'number' | 'integer' | 'choice' | 'text' | 'list' | 'pairs' | 'widget' | 'readonly';

export interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  choices: string[];
  /** Empty is allowed and stored as null: a choice reads "Ask each time", a number reads "No limit". */
  nullable: boolean;
  /** Long text (over 200 characters) is drawn as a textarea. */
  multiline: boolean;
  /** One line under the label, from the server's description. */
  help: string;
  min?: number;
  max?: number;
  defaultValue: unknown;
  /** For kind 'widget': the name of the custom control the server asked for, for example postiz_folder. */
  widget?: string;
}

type Prop = Record<string, unknown>;

const labelOf = (name: string): string => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null);

function fieldOf(name: string, prop: Prop): Field {
  const base: Field = { name, label: typeof prop.title === 'string' ? prop.title : labelOf(name), kind: 'readonly', choices: [], nullable: false, multiline: false, help: typeof prop.description === 'string' ? prop.description : '', defaultValue: prop.default };
  if (typeof prop.widget === 'string') return { ...base, kind: 'widget', widget: prop.widget };
  let shape = prop;
  const options = Array.isArray(prop.anyOf) ? (prop.anyOf as Prop[]) : null;
  if (options) {
    const rest = options.filter((o) => o.type !== 'null');
    if (rest.length !== 1 || rest.length === options.length) return base;
    shape = rest[0];
    base.nullable = true;
  }
  const choices = strings(shape.enum);
  if (choices) return { ...base, kind: 'choice', choices };
  if (shape.type === 'boolean') return { ...base, kind: 'boolean' };
  if (shape.type === 'integer' || shape.type === 'number') {
    const min = typeof shape.minimum === 'number' ? shape.minimum : undefined;
    const max = typeof shape.maximum === 'number' ? shape.maximum : undefined;
    return { ...base, kind: shape.type, min, max };
  }
  if (shape.type === 'string' && !base.nullable) return { ...base, kind: 'text', multiline: typeof shape.maxLength === 'number' && shape.maxLength > 200 };
  if (shape.type === 'object' && !base.nullable && (shape.additionalProperties as Prop | undefined)?.type === 'string') return { ...base, kind: 'pairs' };
  if (shape.type === 'array' && strings([(shape.items as Prop | undefined)?.type === 'string' ? 'x' : 1]) && !base.nullable) return { ...base, kind: 'list' };
  return base;
}

export function fieldsOf(schema: Record<string, unknown>): Field[] {
  const props = (schema.properties ?? {}) as Record<string, Prop>;
  return Object.entries(props).filter(([, prop]) => prop.hidden !== true).map(([name, prop]) => fieldOf(name, prop));
}

/** The text a field shows for a stored value. */
/** Shows the saved value, or the field's default when the step was saved without one. A cleared (null) value stays empty. */
export function toText(field: Field, value: unknown): string {
  const shown = value === undefined ? field.defaultValue : value;
  if (shown === null || shown === undefined) return '';
  if (field.kind === 'list' && Array.isArray(shown)) return shown.join(', ');
  return String(shown);
}

export type Parsed = { value: unknown } | { error: string };

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** The stored value for what the user typed, or a plain message saying what is wrong. */
export function fromText(field: Field, text: string): Parsed {
  const trimmed = text.trim();
  if (field.kind === 'number' || field.kind === 'integer') {
    if (trimmed === '') return field.nullable ? { value: null } : { error: 'Enter a number' };
    if (!PLAIN_NUMBER.test(trimmed)) return { error: 'Use a number like 45 or 30.5' };
    const value = Number(trimmed);
    if (field.kind === 'integer' && !Number.isInteger(value)) return { error: 'Use a whole number' };
    if (field.min !== undefined && value < field.min) return { error: `At least ${field.min}` };
    if (field.max !== undefined && value > field.max) return { error: `At most ${field.max}` };
    return { value };
  }
  if (field.kind === 'list') {
    return { value: trimmed === '' ? [] : trimmed.split(',').map((part) => part.trim()).filter((part) => part !== '') };
  }
  if (field.kind === 'choice') return { value: trimmed === '' ? null : trimmed };
  return { value: text };
}

/** Settings for a new step: each field's own default (null defaults are left out, as the server does). */
export function defaultsOf(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fieldsOf(schema)) if (field.defaultValue !== null && field.defaultValue !== undefined) out[field.name] = field.defaultValue;
  return out;
}

/** One line of what a step is set to, e.g. "Max length 900". Empty when nothing is set. */
export function summaryOf(info: { settingsSchema: Record<string, unknown> }, step: { settings: Record<string, unknown> }): string {
  return fieldsOf(info.settingsSchema).flatMap((field) => {
    const value = step.settings[field.name];
    if (value === undefined || value === null || field.kind === 'readonly' || field.kind === 'widget') return [];
    if (field.kind === 'boolean') return value === true ? [field.label] : [];
    return [`${field.label} ${toText(field, value).replace(/_/g, ' ')}`];
  }).join(' · ');
}
