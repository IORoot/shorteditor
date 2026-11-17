import { describe, expect, it } from 'vitest';
import { addStage, isMissing, move, setEnabled, setSetting, titleOf } from './steps';
import type { StageInfo, StageStep } from './types';

const step = (key: string, settings: Record<string, unknown> = {}): StageStep => ({ key, settings, enabled: true });
const info = (key: string, title: string): StageInfo => ({ key, title, transitions: {}, position: 'any', settingsSchema: { properties: { n: { default: 3, type: 'integer' }, c: { default: null, anyOf: [{ type: 'null' }] } } } });

describe('steps', () => {
  it('moves a step up and down and ignores the ends', () => {
    const steps = [step('a'), step('b'), step('c')];
    expect(move(steps, 1, -1).map((s) => s.key)).toEqual(['b', 'a', 'c']);
    expect(move(steps, 1, 1).map((s) => s.key)).toEqual(['a', 'c', 'b']);
    expect(move(steps, 0, -1)).toBe(steps);
    expect(move(steps, 2, 1)).toBe(steps);
  });

  it('switches a step and sets one setting without touching the others', () => {
    const steps = [step('a', { x: 1 }), step('b')];
    expect(setEnabled(steps, 0, false)[0].enabled).toBe(false);
    expect(setSetting(steps, 0, 'y', 2)[0].settings).toEqual({ x: 1, y: 2 });
    expect(steps[0].settings).toEqual({ x: 1 });
    expect(setSetting(steps, 0, 'y', 2)[1]).toBe(steps[1]);
  });

  it('adds a stage with the schema defaults', () => {
    expect(addStage([], info('a', 'A'))).toEqual([{ key: 'a', settings: { n: 3 }, enabled: true }]);
  });

  it('names a stage that no longer exists', () => {
    const library = [info('a', 'Alpha')];
    expect(titleOf(step('a'), library)).toBe('Alpha');
    expect(titleOf(step('gone'), library)).toBe('Missing stage');
    expect(isMissing(step('gone'), library)).toBe(true);
  });
});
