import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { makeCollector } from './collection/test/fixtures';
import type { BatchCard } from './production/lib/types';
import { listRowsFor, makeCard } from './production/test/fixtures';

const output = { path: '/out/Coach-1/pass-1/output.mp4', duration: 58.4, sizeBytes: 46_000_000 };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

interface Request { url: string; method: string; body: unknown }

/** A fake server: the board it returns can change between requests, and every request is recorded. */
function server(initial: BatchCard[]) {
  const state = { cards: initial, down: false, holdCreate: false, createError: null as string | null, requests: [] as Request[] };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    state.requests.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url === '/api/collectors') return json([makeCollector()]);
    if (url.startsWith('/api/collectors/')) return json([]);
    if (state.down) return Promise.resolve(new Response('down', { status: 503 }));
    if (url === '/api/production/batches' && method === 'GET') return json(state.cards);
    if (url === '/api/production/batch-list' && method === 'GET') return json(listRowsFor(state.cards));
    const batch = /^\/api\/production\/batches\/(\d+)$/.exec(url);
    if (batch && method === 'GET') {
      const name = state.cards.find((card) => card.batchId === Number(batch[1]))?.name ?? 'Batch';
      return json({ batch: { id: Number(batch[1]), name, inputFolder: '/clips', steps: [], runOn: 'any', outputRoot: '/out', createdAt: '' }, passes: [] });
    }
    if (url === '/api/production/defaults') return json({ outputRoot: '/Volumes/Edit/production_output', workers: [{ id: 'local', label: 'This computer' }] });
    if (url === '/api/production/pipelines') return json([{ id: 1, name: 'Join clips', stageCount: 5 }]);
    if (url === '/api/production/batches/bulk' && method === 'POST' && state.holdCreate) return new Promise(() => undefined);
    if (url === '/api/production/batches/bulk' && method === 'POST') return state.createError ? json({ detail: state.createError }, 422) : json({ created: [{ id: 9 }], skipped: [] }, 201);
    if (/^\/api\/production\/passes\/\d+\/approve$/.test(url)) return json({ runId: 1, stage: 'production', folders: [] });
    if (/^\/api\/production\/passes\/\d+\/resolve$/.test(url)) return json({});
    return json({ detail: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  const posted = (pattern: RegExp) => state.requests.filter((r) => r.method === 'POST' && pattern.test(r.url));
  const boardLoads = () => state.requests.filter((r) => r.url === '/api/production/batch-list' && r.method === 'GET').length;
  return { state, posted, boardLoads };
}

async function openProduction() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Production' }));
  await screen.findByRole('heading', { name: 'Production', level: 1 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Production, end to end', () => {
  it('lists each batch with its status', { tags: ['full'] }, async () => {
    server([
      makeCard({ name: 'Coach Saturdays', status: 'review', output }),
      makeCard({ name: 'Jams', status: 'failed', error: 'No clips found' }),
      makeCard({ name: 'Tuesday', status: 'running', stageTitle: 'Render', stagePosition: 5 }),
      makeCard({ name: 'Camera A', status: 'queued', queuePosition: 0 }),
    ]);
    await openProduction();
    expect(await screen.findByText('4 batches · 1 queued · 1 running · 2 to review · 1 failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coach Saturdays, Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jams, Failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuesday, Running' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Camera A, Queued' })).toBeInTheDocument();
  });

  it('creates a batch with the exact request and reloads the board', async () => {
    const backend = server([]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    expect(await screen.findByRole('dialog', { name: 'New batch' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Output folder')).toHaveAttribute('placeholder', '/Volumes/Edit/production_output'));
    const before = backend.boardLoads();
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/clips/coach' } });
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach Saturdays' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore subfolders' }));
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull());
    expect(backend.posted(/\/batches\/bulk$/)[0].body).toEqual({
      parentFolder: '/clips/coach', pattern: '^\\d{4}-\\d{2}-\\d{2}_.+$', name: 'Coach Saturdays', nameTemplate: '{name}', pipelineId: 1, runOn: 'any', autoRun: false, ignoreSubfolders: true,
    });
    await waitFor(() => expect(backend.boardLoads()).toBeGreaterThan(before));
  });

  it('keeps the dialog open and says why when the server refuses the batch', async () => {
    const backend = server([]);
    backend.state.createError = 'The output folder and the input folder must not overlap';
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(await screen.findByLabelText('Parent folder'), { target: { value: '/x' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore subfolders' }));
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('must not overlap');
    expect(screen.getByRole('dialog', { name: 'New batch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull();
  });

  it('can still create a batch when the defaults could not be loaded, leaving the output folder to the server', { tags: ['full'] }, async () => {
    const backend = server([]);
    const original = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (url === '/api/production/defaults' ? Promise.resolve(new Response('x', { status: 500 })) : original(url, init)));
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(await screen.findByLabelText('Parent folder'), { target: { value: '/x' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore subfolders' }));
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    await waitFor(() => expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(1));
    expect('outputRoot' in (backend.posted(/\/batches\/bulk$/)[0].body as object)).toBe(false);
  });

  it('sends one request when Create is clicked twice while the server is still answering', { tags: ['full'] }, async () => {
    const backend = server([]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    fireEvent.change(await screen.findByLabelText('Parent folder'), { target: { value: '/x' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore subfolders' }));
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
    backend.state.holdCreate = true;
    const create = screen.getByRole('button', { name: 'Create 1 batch' });
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() => expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(1));
    expect(backend.posted(/\/batches\/bulk$/)).toHaveLength(1);
  });

  it('goes back from a review page to the board, and starts the New batch form empty each time', { tags: ['full'] }, async () => {
    server([makeCard({ name: 'Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 })]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Ready' }));
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Production' }));
    fireEvent.click(await screen.findByRole('button', { name: 'All batches' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    expect(screen.queryByRole('main', { name: 'Review' })).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Half typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New batch' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'New batch' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('approves a finished batch on its review page and moves it to the approved row', { tags: ['full'] }, async () => {
    const card = makeCard({ name: 'Coach Saturdays', folder: '/clips/Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 });
    const backend = server([card]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Ready' }));
    const approve = await screen.findByRole('button', { name: 'Approve' });
    backend.state.cards = [{ ...card, status: 'approved' }];
    fireEvent.click(approve);
    await waitFor(() => expect(backend.posted(/passes\/11\/approve$/)).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to Production' }));
    expect(within(await screen.findByRole('region', { name: 'Approved' })).getByText('Coach Saturdays')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Review' })).getByText('Nothing here')).toBeInTheDocument();
  });

  it('sends the chosen way out of a blocked batch', { tags: ['full'] }, async () => {
    const backend = server([makeCard({ name: 'Long', status: 'blocked', blockedReason: 'Over the limit', blockedChoices: ['drop_shortest', 'keep_first'], passId: 21 })]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Long, Review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Long, Blocked' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Drop the shortest parts' }));
    await waitFor(() => expect(backend.posted(/passes\/21\/resolve$/)[0].body).toEqual({ choice: 'drop_shortest' }));
  });

  it('shows the error with a Retry when the server is down, and recovers', { tags: ['full'] }, async () => {
    const backend = server([makeCard({ name: 'Back again', status: 'queued' })]);
    backend.state.down = true;
    await openProduction();
    expect(await screen.findByRole('alert')).toHaveTextContent('failed with 503');
    backend.state.down = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
  });

  it('follows a running batch to the next stage on its review page', { tags: ['full'] }, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = makeCard({ name: 'Tuesday', status: 'running', stageTitle: 'Scan folder', stagePosition: 1, batchId: 3, passId: 31 });
    const backend = server([running]);
    await openProduction();
    fireEvent.click(await screen.findByRole('button', { name: 'Tuesday, Running' }));
    expect(await screen.findByRole('heading', { name: 'Tuesday' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Tuesday, Running' }));
    expect(await screen.findByText('Scan folder · stage 1 of 5')).toBeInTheDocument();
    backend.state.cards = [{ ...running, stageTitle: 'Join in order', stagePosition: 4 }];
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(await screen.findByText('Join in order · stage 4 of 5')).toBeInTheDocument();
  });
});
