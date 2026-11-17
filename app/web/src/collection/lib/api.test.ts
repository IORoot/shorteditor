import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
import { ApiError } from '../../shared/lib/http';
import type { ScheduleDraft } from './types';
import { makeCollector, makeConfig } from '../test/fixtures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('ApiClient', () => {
  it('lists collectors from the collectors endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([makeCollector()]));
    const client = new ApiClient(fetchImpl);
    await expect(client.listCollectors()).resolves.toEqual([makeCollector()]);
    expect(fetchImpl).toHaveBeenCalledWith('/api/collectors', undefined);
  });

  it('lists runs for one collector', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await new ApiClient(fetchImpl).listRuns(7);
    expect(fetchImpl).toHaveBeenCalledWith('/api/collectors/7/runs', undefined);
  });

  it('sends the schedule draft as a PUT body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeCollector({ id: 2 })));
    const draft: ScheduleDraft = { enabled: true, kind: 'daily', time: '23:00', weekdays: [], dayOfMonth: 1, cron: '' };
    await new ApiClient(fetchImpl).saveSchedule(2, draft);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/collectors/2/schedule');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toMatchObject({ time: '23:00', enabled: true });
  });

  it('throws an ApiError with the status when the response is not ok', async () => {
    const client = new ApiClient(vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const error = await client.listCollectors().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
  });

  it('uses the server detail as the error message', async () => {
    const client = new ApiClient(vi.fn().mockResolvedValue(jsonResponse({ detail: 'Unknown token {bogus}' }, 422)));
    await expect(client.previewFolder({ folderTemplate: '{bogus}', outputFolder: '', groupBy: 'day', suffix: '', sampleDate: '2026-11-14T18:40:00' })).rejects.toThrow('Unknown token {bogus}');
  });

  it('saves a collector config with PUT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(makeCollector({ id: 3 })));
    await new ApiClient(fetchImpl).saveConfig(3, makeConfig());
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/collectors/3');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body)).folderTemplate).toBe('{date:YYYY-MM-DD}_{weekday}_{suffix}');
  });

  it('posts folder previews', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ relativePath: 'a', fullPath: '/o/a' }));
    await new ApiClient(fetchImpl).previewFolder({ folderTemplate: 'a', outputFolder: '/o', groupBy: 'day', suffix: '', sampleDate: '2026-11-14T18:40:00' });
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[1].method).toBe('POST');
  });

  it('browses with an encoded path and without one', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ path: '/', parent: null, entries: [] })));
    const client = new ApiClient(fetchImpl);
    await client.browse('/Volumes/My Drive');
    await client.browse();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/fs/browse?path=%2FVolumes%2FMy%20Drive');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/fs/browse');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    const client = new ApiClient(vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
    await expect(client.listCollectors()).rejects.toThrow('failed with 500');
  });

  it('posts dry runs, starts runs and undoes runs', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 1 })));
    const client = new ApiClient(fetchImpl);
    await client.dryRun(4);
    await client.startRun(4);
    await client.undoRun(9);
    const calls = fetchImpl.mock.calls as [string, RequestInit][];
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'POST /api/collectors/4/dry-run',
      'POST /api/collectors/4/run',
      'POST /api/runs/9/undo',
    ]);
  });

  it('fills in missing filter settings when an older backend lists collectors', async () => {
    const { filters, dateSource, filenamePattern, ...oldConfig } = makeConfig();
    void filters; void dateSource; void filenamePattern;
    const old = { ...makeCollector(), config: oldConfig };
    const client = new ApiClient(vi.fn().mockResolvedValue(jsonResponse([old])));
    const [collector] = await client.listCollectors();
    expect(collector.config.filters).toEqual([]);
    expect(collector.config.dateSource).toBe('modified');
  });

  it('refuses to report a save as successful when an old backend dropped the filters', async () => {
    const { filters, ...oldConfig } = makeConfig();
    void filters;
    const client = new ApiClient(vi.fn().mockResolvedValue(jsonResponse({ ...makeCollector(), config: oldConfig })));
    await expect(client.saveConfig(1, makeConfig())).rejects.toThrow(/out of date/);
  });
});
