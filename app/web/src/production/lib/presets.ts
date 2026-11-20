import type { BatchCreate, BulkCreate, FolderPreview, WatchCreate, WatchView } from './types';

/** The settings every batch shares: the pipeline, where it runs and where the result goes. */
export interface SettingsForm {
  outputRoot: string;
  runOn: string;
  pipelineId: number | null;
  /** On: the batch's cards start by themselves. Off: they wait until the batch is started. */
  autoRun: boolean;
}

export interface NewBatchForm extends SettingsForm {
  name: string;
  inputFolder: string;
}

export function defaultSettings(): SettingsForm {
  return { outputRoot: '', runOn: 'any', pipelineId: null, autoRun: false };
}

export function defaultForm(): NewBatchForm {
  return { name: '', inputFolder: '', ...defaultSettings() };
}

export const PATTERN_PRESETS = [
  { id: 'date', label: 'Date first, like 2026-11-07_…', pattern: '^\\d{4}-\\d{2}-\\d{2}_.+$' },
  { id: 'any', label: 'Any folder', pattern: '^.+$' },
  { id: 'custom', label: 'Custom pattern', pattern: '' },
];

/** The "subfolders" form: one batch for the parent folder, with a card for each folder the pattern matches. */
export interface ManyForm extends SettingsForm {
  parentFolder: string;
  presetId: string;
  pattern: string;
  nameTemplate: string;
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
    parentFolder: '', presetId: PATTERN_PRESETS[0].id, pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', ...defaultSettings(),
    watching: false, watchName: '', watchExisting: false, intervalMinutes: '5', settleMinutes: '10', maxPerCheck: '20',
  };
}

const settingsValid = (form: SettingsForm): boolean => form.pipelineId !== null;

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
  if (!form.watching) return createCount(preview);
  return form.watchExisting ? preview.matches.filter((m) => m.status === 'will_create').length : 0;
}

/** The form for editing a saved watch. The existing-folders switch is not part of a watch, so it stays off. */
export function formFromWatch(watch: WatchView): ManyForm {
  const preset = PATTERN_PRESETS.find((p) => p.id !== 'custom' && p.pattern === watch.pattern);
  return {
    ...defaultManyForm(),
    pipelineId: watch.pipelineId,
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
    pipelineId: form.pipelineId as number,
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

export function toRequest(form: NewBatchForm): BatchCreate {
  const request: BatchCreate = { name: form.name.trim(), inputFolder: form.inputFolder.trim(), pipelineId: form.pipelineId as number, runOn: form.runOn, autoRun: form.autoRun };
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  return request;
}

export function toBulkRequest(form: ManyForm): BulkCreate {
  const request: BulkCreate = {
    parentFolder: form.parentFolder.trim(), pattern: form.pattern, nameTemplate: form.nameTemplate, pipelineId: form.pipelineId as number, runOn: form.runOn, autoRun: form.autoRun,
  };
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  return request;
}

/** A one-off run makes one batch for the parent folder, unless every folder with videos is already in a batch. */
export function createCount(preview: FolderPreview): number {
  return preview.matches.some((m) => m.status === 'will_create') ? 1 : 0;
}
