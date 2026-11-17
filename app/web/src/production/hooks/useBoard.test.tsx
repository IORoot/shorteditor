import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCard } from '../test/fixtures';
import { useBoard } from './useBoard';

const running = [makeCard({ status: 'running' })];
const idle = [makeCard({ status: 'approved' })];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useBoard', () => {
  it('loads once, then refreshes quietly without going back to loading', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockResolvedValueOnce(running).mockResolvedValue([makeCard({ status: 'review' })]);
    const { result } = renderHook(() => useBoard({ cards }, 2000, 10000));
    expect(result.current.state.status).toBe('loading');
    await flush();
    expect(result.current.state).toEqual({ status: 'ready', data: running });
    await wait(2000);
    expect(cards).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.status === 'ready' && result.current.state.data[0].status).toBe('review');
  });

  it('refreshes fast while something is queued or running and slowly when idle', async () => {
    const busy = vi.fn().mockResolvedValue(running);
    renderHook(() => useBoard({ cards: busy }, 2000, 10000));
    await flush();
    await wait(6000);
    expect(busy).toHaveBeenCalledTimes(4);
    const quiet = vi.fn().mockResolvedValue(idle);
    renderHook(() => useBoard({ cards: quiet }, 2000, 10000));
    await flush();
    await wait(6000);
    expect(quiet).toHaveBeenCalledTimes(1);
    await wait(4000);
    expect(quiet).toHaveBeenCalledTimes(2);
  });

  it('keeps the last data and flags it stale when a refresh fails, then recovers', async () => {
    const cards = vi.fn().mockResolvedValueOnce(running).mockRejectedValueOnce(new Error('down')).mockResolvedValue(idle);
    const { result } = renderHook(() => useBoard({ cards }, 2000, 10000));
    await flush();
    await wait(2000);
    expect(result.current.state).toEqual({ status: 'ready', data: running });
    expect(result.current.staleError).toBe('down');
    await wait(10000);
    expect(result.current.state).toEqual({ status: 'ready', data: idle });
    expect(result.current.staleError).toBeNull();
  });

  it('shows an error when the first load fails and recovers by itself', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockRejectedValueOnce(new Error('backend down')).mockResolvedValue(idle);
    const { result } = renderHook(() => useBoard({ cards }, 2000, 10000));
    await flush();
    expect(result.current.state).toEqual({ status: 'error', message: 'backend down' });
    await wait(10000);
    expect(result.current.state).toEqual({ status: 'ready', data: idle });
  });

  it('reload fetches straight away and keeps showing the data meanwhile', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockResolvedValue(idle);
    const { result } = renderHook(() => useBoard({ cards }, 2000, 10000));
    await flush();
    act(() => result.current.reload());
    expect(result.current.state.status).toBe('ready');
    await flush();
    expect(cards).toHaveBeenCalledTimes(2);
  });

  it('stops polling when it unmounts', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockResolvedValue(running);
    const { unmount } = renderHook(() => useBoard({ cards }, 2000, 10000));
    await flush();
    unmount();
    await wait(20000);
    expect(cards).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow answer that arrives after unmount', { tags: ['full'] }, async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const cards = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { unmount } = renderHook(() => useBoard({ cards } as never, 2000, 10000));
    unmount();
    resolve(running);
    await flush();
    await wait(20000);
    expect(cards).toHaveBeenCalledTimes(1);
  });

  it('uses the answer of the newest request when reload is called while one is in flight', { tags: ['full'] }, async () => {
    const answers: ((value: unknown) => void)[] = [];
    const cards = vi.fn(() => new Promise((resolve) => answers.push(resolve)));
    const { result } = renderHook(() => useBoard({ cards } as never, 2000, 10000));
    act(() => result.current.reload());
    await flush();
    expect(cards).toHaveBeenCalledTimes(2);
    answers[1](idle);
    await flush();
    answers[0](running);
    await flush();
    expect(result.current.state).toEqual({ status: 'ready', data: idle });
  });

  it('treats a server that never answers as a failure, so the board says it is stale', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockResolvedValueOnce(running).mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useBoard({ cards } as never, 2000, 10000));
    await flush();
    await wait(2000);
    expect(result.current.staleError).toBeNull();
    await wait(10000);
    expect(result.current.staleError).toMatch(/did not answer/);
    expect(result.current.state).toEqual({ status: 'ready', data: running });
  });
});
