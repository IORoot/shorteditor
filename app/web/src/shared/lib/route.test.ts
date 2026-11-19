import { describe, expect, it } from 'vitest';
import { batchHash, batchIdFromHash, cardHash, cardIdFromHash } from './route';

describe('card and batch addresses', () => {
  it('round-trips a card id and rejects other addresses', { tags: ['full'] }, () => {
    expect(cardIdFromHash(cardHash(12))).toBe(12);
    expect(cardIdFromHash(batchHash(7))).toBeNull();
    expect(cardIdFromHash('#/production/cards/abc')).toBeNull();
  });

  it('round-trips a batch id and rejects other addresses', { tags: ['full'] }, () => {
    expect(batchIdFromHash(batchHash(7))).toBe(7);
    expect(batchIdFromHash(cardHash(7))).toBeNull();
    expect(batchIdFromHash('')).toBeNull();
    expect(batchIdFromHash('#/production/batches/abc')).toBeNull();
  });
});
