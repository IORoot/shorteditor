import type { BatchCreate, StageStep } from './types';

export type OrderBy = 'capture_time' | 'created' | 'name' | 'duration' | 'random';
export type Fit = 'crop' | 'blur';

/** Numbers stay text while the user types, so a field can be cleared. */
export interface NewBatchForm {
  name: string;
  inputFolder: string;
  outputRoot: string;
  runOn: string;
  orderBy: OrderBy;
  maxSeconds: string;
  maxSizeMb: string;
  fit: Fit;
}

export function defaultForm(): NewBatchForm {
  return { name: '', inputFolder: '', outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '60', maxSizeMb: '50', fit: 'crop' };
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

export function isValid(form: NewBatchForm): boolean {
  return (
    form.name.trim() !== '' &&
    form.inputFolder.trim() !== '' &&
    filled(form.maxSeconds, secondsHint(form.maxSeconds)) &&
    filled(form.maxSizeMb, sizeHint(form.maxSizeMb))
  );
}

/** The Join clips pipeline: scan, order, limit the length, join, render. */
export function buildSteps(form: NewBatchForm): StageStep[] {
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
