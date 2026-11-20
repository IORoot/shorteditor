import { describe, expect, it } from 'vitest';
import { stillUrl } from './api';

describe('stillUrl', () => {
  it('asks for the frame of one clip at one time, with the clip name encoded', () => {
    expect(stillUrl(7, 'a b.mp4', 2.5)).toBe('/api/production/passes/7/still?clip=a%20b.mp4&at=2.5');
  });
});
