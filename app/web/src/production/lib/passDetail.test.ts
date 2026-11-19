import { describe, expect, it } from 'vitest';
import { elapsed, span, timelineRows, waitingSince } from './passDetail';

describe('span', () => {
  it('shows minutes and seconds, then hours once past an hour', { tags: ['full'] }, () => {
    expect(span(0)).toBe('0:00');
    expect(span(65_900)).toBe('1:05');
    expect(span(3_725_000)).toBe('1:02:05');
  });
});

describe('timelineRows', () => {
  it('lists the reached stages with their times, then the planned ones still waiting', { tags: ['full'] }, () => {
    const rows = timelineRows(
      [{ key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-19T10:00:00Z', finishedAt: '2026-11-19T10:00:02Z' }],
      ['Scan folder', 'Detect action', 'Render'],
    );
    expect(rows.map((row) => [row.title, row.status])).toEqual([['Scan folder', 'done'], ['Detect action', 'waiting'], ['Render', 'waiting']]);
    expect(rows[1].startedAt).toBeNull();
  });
});

describe('waitingSince', () => {
  it('is set only while the last line says a request went to the AI', { tags: ['full'] }, () => {
    expect(waitingSince([{ at: 't1', text: 'Sending 12 frames of a.mov to m' }])).toBe('t1');
    expect(waitingSince([{ at: 't1', text: 'Sending 12 frames of a.mov to m' }, { at: 't2', text: 'Answer from m after 9 s: 40 characters, stopped because stop' }])).toBeNull();
    expect(waitingSince([])).toBeNull();
  });
});

describe('elapsed', () => {
  it('runs to now while the end is not known', { tags: ['full'] }, () => {
    const start = '2026-11-19T10:00:00.000Z';
    expect(elapsed(start, null, Date.parse('2026-11-19T10:00:30.000Z'))).toBe(30_000);
    expect(elapsed(start, '2026-11-19T10:01:00.000Z', Date.parse('2026-11-19T11:00:00.000Z'))).toBe(60_000);
  });
});
