import { DEFAULT_FOLDER_TEMPLATE } from './folderTemplate';
import type { BulkCreate, FolderPreview, WatchCreate, WatchView } from './types';

/** The settings every batch shares: the pipeline, where it runs and where the result goes. */
export interface SettingsForm {
  outputRoot: string;
  /** The batch's folder name under the output folder, with tags. */
  folderTemplate: string;
  runOn: string;
  pipelineId: number | null;
  /** On: the batch's cards start by themselves. Off: they wait until the batch is started. */
  autoRun: boolean;
}

export function defaultSettings(): SettingsForm {
  return { outputRoot: '', folderTemplate: DEFAULT_FOLDER_TEMPLATE, runOn: 'any', pipelineId: null, autoRun: false };
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
  /** The batch's name for a one-off batch. Empty means the parent folder's name. */
  batchName: string;
  /** On: the parent folder is the one card, and the pattern is not used. Off: each matching subfolder with videos is a card. */
  ignoreSubfolders: boolean;
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
    parentFolder: '', presetId: PATTERN_PRESETS[0].id, pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', batchName: '', ignoreSubfolders: false,
    ...defaultSettings(),
    watching: false, watchName: '', watchExisting: false, intervalMinutes: '5', settleMinutes: '10', maxPerCheck: '20',
  };
}

const settingsValid = (form: SettingsForm): boolean => form.pipelineId !== null;

/** A one-off batch that ignores subfolders needs no pattern: its one card is the parent folder. */
export const ignoresSubfolders = (form: ManyForm): boolean => !form.watching && form.ignoreSubfolders;

export function manyIsValid(form: ManyForm): boolean {
  const patternOk = ignoresSubfolders(form) || form.pattern.trim() !== '';
  return form.parentFolder.trim() !== '' && patternOk && settingsValid(form) && (!form.watching || watchValid(form));
}

const WHOLE_NUMBER = /^\d+$/;

/** A whole number inside the limits the server enforces, or the plain hint saying which numbers are allowed. */
export function wholeHint(text: string, min: number, max: number): string | null {
  const value = WHOLE_NUMBER.test(text.trim()) ? Number(text.trim()) : NaN;
  return value >= min && value <= max ? null : `Use a whole number from ${min} to ${max}`;
}

/** The last part of a folder path: the folder's own name. */
/** The default output folder: an "output" folder beside the input folder. Mirrors the server. Empty when the folder has no parent to sit beside. */
export const outputBeside = (inputFolder: string): string => {
  const trimmed = inputFolder.trim().replace(/[\\/]+$/, '');
  const cut = trimmed.lastIndexOf('/');
  return trimmed.startsWith('/') && cut > 0 ? `${trimmed.slice(0, cut)}/output` : '';
};

export const folderNameOf = (path: string): string => path.split(/[\\/]/).filter((part) => part !== '').pop() ?? '';

/** The watch's name: the typed one, or the parent folder's name. */
export function watchNameOf(form: ManyForm): string {
  return form.watchName.trim() || folderNameOf(form.parentFolder.trim());
}

const watchValid = (form: ManyForm): boolean =>
  wholeHint(form.intervalMinutes, 1, 1440) === null &&
  wholeHint(form.settleMinutes, 0, 1440) === null &&
  wholeHint(form.maxPerCheck, 1, 100) === null;

/** How many batches Create will make: one for the parent folder, unless every folder with videos is already in a batch. A watching batch is made regardless. */
export function batchesNow(form: ManyForm, preview: FolderPreview): number {
  if (ignoresSubfolders(form)) return 1;
  return form.watching ? 1 : createCount(preview);  // a watching batch is made even when no folder is there yet
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

/** The folder name the user typed, when it is not the default: the default is left out of the request. */
const customTemplate = (text: string): boolean => text.trim() !== '' && text.trim() !== DEFAULT_FOLDER_TEMPLATE;

export function toBulkRequest(form: ManyForm): BulkCreate {
  const parentFolder = form.parentFolder.trim();
  const request: BulkCreate = {
    parentFolder, pattern: form.pattern, name: form.batchName.trim() || folderNameOf(parentFolder), nameTemplate: form.nameTemplate,
    pipelineId: form.pipelineId as number, runOn: form.runOn, autoRun: form.autoRun,
  };
  if (ignoresSubfolders(form)) request.ignoreSubfolders = true;
  if (form.watching) {
    request.watching = true;
    request.watchExisting = form.watchExisting;
    request.watchIntervalMinutes = Number(form.intervalMinutes.trim());
    request.watchSettleMinutes = Number(form.settleMinutes.trim());
    request.watchMaxPerCheck = Number(form.maxPerCheck.trim());
  }
  if (form.outputRoot.trim() !== '') request.outputRoot = form.outputRoot.trim();
  if (customTemplate(form.folderTemplate)) request.folderTemplate = form.folderTemplate.trim();
  return request;
}

/** A one-off run makes one batch for the parent folder, unless every folder with videos is already in a batch. */
export function createCount(preview: FolderPreview): number {
  return preview.matches.some((m) => m.status === 'will_create') ? 1 : 0;
}
