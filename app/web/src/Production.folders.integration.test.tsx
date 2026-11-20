import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { makeCollector } from './collection/test/fixtures';
import type { BatchCard, FolderPreview, WatchView } from './production/lib/types';
import { listRowsFor, makeCard } from './production/test/fixtures';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}_.+$';

function watch(over: Partial<WatchView> = {}): WatchView {
  return {
    id: 1, name: 'Coach', parentFolder: '/c', pattern: DATE_PATTERN, nameTemplate: '{name}', steps: [], pipelineId: 1, pipelineName: 'Join clips', runOn: 'any', outputRoot: null,
    intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, enabled: true, createdAt: '2026-11-17T10:00:00', lastCheckedAt: '2026-11-17T10:42:00', lastError: null,
    waiting: [], createdTotal: 2, status: 'watching', statusLine: 'Last checked 10:42 · created 2 batches in total · next check in 3 minutes', ...over,
  };
}

interface Request { url: string; method: string; body: unknown }

/** A fake server for the folders and watches features. Every request is recorded; the board and the watches can change between requests. */
function folderServer() {
  const state = {
    cards: [makeCard({ name: 'Done', status: 'review', output: { path: '/out/done.mp4', duration: 58, sizeBytes: 46_000_000 } })] as BatchCard[],
    watches: [watch()],
    preview: { matches: [], notMatching: 0, truncated: false } as FolderPreview,
    previewError: null as string | null,
    checkCreates: [] as BatchCard[],
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
    if (url === '/api/production/watches' && method === 'GET') return json(state.watches);
    if (url === '/api/production/watches' && method === 'POST') {
      const created = watch({ id: nextId++, name: body.name, parentFolder: body.parentFolder, pattern: body.pattern, enabled: body.enabled, status: 'watching', statusLine: 'Not checked yet' });
      state.watches.push(created);
      return json(created, 201);
    }
    const one = /^\/api\/production\/watches\/(\d+)(\/enabled|\/check)?$/.exec(url);
    if (one) {
      const id = Number(one[1]);
      const found = state.watches.find((w) => w.id === id);
      if (!found) return json({ detail: 'That watch no longer exists' }, 404);
      if (one[2] === '/check') {
        state.cards = [...state.cards, ...state.checkCreates];
        return json({ created: state.checkCreates, waiting: [], error: null });
      }
      if (one[2] === '/enabled' && method === 'POST') {
        Object.assign(found, { enabled: body.enabled, status: body.enabled ? 'watching' : 'paused' });
        return json(found);
      }
      if (!one[2] && method === 'PUT') {
        Object.assign(found, body);
        return json(found);
      }
      if (!one[2] && method === 'DELETE') {
        state.watches = state.watches.filter((w) => w.id !== id);
        return noContent();
      }
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

describe('Production folders and watches, end to end', () => {
  it('creates one batch for the parent folder, with a card for each new folder, and the list shows it as Queued', async () => {
    const backend = folderServer();
    backend.state.preview = settledPreview();
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    expect(await screen.findByText('2026-11-14_a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull());
    expect(backend.posted(/\/batches\/bulk$/)[0].body).toEqual({
      parentFolder: '/c', pattern: DATE_PATTERN, nameTemplate: '{name}', runOn: 'any', pipelineId: 1, autoRun: false,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'c, Queued' })).toBeInTheDocument());
  });

  it('Add watch from the panel opens a watch-only form, and saving it returns to the panel with the new watch', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.preview = { matches: [], notMatching: 0, truncated: false };
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Watches' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add watch' }));
    expect(await screen.findByRole('heading', { name: 'New watch' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'One folder' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/Volumes/Edit/Sat' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start watching' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
    await waitFor(() => expect(backend.posted(/\/watches$/)).toHaveLength(1));
    expect(backend.posted(/\/watches$/)[0].body).toMatchObject({ name: 'Sat', parentFolder: '/Volumes/Edit/Sat', includeExisting: false, enabled: true });
    expect(await screen.findByRole('dialog', { name: 'Watches' })).toBeInTheDocument();
    expect(await screen.findByRole('listitem', { name: 'Watch Sat' })).toBeInTheDocument();
  });

  it('with Keep watching on, Start watching saves the watch and creates no one-off batches', async () => {
    const backend = folderServer();
    backend.state.preview = settledPreview();
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    await screen.findByText('2026-11-14_a');
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.change(screen.getByLabelText('Watch name'), { target: { value: 'Coach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull());
    expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(0);
    expect(backend.posted(/\/watches$/)[0].body).toEqual({
      name: 'Coach', parentFolder: '/c', pattern: DATE_PATTERN, nameTemplate: '{name}', runOn: 'any', pipelineId: 1,
      intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, includeExisting: false, enabled: true,
    });
  });

  it('with the existing folders switched on, the watch is created once and says it will batch them now', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.preview = settledPreview();
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    await screen.findByText('2026-11-14_a');
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Also create batches for the 2 folders already there' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 batches and start watching' }));
    await waitFor(() => expect(backend.posted(/\/watches$/)).toHaveLength(1));
    expect(backend.posted(/\/watches$/)[0].body).toMatchObject({ includeExisting: true });
    expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(0);
  });

  it('the Watches panel shows each status, pauses a watch, checks one now, and deletes after asking', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.watches = [
      watch({ id: 1, name: 'Coach' }),
      watch({ id: 2, name: 'Camera', status: 'waiting', statusLine: 'Waiting for 2026-11-14_a to settle: files are still changing. It needs 10 quiet minutes.', waiting: ['2026-11-14_a'] }),
      watch({ id: 3, name: 'Old', enabled: false, status: 'paused', statusLine: 'Paused · last checked 10:42' }),
      watch({ id: 4, name: 'Broken', status: 'problem', lastError: 'The folder /Volumes/Edit does not exist', statusLine: 'Problem: The folder /Volumes/Edit does not exist. Checking again in 5 minutes.' }),
    ];
    backend.state.checkCreates = [makeCard({ batchId: 30, name: '2026-11-07_b', status: 'queued', queuePosition: 0 })];
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Watches' }));
    const dialog = await screen.findByRole('dialog', { name: 'Watches' });
    expect(within(screen.getByRole('listitem', { name: 'Watch Camera' })).getByText('Waiting')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Watch Old' })).getByText('Paused')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Watch Broken' })).getByText('Problem')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('listitem', { name: 'Watch Camera' })).getByRole('switch', { name: 'Watching Camera' }));
    await waitFor(() => expect(backend.sent('POST', /\/watches\/2\/enabled$/)[0].body).toEqual({ enabled: false }));

    fireEvent.click(within(screen.getByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Check now' }));
    expect(await within(screen.getByRole('listitem', { name: 'Watch Coach' })).findByText('Created 1 batch')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '2026-11-07_b, Queued' })).toBeInTheDocument());

    fireEvent.click(within(screen.getByRole('listitem', { name: 'Watch Old' })).getByRole('button', { name: 'Delete' }));
    expect(within(screen.getByRole('listitem', { name: 'Watch Old' })).getByText('Delete this watch? Its batches stay.')).toBeInTheDocument();
    expect(backend.sent('DELETE', /\/watches\/3$/)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Delete watch' }));
    await waitFor(() => expect(backend.sent('DELETE', /\/watches\/3$/)).toHaveLength(1));
    expect(dialog).toBeInTheDocument();
  });

  it('editing a watch keeps its id and sends the changed name, and Add watch from the panel goes back to the panel afterwards', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.preview = { matches: [], notMatching: 0, truncated: false };
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Watches' }));
    fireEvent.click(within(await screen.findByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit watch' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit watch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/c');
    fireEvent.change(screen.getByLabelText('Watch name'), { target: { value: 'Coach Sat' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save watch' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save watch' }));
    await waitFor(() => expect(backend.sent('PUT', /\/watches\/1$/)).toHaveLength(1));
    expect(backend.sent('PUT', /\/watches\/1$/)[0].body).toMatchObject({ name: 'Coach Sat', parentFolder: '/c', includeExisting: false, enabled: true });
    expect(await screen.findByRole('dialog', { name: 'Watches' })).toBeInTheDocument();
    expect(await screen.findByRole('listitem', { name: 'Watch Coach Sat' })).toBeInTheDocument();
  });

  it('a pattern the server refuses shows its message and keeps Start watching disabled', { tags: ['full'] }, async () => {
    const backend = folderServer();
    backend.state.previewError = 'The pattern could take far too long to match';
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/c' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    fireEvent.click(await screen.findByRole('switch', { name: 'Keep watching this folder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('far too long');
    expect(screen.getByRole('button', { name: 'Start watching' })).toBeDisabled();
    expect(backend.posted(/\/watches$/)).toHaveLength(0);
  });
});
