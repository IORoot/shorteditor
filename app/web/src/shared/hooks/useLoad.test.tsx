import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLoad } from './useLoad';

describe('useLoad', () => {
  it('starts loading then becomes ready with the data', { tags: ['full'] }, async () => {
    const { result } = renderHook(() => useLoad(() => Promise.resolve([1, 2]), []));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: [1, 2] }));
  });

  it('moves to error with the message when loading fails', { tags: ['full'] }, async () => {
    const { result } = renderHook(() => useLoad(() => Promise.reject(new Error('down')), []));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', message: 'down' }));
  });

  it('reloads when reload is called', { tags: ['full'] }, async () => {
    const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const { result } = renderHook(() => useLoad(load, []));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'first' }));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'second' }));
  });

  it('does nothing when there is no loader', { tags: ['full'] }, () => {
    const { result } = renderHook(() => useLoad(null, []));
    expect(result.current.state.status).toBe('loading');
  });

  it('keeps showing the data while a reload is in flight', { tags: ['full'] }, async () => {
    let resolveSecond: (value: string) => void = () => undefined;
    const load = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveSecond = resolve)));
    const { result } = renderHook(() => useLoad(load, []));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'first' }));
    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: 'ready', data: 'first' });
    await act(async () => resolveSecond('second'));
    expect(result.current.state).toEqual({ status: 'ready', data: 'second' });
  });
});
