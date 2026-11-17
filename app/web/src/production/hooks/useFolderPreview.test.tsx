import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderPreview } from '../lib/types';
import { useFolderPreview } from './useFolderPreview';

const answer = (names: string[]): FolderPreview => ({ matches: names.map((name) => ({ name, path: `/p/${name}`, clipCount: 1, status: 'will_create' as const })), notMatching: 0, truncated: false });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useFolderPreview', () => {
  it('stays idle and never calls the server without a parent folder or a pattern', async () => {
    const preview = vi.fn();
    const { result, rerender } = renderHook(({ parent, pattern }) => useFolderPreview(preview, parent, pattern, '', 400), { initialProps: { parent: '', pattern: '^.+$' } });
    await wait(1000);
    expect(result.current.status).toBe('idle');
    rerender({ parent: '/c', pattern: '' });
    await wait(1000);
    expect(preview).not.toHaveBeenCalled();
  });

  it('asks once, after the typing stops', async () => {
    const preview = vi.fn().mockResolvedValue(answer(['a']));
    const { result, rerender } = renderHook(({ pattern }) => useFolderPreview(preview, '/c', pattern, '', 400), { initialProps: { pattern: '^a' } });
    await wait(200);
    rerender({ pattern: '^ab' });
    await wait(200);
    rerender({ pattern: '^abc' });
    await wait(399);
    expect(preview).not.toHaveBeenCalled();
    await wait(2);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith('/c', '^abc', undefined);
    expect(result.current).toEqual({ status: 'ready', data: answer(['a']), refreshing: false });
  });

  it('passes the output folder along when there is one', async () => {
    const preview = vi.fn().mockResolvedValue(answer([]));
    renderHook(() => useFolderPreview(preview, '/c', '^.+$', '/out', 400));
    await wait(450);
    expect(preview).toHaveBeenCalledWith('/c', '^.+$', '/out');
  });

  it('shows the server message when the pattern is refused', async () => {
    const preview = vi.fn().mockRejectedValue(new Error('The pattern could take far too long to match'));
    const { result } = renderHook(() => useFolderPreview(preview, '/c', '(a+)+', '', 400));
    await wait(450);
    expect(result.current).toEqual({ status: 'error', message: 'The pattern could take far too long to match' });
  });

  it('keeps the last list on screen, marked refreshing, while the next one loads', async () => {
    let finish: (value: FolderPreview) => void = () => undefined;
    const preview = vi.fn().mockResolvedValueOnce(answer(['a'])).mockImplementationOnce(() => new Promise<FolderPreview>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ pattern }) => useFolderPreview(preview, '/c', pattern, '', 400), { initialProps: { pattern: '^a' } });
    await wait(450);
    rerender({ pattern: '^b' });
    await wait(450);
    expect(result.current).toEqual({ status: 'ready', data: answer(['a']), refreshing: true });
    await act(async () => { finish(answer(['b'])); });
    expect(result.current).toEqual({ status: 'ready', data: answer(['b']), refreshing: false });
  });

  it('ignores an old answer that arrives after a newer question', async () => {
    const finishers: ((value: FolderPreview) => void)[] = [];
    const preview = vi.fn(() => new Promise<FolderPreview>((resolve) => finishers.push(resolve)));
    const { result, rerender } = renderHook(({ pattern }) => useFolderPreview(preview, '/c', pattern, '', 400), { initialProps: { pattern: '^a' } });
    await wait(450);
    rerender({ pattern: '^b' });
    await wait(450);
    await act(async () => { finishers[1](answer(['new'])); });
    await act(async () => { finishers[0](answer(['old'])); });
    expect(result.current).toEqual({ status: 'ready', data: answer(['new']), refreshing: false });
  });

  it('goes back to idle when the parent is cleared, and stops asking after unmount', async () => {
    const preview = vi.fn().mockResolvedValue(answer(['a']));
    const { result, rerender, unmount } = renderHook(({ parent }) => useFolderPreview(preview, parent, '^.+$', '', 400), { initialProps: { parent: '/c' } });
    await wait(450);
    rerender({ parent: '' });
    expect(result.current.status).toBe('idle');
    rerender({ parent: '/d' });
    unmount();
    await wait(1000);
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('can be switched off', async () => {
    const preview = vi.fn();
    renderHook(() => useFolderPreview(preview, '/c', '^.+$', '', 400, false));
    await wait(1000);
    expect(preview).not.toHaveBeenCalled();
  });
});
