import { describe, expect, it, vi } from 'vitest';
import { PipelineApi } from './api';

function api(body: unknown = {}, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
  return { client: new PipelineApi(fetchMock), fetchMock };
}

const sent = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined };
};

const steps = [{ key: 'scan_folder', settings: {}, enabled: true }];

describe('PipelineApi', () => {
  it('reads the list, one pipeline, the impact, the stages', { tags: ['full'] }, async () => {
    for (const [call, url] of [
      [(c: PipelineApi) => c.list(), '/api/pipeline/pipelines'],
      [(c: PipelineApi) => c.get(3), '/api/pipeline/pipelines/3'],
      [(c: PipelineApi) => c.impact(3), '/api/pipeline/pipelines/3/impact'],
      [(c: PipelineApi) => c.stages(), '/api/pipeline/stages'],
    ] as const) {
      const { client, fetchMock } = api([]);
      await call(client);
      expect(sent(fetchMock)).toEqual({ url, method: 'GET', body: undefined });
    }
  });

  it('creates and saves with the exact body', async () => {
    const body = { name: 'A', description: '', steps };
    const created = api({ id: 1 });
    await created.client.create(body);
    expect(sent(created.fetchMock)).toEqual({ url: '/api/pipeline/pipelines', method: 'POST', body });
    const saved = api({ id: 1 });
    await saved.client.save(1, body);
    expect(sent(saved.fetchMock)).toEqual({ url: '/api/pipeline/pipelines/1', method: 'PUT', body });
  });

  it('switches, duplicates and deletes', { tags: ['full'] }, async () => {
    const on = api({});
    await on.client.setEnabled(2, false);
    expect(sent(on.fetchMock)).toEqual({ url: '/api/pipeline/pipelines/2/enabled', method: 'POST', body: { enabled: false } });
    const copy = api({});
    await copy.client.duplicate(2);
    expect(sent(copy.fetchMock)).toMatchObject({ url: '/api/pipeline/pipelines/2/duplicate', method: 'POST' });
    const gone = api(null, 204);
    await gone.client.deletePipeline(2);
    expect(sent(gone.fetchMock)).toMatchObject({ url: '/api/pipeline/pipelines/2', method: 'DELETE' });
  });

  it('unwraps the template and the check', { tags: ['full'] }, async () => {
    expect(await api({ steps }).client.template()).toEqual(steps);
    const check = api({ errors: ['bad'] });
    expect(await check.client.check(steps)).toEqual(['bad']);
    expect(sent(check.fetchMock)).toEqual({ url: '/api/pipeline/check', method: 'POST', body: { steps } });
  });

  it('shows the server message on a refusal', { tags: ['full'] }, async () => {
    const { client } = api({ detail: 'There is already a pipeline called A' }, 422);
    await expect(client.create({ name: 'A', description: '', steps })).rejects.toThrow('There is already a pipeline called A');
  });
});
