import { defaultsOf } from './schemaForm';
import type { StageInfo, StageStep } from './types';

export function move<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The item at `from` placed at `to` (clamped), everything else keeping its order. */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export const setEnabled =(steps: StageStep[], index: number, enabled: boolean): StageStep[] =>
  steps.map((step, i) => (i === index ? { ...step, enabled } : step));

export const setSetting = (steps: StageStep[], index: number, name: string, value: unknown): StageStep[] =>
  steps.map((step, i) => (i === index ? { ...step, settings: { ...step.settings, [name]: value } } : step));

export const addStage = (steps: StageStep[], info: StageInfo): StageStep[] => [...steps, { key: info.key, settings: defaultsOf(info.settingsSchema), enabled: true }];

/** "Scan folder", or "Missing stage" when no stage file has that key any more. */
export function titleOf(step: StageStep, library: StageInfo[]): string {
  return library.find((info) => info.key === step.key)?.title ?? 'Missing stage';
}

export const isMissing = (step: StageStep, library: StageInfo[]): boolean => !library.some((info) => info.key === step.key);
