import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only updates after the delay', { tags: ['full'] }, () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('b');
  });
});
