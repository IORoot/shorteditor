import { describe, expect, it } from 'vitest';
import { inFilter, listSubtitle } from './batchList';
import type { BatchListItem } from './types';

const item = (over: Partial<BatchListItem>): BatchListItem => ({
  id: 1, name: 'Coach', inputFolder: '/in/coach', pipelineName: 'Join clips', runNumber: 1, runAt: null,
  folderCount: 2, approvedCount: 0, failedCount: 0, status: 'review', ...over,
});

describe('batch list filters', () => {
  it('puts a batch with a failed card under Failed as well as its own status', { tags: ['full'] }, () => {
    const mixed = item({ status: 'failed', failedCount: 1 });
    expect(inFilter(mixed, 'failed')).toBe(true);
    expect(inFilter(mixed, 'review')).toBe(false);
    expect(inFilter(item({ status: 'approved' }), 'all')).toBe(true);
  });
});

describe('batch list subtitle', () => {
  it('counts batches, running ones and ones to review', { tags: ['full'] }, () => {
    expect(listSubtitle([])).toBe('No batches yet');
    expect(listSubtitle([item({ status: 'running' }), item({ id: 2, status: 'review' }), item({ id: 3, status: 'approved' })]))
      .toBe('3 batches · 1 running · 1 to review');
    expect(listSubtitle([item({ status: 'failed', failedCount: 1 }), item({ id: 2, status: 'queued' })]))
      .toBe('2 batches · 1 queued · 1 to review · 1 failed');
  });
});
