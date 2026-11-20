import { describe, expect, it } from 'vitest';
import { cardCan, outcome } from './actions';
import type { ActionName, PassStatus } from './types';

const ALL: PassStatus[] = ['queued', 'paused', 'running', 'review', 'blocked', 'failed', 'stopped', 'approved'];
const can = (status: PassStatus) => (action: ActionName) => cardCan(status, action);

describe('cardCan', () => {
  it('lets a waiting or running card be paused, and a paused or stopped card be resumed', { tags: ['full'] }, () => {
    expect(can('queued')('pause')).toBe(true);
    expect(can('running')('pause')).toBe(true);
    expect(can('review')('pause')).toBe(false);
    expect(can('paused')('resume')).toBe(true);
    expect(can('stopped')('resume')).toBe(true);
    expect(can('queued')('resume')).toBe(false);
  });

  it('stops anything that has not finished, and never a finished card', { tags: ['full'] }, () => {
    for (const status of ['queued', 'running', 'paused', 'blocked'] as PassStatus[]) expect(can(status)('stop')).toBe(true);
    for (const status of ['review', 'failed', 'stopped', 'approved'] as PassStatus[]) expect(can(status)('stop')).toBe(false);
  });

  it('runs a card again unless it is waiting or running, and deletes it unless it is running', { tags: ['full'] }, () => {
    for (const status of ALL) {
      expect(can(status)('rerun')).toBe(status !== 'queued' && status !== 'running');
      expect(can(status)('delete')).toBe(status !== 'running');
    }
  });
});

describe('outcome', () => {
  it('counts what was done and keeps each reason for what was not', { tags: ['full'] }, () => {
    expect(outcome([{ id: 1, ok: true, message: 'Paused' }, { id: 2, ok: false, message: 'A approved card cannot be paused' }]))
      .toEqual({ done: 1, problems: ['A approved card cannot be paused'] });
  });
});
