/** A part of a clip, in seconds into the clip. */
export interface Range {
  start: number;
  end: number;
}

/** The shortest part a trim can be. */
export const MIN_LENGTH = 0.1;
const TOLERANCE = 0.001;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function sortRanges(ranges: Range[]): Range[] {
  return [...ranges].sort((a, b) => a.start - b.start);
}

/**
 * Moves one edge of a range to a new time. The edge stops at the neighbouring range, at the clip's ends, and
 * before the range would become shorter than MIN_LENGTH. Other ranges are not touched.
 */
export function dragEdge(ranges: Range[], index: number, edge: 'start' | 'end', seconds: number, length: number): Range[] {
  const range = ranges[index];
  const previousEnd = index > 0 ? ranges[index - 1].end : 0;
  const nextStart = index < ranges.length - 1 ? ranges[index + 1].start : length;
  const moved = edge === 'start'
    ? { ...range, start: clamp(seconds, previousEnd, range.end - MIN_LENGTH) }
    : { ...range, end: clamp(seconds, range.start + MIN_LENGTH, nextStart) };
  return ranges.map((item, position) => (position === index ? moved : item));
}

/** Adds a part between two times, or returns null when it is too short, outside the clip, or overlaps a part. */
export function addRange(ranges: Range[], from: number, to: number, length: number): Range[] | null {
  const start = clamp(Math.min(from, to), 0, length);
  const end = clamp(Math.max(from, to), 0, length);
  if (end - start < MIN_LENGTH) return null;
  if (ranges.some((range) => start < range.end && end > range.start)) return null;
  return sortRanges([...ranges, { start, end }]);
}

export function removeRange(ranges: Range[], index: number): Range[] {
  return ranges.filter((_, position) => position !== index);
}

/** Two lists of parts are the same when every part has the same start and end, to a millisecond. */
export function sameRanges(a: Range[], b: Range[]): boolean {
  const first = sortRanges(a);
  const second = sortRanges(b);
  return first.length === second.length && first.every((range, i) => Math.abs(range.start - second[i].start) < TOLERANCE && Math.abs(range.end - second[i].end) < TOLERANCE);
}

/** One part that covers the whole clip. */
export function isWhole(ranges: Range[], length: number): boolean {
  return ranges.length === 1 && ranges[0].start <= TOLERANCE && ranges[0].end >= length - TOLERANCE;
}

/** Seconds as m:ss.hh, for the list of parts. */
export function seconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}
