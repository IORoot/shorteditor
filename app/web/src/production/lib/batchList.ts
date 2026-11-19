import type { BatchListItem } from './types';

export type BatchFilter = 'all' | 'running' | 'queued' | 'review' | 'failed' | 'approved';

export const FILTERS: { id: BatchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'queued', label: 'Queued' },
  { id: 'review', label: 'Review' },
  { id: 'failed', label: 'Failed' },
  { id: 'approved', label: 'Approved' },
];

/** Whether a batch belongs under a filter tab. A batch with a failed card is under Failed as well as its own status. */
export function inFilter(item: BatchListItem, filter: BatchFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'failed') return item.failedCount > 0;
  return item.status === filter;
}

/** The line under the page title: how many batches, and how many of their cards are waiting or running. */
export function listSubtitle(items: BatchListItem[]): string {
  if (items.length === 0) return 'No batches yet';
  const count = (test: (item: BatchListItem) => boolean) => items.filter(test).length;
  const parts = [`${items.length} ${items.length === 1 ? 'batch' : 'batches'}`];
  const queued = count((item) => item.status === 'queued');
  const running = count((item) => item.status === 'running');
  const toReview = count((item) => item.status === 'review' || item.status === 'failed');
  const failed = count((item) => item.failedCount > 0);
  if (queued) parts.push(`${queued} queued`);
  if (running) parts.push(`${running} running`);
  if (toReview) parts.push(`${toReview} to review`);
  if (failed) parts.push(`${failed} failed`);
  return parts.join(' · ');
}
