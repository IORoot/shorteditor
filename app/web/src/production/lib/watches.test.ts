import { describe, expect, it } from 'vitest';
import { watchLabel, watchTone } from './watches';
import type { WatchView } from './types';

const view = (status: WatchView['status']): WatchView => ({
  id: 1, name: 'Coach', parentFolder: '/c', pattern: '^.+$', nameTemplate: '{name}', steps: [], runOn: 'any', outputRoot: null,
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

  it('shows an unknown status as it is, with a warning tone', () => {
    expect(watchLabel(view('odd' as never))).toBe('odd');
    expect(watchTone(view('odd' as never))).toBe('warn');
  });
});
