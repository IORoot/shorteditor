import type { DateSourceKind, FilterGroup, FilterRule, RandomSelection, RuleKind } from './types';

export const RULE_KINDS: { value: RuleKind; label: string }[] = [
  { value: 'name', label: 'Name contains' },
  { value: 'glob', label: 'Glob' },
  { value: 'regex', label: 'Regex' },
  { value: 'date_range', label: 'Date range' },
  { value: 'weekday', label: 'Weekday' },
  { value: 'window', label: 'Weekday + time' },
  { value: 'random', label: 'Random sample' },
];

export const DATE_SOURCES: { value: DateSourceKind; label: string }[] = [
  { value: 'modified', label: 'Modified time' },
  { value: 'created', label: 'Created time' },
  { value: 'filename', label: 'Filename pattern' },
];

export const TEXT_KINDS: RuleKind[] = ['name', 'glob', 'regex'];
export const DATE_KINDS: RuleKind[] = ['date_range', 'weekday', 'window'];

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
    caseSensitive: false,
    dateSource: 'modified',
    filenamePattern: '',
    random: { ...defaultRandom },
  };
}

export function newGroup(): FilterGroup {
  return { rules: [newRule()] };
}

/** Matches the backend default for a random rule: 10% of the clips the rules before it matched. */
export const defaultRandom: RandomSelection = { enabled: true, mode: 'percent', value: 10, scope: 'overall', seed: 42 };

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
