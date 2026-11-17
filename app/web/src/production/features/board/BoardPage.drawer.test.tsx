import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard } from '../../lib/types';
import { makeCard } from '../../test/fixtures';
import { BoardPage } from './BoardPage';

const output = { path: '/out/a/pass-1/output.mp4', duration: 58, sizeBytes: 5_000_000 };

let defaultsOverride: (() => Promise<unknown>) | null = null;

function setup(first: BatchCard[], ...rest: BatchCard[][]) {
  const cards = vi.fn().mockResolvedValueOnce(first);
  rest.forEach((list) => cards.mockResolvedValueOnce(list));
  cards.mockResolvedValue(rest.length ? rest[rest.length - 1] : first);
  const api = {
    cards,
    approve: vi.fn().mockResolvedValue({}),
    runAgain: vi.fn().mockResolvedValue({}),
    resolve: vi.fn().mockResolvedValue({}),
    defaults: vi.fn(() => (defaultsOverride ? defaultsOverride() : Promise.resolve({ outputRoot: '/out', workers: [] }))),
    createBatch: vi.fn().mockResolvedValue({}),
    pipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Join clips', stageCount: 5 }]),
    outputUrl: (id: number) => `/api/production/passes/${id}/output`,
  };
  render(<BoardPage api={api as unknown as ProductionApi} />);
  return api;
}

afterEach(() => {
  vi.useRealTimers();
  defaultsOverride = null;
});

describe('BoardPage review drawer', () => {
  it('opens the drawer for the clicked batch and marks its card', async () => {
    setup([makeCard({ name: 'Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Ready' }));
    expect(screen.getByRole('dialog', { name: 'Review' })).toHaveTextContent('Coach Saturdays');
    expect(screen.getByRole('button', { name: 'Coach Saturdays, Ready' })).toHaveAttribute('aria-current', 'true');
  });

  it('approves the newest pass, reloads the board and shows the new state', async () => {
    const review = makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 });
    const api = setup([review], [{ ...review, status: 'approved' }]);
    fireEvent.click(await screen.findByRole('button', { name: 'A, Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Approved')).toBeInTheDocument());
    expect(api.approve).toHaveBeenCalledWith(11);
    expect(api.cards).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sends only one request when Approve is clicked twice', { tags: ['full'] }, async () => {
    const review = makeCard({ name: 'A', status: 'review', output, passId: 11 });
    const api = setup([review]);
    api.approve.mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(await screen.findByRole('button', { name: 'A, Ready' }));
    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(api.approve).toHaveBeenCalledTimes(1);
  });

  it('shows the server message in the drawer and keeps it open', { tags: ['full'] }, async () => {
    const api = setup([makeCard({ name: 'A', status: 'review', output, passId: 11 })]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    fireEvent.click(await screen.findByRole('button', { name: 'A, Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A newer pass exists for this batch.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sends the chosen way out of a blocked batch', async () => {
    const api = setup([makeCard({ name: 'B', status: 'blocked', blockedReason: 'Over', blockedChoices: ['keep_first'], passId: 21 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'B, Blocked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep the first parts and trim the last' }));
    await act(async () => undefined);
    expect(api.resolve).toHaveBeenCalledWith(21, 'keep_first');
  });

  it('runs a batch again as a new pass', { tags: ['full'] }, async () => {
    const api = setup([makeCard({ name: 'C', status: 'failed', error: 'Boom', batchId: 7, passId: 31 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'C, Failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    await act(async () => undefined);
    expect(api.runAgain).toHaveBeenCalledWith(7);
  });

  it('stays open and follows the batch when a refresh brings a new state', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const running = makeCard({ name: 'D', status: 'running', stageTitle: 'Render', stagePosition: 5, batchId: 4, passId: 41 });
    setup([running], [{ ...running, status: 'review', output }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'D, Running' }));
    expect(screen.getByText('Render · stage 5 of 5')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('closes with Escape and puts focus back on the card', { tags: ['full'] }, async () => {
    setup([makeCard({ name: 'E', status: 'review', output, batchId: 5 })]);
    const card = await screen.findByRole('button', { name: 'E, Ready' });
    fireEvent.click(card);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'E, Ready' }));
  });

  it('still puts focus on the card after a refresh moved it to another column', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const running = makeCard({ name: 'F', status: 'running', stageTitle: 'Render', stagePosition: 5, batchId: 6 });
    setup([running], [{ ...running, status: 'review', output }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'F, Running' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'F, Ready' }));
  });

  it('puts focus on the second card, not the first, after switching between two', { tags: ['full'] }, async () => {
    setup([makeCard({ name: 'A', status: 'review', output, batchId: 1 }), makeCard({ name: 'B', status: 'review', output, batchId: 2 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'A, Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'B, Ready' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'B, Ready' }));
  });

  it('closes by itself if the batch is gone', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    setup([makeCard({ name: 'E', status: 'review', output, batchId: 5 })], []);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'E, Ready' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10100); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('drops an old action error when a refresh brings a different pass', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const review = makeCard({ name: 'G', status: 'review', output, batchId: 7, passId: 71 });
    const api = setup([review], [{ ...review, passId: 72, status: 'running', stageTitle: 'Scan folder', stagePosition: 1, output: null }]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'G, Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('A newer pass exists');
    await act(async () => { await vi.advanceTimersByTimeAsync(10100); });
    expect(screen.queryByText(/A newer pass exists/)).toBeNull();
  });

  it('leaves a half-filled New batch form alone when a refresh arrives', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    setup([makeCard({ name: 'H', status: 'running', stageTitle: 'Scan folder', stagePosition: 1, batchId: 8 })]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'New batch' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Half typed' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByLabelText('Name')).toHaveValue('Half typed');
  });

  it('asks the server for the defaults again if the first try failed', { tags: ['full'] }, async () => {
    let calls = 0;
    defaultsOverride = () => (++calls === 1 ? Promise.reject(new Error('restarting')) : Promise.resolve({ outputRoot: '/out', workers: [{ id: 'local', label: 'This computer' }] }));
    const api = setup([makeCard({ name: 'I', status: 'queued' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    await act(async () => undefined);
    expect(api.defaults).toHaveBeenCalledTimes(2);
  });
});
