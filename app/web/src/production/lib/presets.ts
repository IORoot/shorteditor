import type { BatchCreate, BulkCreate, FolderPreview, StageStep, WatchCreate, WatchView } from './types';

export type OrderBy = 'capture_time' | 'created' | 'name' | 'duration' | 'random';
const ORDER_BY: OrderBy[] = ['capture_time', 'created', 'name', 'duration', 'random'];
export type Fit = 'crop' | 'blur';

/** The settings every batch shares. Numbers stay text while the user types, so a field can be cleared. */
export interface SettingsForm {
  outputRoot: string;
  runOn: string;
  orderBy: OrderBy;
  maxSeconds: string;
  maxSizeMb: string;
  fit: Fit;
}

export interface NewBatchForm extends SettingsForm {
  name: string;
  inputFolder: string;
}

export function defaultSettings(): SettingsForm {
  return { outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '900', maxSizeMb: '150', fit: 'crop' };
}

export function defaultForm(): NewBatchForm {
  return { name: '', inputFolder: '', ...defaultSettings() };
}

export const PATTERN_PRESETS = [
  { id: 'date', label: 'Date first, like 2026-11-07_…', pattern: '^\\d{4}-\\d{2}-\\d{2}_.+$' },
  { id: 'any', label: 'Any folder', pattern: '^.+$' },
  { id: 'custom', label: 'Custom pattern', pattern: '' },
];

/** The "subfolders" form. `include` lists already-batched folders the user ticked to batch again. */
export interface ManyForm extends SettingsForm {
  parentFolder: string;
  presetId: string;
  pattern: string;
  nameTemplate: string;
  include: string[];
  /** Keep watching the parent folder. The fields below are used only when this is on. */
  watching: boolean;
  watchName: string;
  /** When watching: batch the folders already there now (else they are skipped and only new ones get batches). */
  watchExisting: boolean;
  intervalMinutes: string;
  settleMinutes: string;
  maxPerCheck: string;
}

export function defaultManyForm(): ManyForm {
  return {
    parentFolder: '', presetId: PATTERN_PRESETS[0].id, pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', include: [], ...defaultSettings(),
    watching: false, watchName: '', watchExisting: false, intervalMinutes: '5', settleMinutes: '10', maxPerCheck: '20',
  };
}

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const NOT_A_NUMBER = 'Use a number like 45 or 30.5';
const MAX_SIZE_MB = 100_000; // the limits the server enforces on these two stages

const parse = (text: string): number | null => (PLAIN_NUMBER.test(text.trim()) ? Number(text.trim()) : null);

/** What is wrong with the length limit, or null when it is fine or still empty. */
export function secondsHint(text: string): string | null {
  if (text.trim() === '') return null;
  const value = parse(text);
  if (value === null) return NOT_A_NUMBER;
  return value >= 1 ? null : 'At least 1 second';
}

export function sizeHint(text: string): string | null {
  if (text.trim() === '') return null;
  const value = parse(text);
  if (value === null) return NOT_A_NUMBER;
  if (value <= 0) return 'More than 0 MB';
  return value <= MAX_SIZE_MB ? null : `At most ${MAX_SIZE_MB} MB`;
}

const filled = (text: string, hint: string | null): boolean => text.trim() !== '' && hint === null;

const settingsValid = (form: SettingsForm): boolean => filled(form.maxSeconds, secondsHint(form.maxSeconds)) && filled(form.maxSizeMb, sizeHint(form.maxSizeMb));

export function isValid(form: NewBatchForm): boolean {
  return form.name.trim() !== '' && form.inputFolder.trim() !== '' && settingsValid(form);
}

export function manyIsValid(form: ManyForm): boolean {
  return form.parentFolder.trim() !== '' && form.pattern.trim() !== '' && settingsValid(form) && (!form.watching || watchValid(form));
}

const WHOLE_NUMBER = /^\d+$/;

/** A whole number inside the limits the server enforces, or the plain hint saying which numbers are allowed. */
export function wholeHint(text: string, min: number, max: number): string | null {
  const value = WHOLE_NUMBER.test(text.trim()) ? Number(text.trim()) : NaN;
  return value >= min && value <= max ? null : `Use a whole number from ${min} to ${max}`;
}

const MAX_NAME = 120;
const lastSegment = (path: string): string => path.split(/[\\/]/).filter((part) => part !== '').pop() ?? '';

/** The watch's name: the typed one, or the parent folder's name. */
export function watchNameOf(form: ManyForm): string {
  return form.watchName.trim() || lastSegment(form.parentFolder.trim());
}

const watchValid = (form: ManyForm): boolean =>
  wholeHint(form.intervalMinutes, 1, 1440) === null &&
  wholeHint(form.settleMinutes, 0, 1440) === null &&
  wholeHint(form.maxPerCheck, 1, 100) === null &&
  watchNameOf(form).length > 0 && watchNameOf(form).length <= MAX_NAME;

/** How many batches Create will make right now: the one-off ones, or only the existing folders a watch batches at its start. */
export function batchesNow(form: ManyForm, preview: FolderPreview): number {
  if (!form.watching) return createCount(preview, form.include);
  return form.watchExisting ? preview.matches.filter((m) => m.status === 'will_create').length : 0;
}

const stepSettings = (steps: StageStep[], key: string): Record<string, unknown> => steps.find((s) => s.key === key)?.settings ?? {};

/** The settings a saved pipeline was made with, so an edited watch opens with what it has. Unknown values fall back to the defaults. */
export function settingsFromSteps(steps: StageStep[]): Partial<SettingsForm> {
  const defaults = defaultSettings();
  const order = stepSettings(steps, 'order_clips').orderBy;
  const seconds = stepSettings(steps, 'limit_length').maxSeconds;
  const size = stepSettings(steps, 'render_output').maxSizeMb;
  return {
    orderBy: ORDER_BY.includes(order as OrderBy) ? (order as OrderBy) : defaults.orderBy,
    fit: stepSettings(steps, 'join_pieces').fit === 'blur' ? 'blur' : 'crop',
    maxSeconds: typeof seconds === 'number' ? String(seconds) : defaults.maxSeconds,
    maxSizeMb: typeof size === 'number' ? String(size) : defaults.maxSizeMb,
  };
}

/** The form for editing a saved watch. The existing-folders switch is not part of a watch, so it stays off. */
export function formFromWatch(watch: WatchView): ManyForm {
  const preset = PATTERN_PRESETS.find((p) => p.id !== 'custom' && p.pattern === watch.pattern);
  return {
    ...defaultManyForm(),
    ...settingsFromSteps(watch.steps),
    outputRoot: watch.outputRoot ?? '',
    runOn: watch.runOn,
    parentFolder: watch.parentFolder,
    presetId: preset?.id ?? 'custom',
    pattern: watch.pattern,
    nameTemplate: watch.nameTemplate,
    watching: true,
    watchName: watch.name,
    intervalMinutes: String(watch.intervalMinutes),
    settleMinutes: String(watch.settleMinutes),
    maxPerCheck: String(watch.maxPerCheck),
  };
}

/** The watch request. `includeExisting` batches the folders already there at the start; `enabled` keeps a paused watch paused on edit. */
export function toWatchRequest(form: ManyForm, includeExisting: boolean, enabled = true): WatchCreate {
  const request: WatchCreate = {
    name: watchNameOf(form),
    parentFolder: form.parentFolder.trim(),
    pattern: form.pattern,
    nameTemplate: form.nameTemplate,
    steps: buildSteps(form),
    runOn: form.runOn,
    intervalMinutes: Number(form.intervalMinutes.trim()),
    settleMinutes: Number(form.settleMinutes.trim()),
    maxPerCheck: Number(form.maxPerCheck.trim()),
    includeExisting,
    enabled,
  };
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  return request;
}

/** The Join clips pipeline: scan, order, limit the length, join, render. */
export function buildSteps(form: SettingsForm): StageStep[] {
  const step = (key: string, settings: Record<string, unknown> = {}): StageStep => ({ key, settings, enabled: true });
  return [
    step('scan_folder'),
    step('order_clips', { orderBy: form.orderBy }),
    step('limit_length', { maxSeconds: Number(form.maxSeconds.trim()) }),
    step('join_pieces', { fit: form.fit }),
    step('render_output', { maxSizeMb: Number(form.maxSizeMb.trim()) }),
  ];
}

export function toRequest(form: NewBatchForm): BatchCreate {
  const request: BatchCreate = { name: form.name.trim(), inputFolder: form.inputFolder.trim(), steps: buildSteps(form), runOn: form.runOn };
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  return request;
}

export function toBulkRequest(form: ManyForm): BulkCreate {
  const request: BulkCreate = {
    parentFolder: form.parentFolder.trim(), pattern: form.pattern, nameTemplate: form.nameTemplate, steps: buildSteps(form), runOn: form.runOn, include: form.include,
  };
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  return request;
}

/** How many batches Create will make: the new folders plus the already-batched ones the user ticked. */
export function createCount(preview: FolderPreview, include: string[]): number {
  return preview.matches.filter((m) => m.status === 'will_create' || (m.status === 'already_batched' && include.includes(m.name))).length;
}
