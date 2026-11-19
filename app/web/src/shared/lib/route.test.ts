import { describe, expect, it } from 'vitest';
import { batchIdFromHash, reviewHash } from './route';

describe('review addresses', () => {
  it('round-trips a batch id and rejects other addresses', { tags: ['full'] }, () => {
    expect(batchIdFromHash(reviewHash(7))).toBe(7);
    expect(batchIdFromHash('')).toBeNull();
    expect(batchIdFromHash('#/production')).toBeNull();
    expect(batchIdFromHash('#/production/batches/abc')).toBeNull();
  });
});
