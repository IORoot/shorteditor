import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { makeCollector } from './collection/test/fixtures';
import type { BatchCard, FolderPreview } from './production/lib/types';
import { listRowsFor, makeCard } from './production/test/fixtures';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}_.+$';


interface Request { url: string; method: string; body: unknown }

/** A fake server for the folders features. Every request is recorded; the board can change between requests. */
function folderServer() {
  const state = {
    cards: [makeCard({ name: 'Done', status: 'review', output: { path: '/out/done.mp4', duration: 58, sizeBytes: 46_000_000 } })] as BatchCard[],
    preview: { matches: [], notMatching: 0, truncated: false } as FolderPreview,
    previewError: null as string | null,
        requests: [] as Request[],
  };
  let nextId = 20;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    state.requests.push({ url, method, body });
    if (url === '/api/collectors') return json([makeCollector()]);
    if (url.startsWith('/api/collectors/')) return json([]);
    if (url === '/api/production/batches' && method === 'GET') return json(state.cards);
    if (url === '/api/production/batch-list' && method === 'GET') return json(listRowsFor(state.cards));
    if (url === '/api/production/defaults') return json({ outputRoot: '/Volumes/Edit/production_output', workers: [{ id: 'local', label: 'This computer' }] });
    if (url === '/api/production/pipelines') return json([{ id: 1, name: 'Join clips', stageCount: 5 }]);
    if (url === '/api/production/folders/preview') return state.previewError ? json({ detail: state.previewError }, 422) : json(state.preview);
    if (url === '/api/production/batches/bulk') {
      // one batch for the parent folder, with a card for each folder that will be created
      const parentName = String(body.parentFolder).split('/').filter(Boolean).pop() ?? '';
      const id = nextId++;
      const folders = state.preview.matches.filter((m) => m.status === 'will_create');
      state.cards = [...state.cards, ...folders.map((m) => makeCard({ batchId: id, name: parentName, folder: m.path, status: 'queued', queuePosition: 0 }))];
      return json({ created: [{ id, name: parentName, inputFolder: body.parentFolder }], skipped: [] }, 201);
    }
    return json({ detail: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  const posted = (pattern: RegExp) => state.requests.filter((r) => r.method === 'POST' && pattern.test(r.url));
  const sent = (method: string, pattern: RegExp) => state.requests.filter((r) => r.method === method && pattern.test(r.url));
  return { state, posted, sent };
}

async function openProduction() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Production' }));
  await screen.findByRole('heading', { name: 'Production', level: 1 });
}

const settledPreview = () => ({
  matches: [
    { name: '2026-11-14_a', path: '/c/2026-11-14_a', clipCount: 4, status: 'will_create' as const },
    { name: '2026-11-07_b', path: '/c/2026-11-07_b', clipCount: 2, status: 'will_create' as const },
    { name: '2026-10-17_old', path: '/c/2026-10-17_old', clipCount: 9, status: 'already_batched' as const },
  ],
  notMatching: 1,
  truncated: false,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Production folders and watching batches, end to end', () => {
  it('creates one batch for the parent folder, with a card for each new folder, and the list shows it as Queued', async () => {
    const backend = folderServer();
    backend.state.preview = settledPreview();
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    expect(await screen.findByText('2026-11-14_a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull());
    expect(backend.posted(/\/batches\/bulk$/)[0].body).toEqual({
      parentFolder: '/c', pattern: DATE_PATTERN, name: 'c', nameTemplate: '{name}', runOn: 'any', pipelineId: 1, autoRun: false,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'c, Queued' })).toBeInTheDocument());
  });

  it('with Keep watching on, one watching batch is created, and no separate watch', async () => {
    const backend = folderServer();
    backend.state.preview = settledPreview();
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    await screen.findByText('2026-11-14_a');
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch and start watching' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull());
    expect(backend.posted(/\/watches$/)).toHaveLength(0);
    expect(backend.posted(/\/batches\/bulk$/)[0].body).toEqual({
      parentFolder: '/c', pattern: DATE_PATTERN, name: 'Coach', nameTemplate: '{name}', runOn: 'any', pipelineId: 1, autoRun: false,
      watching: true, watchExisting: false, watchIntervalMinutes: 5, watchSettleMinutes: 10, watchMaxPerCheck: 20,
    });
  });

  it('a pattern the server refuses shows its message and keeps Start watching disabled', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.previewError = 'The pattern could take far too long to match';
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    fireEvent.click(await screen.findByRole('switch', { name: 'Keep watching this folder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('far too long');
    expect(screen.getByRole('button', { name: 'Create batch and start watching' })).toBeDisabled();
    expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(0);
  });
});
