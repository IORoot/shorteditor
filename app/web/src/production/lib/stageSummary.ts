import { elapsed, span } from './passDetail';
import type { StageDetails, StageRunStatus } from './types';

interface Summarised {
  status: StageRunStatus | 'waiting';
  startedAt: string | null;
  finishedAt: string | null;
  details?: StageDetails | null;
}

/** The line under a stage's name: what it made, in the card's own numbers, or how long it has taken. */
export function stageSummary(row: Summarised, now: number): string {
  const details = row.details;
  if (details?.kind === 'clips') {
    const count = details.clips.length;
    return `${count} ${count === 1 ? 'clip' : 'clips'} · ${span(details.total * 1000)}`;
  }
  if (details?.kind === 'video') {
    const size = details.width && details.height ? ` · ${details.width}×${details.height}` : '';
    return `${span(details.duration * 1000)}${size}`;
  }
  if (!row.startedAt) return 'Not started';
  if (row.finishedAt) return `took ${span(elapsed(row.startedAt, row.finishedAt, now))}`;
  return `${span(elapsed(row.startedAt, null, now))} so far`;
}
