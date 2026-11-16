import { describe, expect, it } from 'vitest';
import { TOKENS, insertToken } from './tokens';

describe('insertToken', () => {
  it('inserts at the cursor and returns the new cursor position', () => {
    expect(insertToken('ab', '{x}', 1, 1)).toEqual({ value: 'a{x}b', cursor: 4 });
  });

  it('replaces the selected range', () => {
    expect(insertToken('abcd', '{x}', 1, 3)).toEqual({ value: 'a{x}d', cursor: 4 });
  });

  it('clamps out-of-range positions', () => {
    expect(insertToken('ab', '{x}', 99, 120)).toEqual({ value: 'ab{x}', cursor: 5 });
    expect(insertToken('ab', '{x}', -4, -1)).toEqual({ value: '{x}ab', cursor: 3 });
  });

  it('lists the supported tokens with examples', () => {
    expect(TOKENS.map((t) => t.token)).toContain('{window:name}');
    expect(TOKENS.every((t) => t.example.length > 0)).toBe(true);
  });
});
