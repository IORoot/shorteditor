import { describe, expect, it } from 'vitest';
import { checkMessage, watchLabel, watchTone } from './watches';
import type { CheckResult, WatchView } from './types';

const batch = { id: 1, name: 'x', inputFolder: '/x', steps: [], runOn: 'any', outputRoot: '/o', createdAt: 'x' };
const result = (over: Partial<CheckResult>): CheckResult => ({ created: [], waiting: [], error: null, ...over });

describe('checkMessage', () => {
  it('says what a check did, in the order the user cares about', { tags: ['full'] }, () => {
    expect(checkMessage(result({ created: [batch, { ...batch, id: 2 }] }))).toBe('Created 2 batches');
    expect(checkMessage(result({ created: [batch] }))).toBe('Created 1 batch');
    expect(checkMessage(result({ waiting: ['2026-11-14_a'] }))).toBe('Waiting for 2026-11-14_a to settle');
    expect(checkMessage(result({}))).toBe('Nothing new');
    expect(checkMessage(result({ error: 'The folder /Volumes/Edit does not exist' }))).toBe('The folder /Volumes/Edit does not exist');
  });
});

const view = (status: WatchView['status']): WatchView => ({
  id: 1, name: 'Coach', parentFolder: '/c', pattern: '^.+$', nameTemplate: '{name}', steps: [], pipelineId: 1, pipelineName: 'Join clips', runOn: 'any', outputRoot: null,
  intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, enabled: true, createdAt: 'x', lastCheckedAt: null, lastError: null,
  waiting: [], createdTotal: 0, status, statusLine: '',
});

describe('watch labels and tones', () => {
  it.each([
    ['watching', 'Watching', 'ok'],
    ['waiting', 'Waiting', 'warn'],
    ['paused', 'Paused', 'info'],
    ['problem', 'Problem', 'bad'],
  ] as const)('%s is "%s" with tone %s', (status, label, tone) => {
    expect(watchLabel(view(status))).toBe(label);
    expect(watchTone(view(status))).toBe(tone);
  });

  it('shows an unknown status as it is, with a warning tone', { tags: ['full'] }, () => {
    expect(watchLabel(view('odd' as never))).toBe('odd');
    expect(watchTone(view('odd' as never))).toBe('warn');
  });
});
