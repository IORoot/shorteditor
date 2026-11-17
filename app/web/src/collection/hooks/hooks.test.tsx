import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { makeConfig } from '../test/fixtures';
import { useFolderPreview } from './useFolderPreview';

describe('useFolderPreview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the API for a preview of the current config', async () => {
    const spy = vi.spyOn(api, 'previewFolder').mockResolvedValue({ relativePath: 'x', fullPath: '/o/x' });
    const { result } = renderHook(() => useFolderPreview(makeConfig(), '2026-11-14T18:40:00', 0));
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: { relativePath: 'x', fullPath: '/o/x' } }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ folderTemplate: '{date:YYYY-MM-DD}_{weekday}_{suffix}', suffix: 'coach' }));
  });

  it('reports errors from the API', async () => {
    vi.spyOn(api, 'previewFolder').mockRejectedValue(new Error('Unknown token {bogus}'));
    const { result } = renderHook(() => useFolderPreview(makeConfig(), '2026-11-14T18:40:00', 0));
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: 'Unknown token {bogus}' }));
  });
});
