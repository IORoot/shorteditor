import { describe, expect, it } from 'vitest';
import { stageSummary } from './stageSummary';

const now = Date.parse('2026-11-20T10:00:10Z');

describe('stageSummary', () => {
  it('says how many clips a clip stage made and their total length', () => {
    const details = { kind: 'clips' as const, total: 25, clips: [{ name: 'a.mov', start: 0, end: 25, length: 25 }, { name: 'b.mov', start: 0, end: 5, length: 5 }] };
    expect(stageSummary({ status: 'done', startedAt: null, finishedAt: null, details }, now)).toBe('2 clips · 0:25');
  });

  it('says what the video is and its size', () => {
    const details = { kind: 'video' as const, name: 'out.mp4', duration: 45, sizeBytes: 1, width: 1080, height: 1920, fps: 30 };
    expect(stageSummary({ status: 'done', startedAt: null, finishedAt: null, details }, now)).toBe('0:45 · 1080×1920');
  });

  it('shows the time taken for a stage that has finished, and the time so far for one still running', () => {
    expect(stageSummary({ status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: '2026-11-20T10:00:04Z' }, now)).toBe('took 0:04');
    expect(stageSummary({ status: 'running', startedAt: '2026-11-20T10:00:00Z', finishedAt: null }, now)).toBe('0:10 so far');
  });

  it('says a stage that has not started is not started', () => {
    expect(stageSummary({ status: 'waiting', startedAt: null, finishedAt: null }, now)).toBe('Not started');
  });
});
