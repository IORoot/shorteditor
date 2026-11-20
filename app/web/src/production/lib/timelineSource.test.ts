import { describe, expect, it } from 'vitest';
import type { StageRun } from './types';
import { timelineSource } from './timelineSource';

function clips(key: string, items: { name: string; start: number; end: number; length: number }[]): StageRun {
  return {
    key,
    title: key,
    status: 'done',
    startedAt: '2026-11-20T10:00:00Z',
    finishedAt: '2026-11-20T10:01:00Z',
    details: { kind: 'clips', clips: items, total: items.reduce((sum, c) => sum + c.length, 0) },
  };
}

const scan = clips('scan_folder', [
  { name: 'class_01.mp4', start: 0, end: 300, length: 300 },
  { name: 'class_02.mp4', start: 0, end: 200, length: 200 },
  { name: 'class_03.mp4', start: 0, end: 280, length: 280 },
]);
const detect = clips('detect_action', [
  { name: 'class_01.mp4', start: 30, end: 90, length: 60 },
  { name: 'class_01.mp4', start: 180, end: 240, length: 60 },
  { name: 'class_02.mp4', start: 20, end: 60, length: 40 },
  { name: 'class_03.mp4', start: 60, end: 110, length: 50 },
]);

describe('timelineSource', () => {
  it('takes the videos with their full lengths from the scan, and the kept pieces from the detect stage', () => {
    const source = timelineSource([scan, detect]);
    expect(source.videos).toEqual([
      { name: 'class_01.mp4', length: 300 },
      { name: 'class_02.mp4', length: 200 },
      { name: 'class_03.mp4', length: 280 },
    ]);
    expect(source.pieces).toHaveLength(4);
    expect(source.pieces[0]).toEqual({ name: 'class_01.mp4', start: 30, end: 90 });
  });

  it('uses the order of the order-clips stage when it runs before detection, so the videos play in Join order', () => {
    const ordered = clips('order_clips', [
      { name: 'class_03.mp4', start: 0, end: 280, length: 280 },
      { name: 'class_01.mp4', start: 0, end: 300, length: 300 },
      { name: 'class_02.mp4', start: 0, end: 200, length: 200 },
    ]);
    const source = timelineSource([scan, ordered, detect]);
    expect(source.videos.map((v) => v.name)).toEqual(['class_03.mp4', 'class_01.mp4', 'class_02.mp4']);
  });

  it('uses the limit-length stage for the kept pieces when it ran after detection', () => {
    const limited = clips('limit_length', [{ name: 'class_01.mp4', start: 30, end: 90, length: 60 }]);
    const source = timelineSource([scan, detect, limited]);
    expect(source.pieces).toEqual([{ name: 'class_01.mp4', start: 30, end: 90 }]);
  });

  it('has no videos and no pieces before the scan has finished', () => {
    expect(timelineSource([])).toEqual({ videos: [], pieces: [] });
    expect(timelineSource([{ key: 'scan_folder', title: 'Scan folder', status: 'running', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: null }])).toEqual({ videos: [], pieces: [] });
  });
});
