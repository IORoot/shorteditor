import { describe, expect, it, vi } from 'vitest';
import { FsApi } from './fsApi';

describe('FsApi', () => {
  it('asks the backend for a folder listing, with the path encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ path: '/a b', parent: '/', entries: [] })));
    const result = await new FsApi(fetchMock).browse('/a b');
    expect(fetchMock).toHaveBeenCalledWith('/api/fs/browse?path=%2Fa%20b', undefined);
    expect(result.path).toBe('/a b');
  });

  it('starts from the default folder when no path is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ path: '/', parent: null, entries: [] })));
    await new FsApi(fetchMock).browse();
    expect(fetchMock).toHaveBeenCalledWith('/api/fs/browse', undefined);
  });
});
