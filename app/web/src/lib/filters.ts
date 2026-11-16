import type { DateSourceKind, FilterGroup, FilterRule, RandomSelection, RuleKind } from './types';

export const RULE_KINDS: { value: RuleKind; label: string }[] = [
  { value: 'name', label: 'Name contains' },
  { value: 'glob', label: 'Glob' },
  { value: 'regex', label: 'Regex' },
  { value: 'date_range', label: 'Date range' },
  { value: 'weekday', label: 'Weekday' },
  { value: 'window', label: 'Weekday + time' },
];

export const DATE_SOURCES: { value: DateSourceKind; label: string }[] = [
  { value: 'metadata', label: 'Video metadata' },
  { value: 'filename', label: 'Filename pattern' },
  { value: 'mtime', label: 'File modified time' },
];

export function newRule(kind: RuleKind = 'name', exclude = false): FilterRule {
  return {
    kind,
    exclude,
    value: '',
    dateFrom: '',
    dateTo: '',
    days: kind === 'weekday' || kind === 'window' ? [6] : [],
    start: kind === 'window' ? '09:00' : '',
    end: kind === 'window' ? '13:00' : '',
  };
}

export function newGroup(): FilterGroup {
  return { rules: [newRule()] };
}

export const defaultRandom: RandomSelection = { enabled: false, mode: 'percent', value: 30, scope: 'overall', seed: 42 };

export function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function moveBy<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function orderedSources(enabled: DateSourceKind[]): { kind: DateSourceKind; on: boolean }[] {
  const rest = DATE_SOURCES.map((s) => s.value).filter((kind) => !enabled.includes(kind));
  return [...enabled.map((kind) => ({ kind, on: true })), ...rest.map((kind) => ({ kind, on: false }))];
}
