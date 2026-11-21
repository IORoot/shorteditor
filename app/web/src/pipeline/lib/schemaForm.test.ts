import { describe, expect, it } from 'vitest';
import { defaultsOf, fieldsOf, fromText, summaryOf, toText } from './schemaForm';

const schema = {
  properties: {
    maxSeconds: { default: 900, minimum: 1, type: 'number' },
    choice: { anyOf: [{ enum: ['drop_shortest', 'keep_first'], type: 'string' }, { type: 'null' }], default: null },
    maxSizeMb: { anyOf: [{ exclusiveMinimum: 0, maximum: 100000, type: 'number' }, { type: 'null' }], default: 150 },
    fit: { default: 'crop', enum: ['crop', 'blur'], type: 'string' },
    includeSubfolders: { default: true, type: 'boolean' },
    maxFiles: { default: 5000, maximum: 100000, minimum: 1, type: 'integer' },
    extensions: { default: ['mp4'], items: { type: 'string' }, type: 'array' },
    fileName: { default: 'output.mp4', type: 'string' },
    weird: { default: {}, type: 'object' },
    script: { default: '', maxLength: 2000, type: 'string' },
  },
};

const field = (name: string) => fieldsOf(schema).find((f) => f.name === name)!;

describe('fieldsOf', () => {
  it('reads each kind from the schema', { tags: ['full'] }, () => {
    expect(field('maxSeconds')).toMatchObject({ kind: 'number', label: 'Max seconds', min: 1, nullable: false });
    expect(field('choice')).toMatchObject({ kind: 'choice', nullable: true, choices: ['drop_shortest', 'keep_first'] });
    expect(field('maxSizeMb')).toMatchObject({ kind: 'number', nullable: true, max: 100000 });
    expect(field('fit')).toMatchObject({ kind: 'choice', nullable: false });
    expect(field('includeSubfolders').kind).toBe('boolean');
    expect(field('maxFiles')).toMatchObject({ kind: 'integer', min: 1, max: 100000 });
    expect(field('extensions').kind).toBe('list');
    expect(field('fileName').kind).toBe('text');
    expect(field('script')).toMatchObject({ kind: 'text', multiline: true });
    expect(field('fileName').multiline).toBe(false);
    expect(field('weird').kind).toBe('readonly');
  });
});

describe('fromText', () => {
  it('parses numbers with plain messages', { tags: ['full'] }, () => {
    expect(fromText(field('maxSeconds'), ' 45.5 ')).toEqual({ value: 45.5 });
    expect(fromText(field('maxSeconds'), 'abc')).toEqual({ error: 'Use a number like 45 or 30.5' });
    expect(fromText(field('maxSeconds'), '0')).toEqual({ error: 'At least 1' });
    expect(fromText(field('maxSeconds'), '')).toEqual({ error: 'Enter a number' });
    expect(fromText(field('maxFiles'), '2.5')).toEqual({ error: 'Use a whole number' });
    expect(fromText(field('maxFiles'), '999999')).toEqual({ error: 'At most 100000' });
  });

  it('stores an empty nullable field as null', () => {
    expect(fromText(field('maxSizeMb'), '')).toEqual({ value: null });
    expect(fromText(field('choice'), '')).toEqual({ value: null });
  });

  it('splits a list on commas', { tags: ['full'] }, () => {
    expect(fromText(field('extensions'), 'mp4, mov ,')).toEqual({ value: ['mp4', 'mov'] });
    expect(fromText(field('extensions'), '')).toEqual({ value: [] });
  });
});

describe('toText and defaultsOf', () => {
  it('shows stored values as text', { tags: ['full'] }, () => {
    expect(toText(field('extensions'), ['mp4', 'mov'])).toBe('mp4, mov');
    expect(toText(field('maxSizeMb'), null)).toBe('');
    expect(toText(field('maxSeconds'), 45)).toBe('45');
  });

  it('leaves null defaults out, like the server', { tags: ['full'] }, () => {
    const defaults = defaultsOf(schema);
    expect(defaults.maxSeconds).toBe(900);
    expect('choice' in defaults).toBe(false);
    expect(defaults.maxSizeMb).toBe(150);
  });
});

describe('widget fields', () => {
  it('a property with a widget becomes a widget field, and is left out of the summary', () => {
    const schema = { properties: { folderId: { anyOf: [{ type: 'string' }, { type: 'null' }], title: 'Media folder', widget: 'postiz_folder' } } };
    const [field] = fieldsOf(schema);
    expect(field).toMatchObject({ name: 'folderId', kind: 'widget', widget: 'postiz_folder', label: 'Media folder' });
    expect(summaryOf({ settingsSchema: schema }, { settings: { folderId: 'f1' } })).toBe('');
  });
});
