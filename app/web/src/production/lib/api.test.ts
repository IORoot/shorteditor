import { describe, expect, it, vi } from 'vitest';
import { ProductionApi } from './api';

function api(body: unknown = {}, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return { client: new ProductionApi(fetchMock), fetchMock };
}

const sent = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined };
};

describe('ProductionApi', () => {
  it('reads the board and the defaults', { tags: ['full'] }, async () => {
    const board = api([]);
    await board.client.cards();
    expect(sent(board.fetchMock)).toMatchObject({ url: '/api/production/batches', method: 'GET' });
    const defaults = api({ outputRoot: '/out', workers: [] });
    expect((await defaults.client.defaults()).outputRoot).toBe('/out');
    expect(sent(defaults.fetchMock).url).toBe('/api/production/defaults');
  });

  it('creates a batch with the exact request body', async () => {
    const { client, fetchMock } = api({ id: 4 });
    const body = { name: 'A', inputFolder: '/in', pipelineId: 1, runOn: 'any' };
    await client.createBatch(body);
    expect(sent(fetchMock)).toEqual({ url: '/api/production/batches', method: 'POST', body });
  });

  it('approves, resolves and runs again against the right pass and batch', { tags: ['full'] }, async () => {
    const approve = api({});
    await approve.client.approve(7);
    expect(sent(approve.fetchMock)).toMatchObject({ url: '/api/production/passes/7/approve', method: 'POST' });
    const resolve = api({});
    await resolve.client.resolve(7, 'keep_first');
    expect(sent(resolve.fetchMock)).toEqual({ url: '/api/production/passes/7/resolve', method: 'POST', body: { choice: 'keep_first' } });
    const again = api({});
    await again.client.runAgain(3);
    expect(sent(again.fetchMock)).toEqual({ url: '/api/production/batches/3/runs', method: 'POST', body: {} });
    const switched = api({});
    await switched.client.runAgain(3, 2);
    expect(sent(switched.fetchMock).body).toEqual({ pipelineId: 2 });
  });

  it('lists the switched-on pipelines and builds the video address', { tags: ['full'] }, async () => {
    const { client, fetchMock } = api([{ id: 1, name: 'Join clips', stageCount: 5 }]);
    expect(await client.pipelines()).toEqual([{ id: 1, name: 'Join clips', stageCount: 5 }]);
    expect(sent(fetchMock).url).toBe('/api/production/pipelines');
    expect(client.outputUrl(12)).toBe('/api/production/passes/12/output');
  });

  it('shows the server message for a refused action and a readable one for a bad request', { tags: ['full'] }, async () => {
    const refused = api({ detail: 'A newer pass exists for this batch.' }, 409);
    await expect(refused.client.approve(1)).rejects.toThrow('A newer pass exists for this batch.');
    const bad = api({ detail: [{ loc: ['body', 'name'], msg: 'Field required' }] }, 422);
    await expect(bad.client.createBatch({ name: '', inputFolder: '', pipelineId: 1, runOn: 'any' })).rejects.toThrow('The request was not accepted: Field required');
  });

  it('passes a network failure through as an error', { tags: ['full'] }, async () => {
    const client = new ProductionApi(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.cards()).rejects.toThrow('Failed to fetch');
  });

  it('previews the folders inside a parent folder and creates batches from them', { tags: ['full'] }, async () => {
    const preview = api({ matches: [], notMatching: 0, truncated: false });
    await preview.client.previewFolders('/c', '^.+$');
    expect(sent(preview.fetchMock)).toEqual({ url: '/api/production/folders/preview', method: 'POST', body: { parentFolder: '/c', pattern: '^.+$' } });
    const withRoot = api({ matches: [], notMatching: 0, truncated: false });
    await withRoot.client.previewFolders('/c', '^.+$', '/out');
    expect(sent(withRoot.fetchMock).body).toEqual({ parentFolder: '/c', pattern: '^.+$', outputRoot: '/out' });
    const bulk = api({ created: [], skipped: [] });
    const body = { parentFolder: '/c', pattern: '^.+$', nameTemplate: '{name}', pipelineId: 1, runOn: 'any' };
    await bulk.client.createBatches(body);
    expect(sent(bulk.fetchMock)).toEqual({ url: '/api/production/batches/bulk', method: 'POST', body });
  });

});
