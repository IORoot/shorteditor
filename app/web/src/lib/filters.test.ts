import { describe, expect, it } from 'vitest';
import { RULE_KINDS, defaultRandom, moveBy, newGroup, newRule, removeAt, replaceAt } from './filters';

describe('newRule', () => {
  it('starts a name rule empty and included', () => {
    expect(newRule()).toMatchObject({ kind: 'name', exclude: false, value: '', days: [] });
  });

  it('gives weekday and window rules a Saturday default and window times', () => {
    expect(newRule('weekday').days).toEqual([6]);
    expect(newRule('window')).toMatchObject({ days: [6], start: '09:00', end: '13:00' });
  });

  it('keeps the exclude flag', () => {
    expect(newRule('glob', true).exclude).toBe(true);
  });

  it('offers every rule kind with a label', () => {
    expect(RULE_KINDS.map((k) => k.value)).toEqual(['name', 'glob', 'regex', 'date_range', 'weekday', 'window']);
  });
});

describe('group and list helpers', () => {
  it('a new group has one empty rule', () => {
    expect(newGroup().rules).toHaveLength(1);
  });

  it('replaceAt, removeAt and moveBy do not mutate', () => {
    const items = ['a', 'b', 'c'];
    expect(replaceAt(items, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(items, 0)).toEqual(['b', 'c']);
    expect(moveBy(items, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(items, 0, -1)).toBe(items);
    expect(moveBy(items, 2, 1)).toBe(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('has a disabled random selection by default', () => {
    expect(defaultRandom.enabled).toBe(false);
  });
});
