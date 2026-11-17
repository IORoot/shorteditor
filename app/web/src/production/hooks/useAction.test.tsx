import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAction } from './useAction';

describe('useAction', () => {
  it('is busy while the action runs and reports success', async () => {
    let finish: () => void = () => undefined;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAction());
    let outcome: Promise<boolean> = Promise.resolve(false);
    act(() => { outcome = result.current.run(action); });
    expect(result.current.busy).toBe(true);
    await act(async () => { finish(); await outcome; });
    expect(result.current.busy).toBe(false);
    expect(await outcome).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('ignores a second call while the first is still running', async () => {
    let finish: () => void = () => undefined;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAction());
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = result.current.run(action);
      second = result.current.run(action);
    });
    await act(async () => { finish(); await first; });
    expect(action).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);
  });

  it('keeps the error message, clears it on the next try and on request', async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => { expect(await result.current.run(() => Promise.reject(new Error('A newer pass exists')))).toBe(false); });
    expect(result.current.error).toBe('A newer pass exists');
    expect(result.current.busy).toBe(false);
    await act(async () => { await result.current.run(() => Promise.resolve()); });
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.run(() => Promise.reject('plain text')); });
    expect(result.current.error).toBe('Something went wrong');
    await act(async () => { await result.current.run(() => Promise.reject(new Error(''))); });
    expect(result.current.error).toBe('Something went wrong');
    act(() => result.current.clear());
    expect(result.current.error).toBeNull();
  });
});
