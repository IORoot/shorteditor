import { describe, expect, it } from 'vitest';
import { addRange, dragEdge, isWhole, removeRange, sameRanges, seconds, sortRanges, MIN_LENGTH } from './trims';

const LENGTH = 10;

describe('trims', () => {
  it('moves a start edge but never before the range before it or the clip start', () => {
    const ranges = [{ start: 1, end: 2 }, { start: 4, end: 6 }];
    expect(dragEdge(ranges, 1, 'start', 2.5, LENGTH)[1]).toEqual({ start: 2.5, end: 6 });
    expect(dragEdge(ranges, 1, 'start', 0.2, LENGTH)[1]).toEqual({ start: 2, end: 6 });
    expect(dragEdge(ranges, 0, 'start', -3, LENGTH)[0]).toEqual({ start: 0, end: 2 });
  });

  it('moves an end edge but never past the range after it or the clip end', () => {
    const ranges = [{ start: 1, end: 2 }, { start: 4, end: 6 }];
    expect(dragEdge(ranges, 0, 'end', 3.5, LENGTH)[0]).toEqual({ start: 1, end: 3.5 });
    expect(dragEdge(ranges, 0, 'end', 9, LENGTH)[0]).toEqual({ start: 1, end: 4 });
    expect(dragEdge(ranges, 1, 'end', 14, LENGTH)[1]).toEqual({ start: 4, end: 10 });
  });

  it('keeps every range at least the minimum length long', () => {
    const [moved] = dragEdge([{ start: 1, end: 2 }], 0, 'start', 1.99, LENGTH);
    expect(moved.end - moved.start).toBeGreaterThanOrEqual(MIN_LENGTH);
  });

  it('adds a range in free space, sorted, and refuses one that overlaps', () => {
    const ranges = [{ start: 4, end: 6 }];
    expect(addRange(ranges, 1, 2, LENGTH)).toEqual([{ start: 1, end: 2 }, { start: 4, end: 6 }]);
    expect(addRange(ranges, 5, 8, LENGTH)).toBeNull();
    expect(addRange(ranges, 3, 3.01, LENGTH)).toBeNull();
  });

  it('removes one range by its place in the list', () => {
    expect(removeRange([{ start: 1, end: 2 }, { start: 4, end: 6 }], 0)).toEqual([{ start: 4, end: 6 }]);
  });

  it('sorts ranges and compares two lists by their times', () => {
    expect(sortRanges([{ start: 4, end: 6 }, { start: 1, end: 2 }])[0].start).toBe(1);
    expect(sameRanges([{ start: 1, end: 2 }], [{ start: 1.0004, end: 2 }])).toBe(true);
    expect(sameRanges([{ start: 1, end: 2 }], [{ start: 1, end: 3 }])).toBe(false);
  });

  it('knows a single range covering the whole clip, and formats seconds for the list', () => {
    expect(isWhole([{ start: 0, end: 10 }], LENGTH)).toBe(true);
    expect(isWhole([{ start: 0, end: 9 }], LENGTH)).toBe(false);
    expect(seconds(65.25)).toBe('1:05.25');
  });
});
