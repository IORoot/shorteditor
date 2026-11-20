import { describe, expect, it } from 'vitest';
import { clipRows, filterClips } from './clips';
import type { StageRun } from './types';

const stages: StageRun[] = [
  { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 15, clips: [
    { name: 'a.mp4', start: 0, end: 10, length: 10 },
    { name: 'b.mp4', start: 0, end: 5, length: 5 },
  ] } },
  { key: 'detect_action', title: 'Detect action', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 3, clips: [
    { name: 'a.mp4', start: 2, end: 4, length: 2 },
  ] } },
];

describe('clipRows', () => {
  it('lists each scanned clip with the parts detection kept and whether it was found or not', () => {
    const [a, b] = clipRows(stages, {});
    expect(a).toMatchObject({ name: 'a.mp4', length: 10, found: 'found', stillAt: 2, trims: [] });
    expect(a.parts).toEqual([{ start: 2, end: 4 }]);
    expect(b).toMatchObject({ name: 'b.mp4', found: 'none', parts: [] });
  });

  it('marks a clip as waiting while detection has not finished', () => {
    const running = stages.slice(0, 1);
    expect(clipRows(running, {})[0].found).toBe('waiting');
  });

  it('reads the user trims of each clip from the pass', () => {
    const [a] = clipRows(stages, { apply_trims: { trims: { 'a.mp4': [{ start: 1, end: 3 }] } } } as never);
    expect(a.trims).toEqual([{ start: 1, end: 3 }]);
  });
});

describe('filterClips', () => {
  const rows = clipRows(stages, { apply_trims: { trims: { 'b.mp4': [{ start: 0, end: 1 }] } } } as never);
  it('keeps the clips each filter names', () => {
    expect(filterClips(rows, 'all')).toHaveLength(2);
    expect(filterClips(rows, 'action').map((r) => r.name)).toEqual(['a.mp4']);
    expect(filterClips(rows, 'none').map((r) => r.name)).toEqual(['b.mp4']);
    expect(filterClips(rows, 'edited').map((r) => r.name)).toEqual(['b.mp4']);
  });
});
