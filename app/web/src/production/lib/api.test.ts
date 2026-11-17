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
  it('reads the board and the defaults', async () => {
    const board = api([]);
    await board.client.cards();
    expect(sent(board.fetchMock)).toMatchObject({ url: '/api/production/batches', method: 'GET' });
    const defaults = api({ outputRoot: '/out', workers: [] });
    expect((await defaults.client.defaults()).outputRoot).toBe('/out');
    expect(sent(defaults.fetchMock).url).toBe('/api/production/defaults');
  });

  it('creates a batch with the exact request body', async () => {
    const { client, fetchMock } = api({ id: 4 });
    const body = { name: 'A', inputFolder: '/in', steps: [{ key: 'scan_folder', settings: {}, enabled: true }], runOn: 'any' };
    await client.createBatch(body);
    expect(sent(fetchMock)).toEqual({ url: '/api/production/batches', method: 'POST', body });
  });

  it('approves, resolves and runs again against the right pass and batch', async () => {
    const approve = api({});
    await approve.client.approve(7);
    expect(sent(approve.fetchMock)).toMatchObject({ url: '/api/production/passes/7/approve', method: 'POST' });
    const resolve = api({});
    await resolve.client.resolve(7, 'keep_first');
    expect(sent(resolve.fetchMock)).toEqual({ url: '/api/production/passes/7/resolve', method: 'POST', body: { choice: 'keep_first' } });
    const again = api({});
    await again.client.runAgain(3);
    expect(sent(again.fetchMock)).toEqual({ url: '/api/production/batches/3/passes', method: 'POST', body: {} });
    const withSteps = api({});
    await withSteps.client.runAgain(3, [{ key: 'scan_folder', settings: {}, enabled: true }]);
    expect(sent(withSteps.fetchMock).body).toEqual({ steps: [{ key: 'scan_folder', settings: {}, enabled: true }] });
  });

  it('validates a pipeline and builds the video address', async () => {
    const { client, fetchMock } = api({ errors: ['x'] });
    expect(await client.validate([])).toEqual({ errors: ['x'] });
    expect(sent(fetchMock).url).toBe('/api/production/pipelines/validate');
    expect(client.outputUrl(12)).toBe('/api/production/passes/12/output');
  });

  it('shows the server message for a refused action and a readable one for a bad request', async () => {
    const refused = api({ detail: 'A newer pass exists for this batch.' }, 409);
    await expect(refused.client.approve(1)).rejects.toThrow('A newer pass exists for this batch.');
    const bad = api({ detail: [{ loc: ['body', 'name'], msg: 'Field required' }] }, 422);
    await expect(bad.client.createBatch({ name: '', inputFolder: '', steps: [], runOn: 'any' })).rejects.toThrow('The request was not accepted: Field required');
  });

  it('passes a network failure through as an error', async () => {
    const client = new ProductionApi(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.cards()).rejects.toThrow('Failed to fetch');
  });
});
