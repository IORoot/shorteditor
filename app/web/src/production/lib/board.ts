import type { Tone } from '../../shared/lib/types';
import type { BatchCard } from './types';

export type Column = 'review' | 'running' | 'queued' | 'approved';

/** Left to right: Queued, Running, Review, Approved. */
export const COLUMNS: Column[] = ['queued', 'running', 'review', 'approved'];

const COLUMN_OF: Record<BatchCard['status'], Column> = {
  review: 'review',
  blocked: 'review',  // waiting for a choice from the user, so it stays where the user looks
  failed: 'review',  // a failed batch stays in Review with a red background
  running: 'running',
  queued: 'queued',
  approved: 'approved',
};

/** A status this version does not know is shown in Review rather than breaking the board. */
export function columnOf(card: BatchCard): Column {
  return COLUMN_OF[card.status] ?? 'review';
}

export function groupCards(cards: BatchCard[]): Record<Column, BatchCard[]> {
  const groups: Record<Column, BatchCard[]> = { review: [], running: [], queued: [], approved: [] };
  for (const card of cards) groups[columnOf(card)].push(card);
  const newestFirst = (a: BatchCard, b: BatchCard) => b.batchId - a.batchId;
  const position = (card: BatchCard) => card.queuePosition ?? Number.MAX_SAFE_INTEGER;
  groups.queued.sort((a, b) => position(a) - position(b));
  for (const column of ['review', 'approved'] as const) groups[column].sort(newestFirst);
  return groups;
}

function failedCount(cards: BatchCard[]): number {
  return cards.filter((card) => card.status === 'failed').length;
}

export function subtitle(cards: BatchCard[]): string {
  if (cards.length === 0) return 'No batches yet';
  const groups = groupCards(cards);
  const parts = [
    `${cards.length} ${cards.length === 1 ? 'batch' : 'batches'}`,
    groups.queued.length ? `${groups.queued.length} queued` : '',
    groups.running.length ? `${groups.running.length} running` : '',
    groups.review.length ? `${groups.review.length} to review` : '',
    failedCount(cards) ? `${failedCount(cards)} failed` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

const LABEL: Record<BatchCard['status'], string> = {
  review: 'Ready',
  blocked: 'Blocked',
  failed: 'Failed',
  running: 'Running',
  queued: 'Queued',
  approved: 'Approved',
};

const TONE: Record<BatchCard['status'], Tone> = {
  review: 'ok',
  blocked: 'warn',
  failed: 'bad',
  running: 'info',
  queued: 'info',
  approved: 'ok',
};

export const chipLabel = (card: BatchCard): string => LABEL[card.status] ?? card.status;
export const toneOf = (card: BatchCard): Tone => TONE[card.status] ?? 'warn';

/** The last path segment, for showing a folder or file by name. */
export function lastSegment(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

const MAX_SEGMENTS = 50;

export type SegmentState = 'done' | 'run' | 'todo';

/** One segment per stage: finished, the one it is at, or still to come. */
export function stageSegments(card: BatchCard): SegmentState[] {
  const count = Math.min(Math.max(0, card.stageCount), MAX_SEGMENTS);
  if (card.status === 'review' || card.status === 'approved') return Array.from({ length: count }, () => 'done');
  if (card.status === 'queued') return Array.from({ length: count }, () => 'todo');
  if (card.status === 'failed' && card.stagePosition <= 0) return Array.from({ length: count }, () => 'todo');
  const at = Math.min(Math.max(card.stagePosition, 1), count) - 1;
  return Array.from({ length: count }, (_, index) => (index < at ? 'done' : index === at ? 'run' : 'todo'));
}

export function queueCaption(card: BatchCard): string {
  if (card.queuePosition === null) return '';
  if (card.queuePosition === 0) return 'Next';
  return `Starts after ${card.queuePosition} ${card.queuePosition === 1 ? 'batch' : 'batches'}`;
}

/** Seconds as mm:ss. */
export function clock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
