import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard } from '../../lib/types';
import { makeCard } from '../../test/fixtures';
import { ReviewRoute } from './ReviewRoute';

const output = { path: '/out/a/pass-1/output.mp4', duration: 58, sizeBytes: 5_000_000 };

function setup(batchId: number, first: BatchCard[], ...rest: BatchCard[][]) {
  const cards = vi.fn().mockResolvedValueOnce(first);
  rest.forEach((list) => cards.mockResolvedValueOnce(list));
  cards.mockResolvedValue(rest.length ? rest[rest.length - 1] : first);
  const api = {
    cards,
    approve: vi.fn().mockResolvedValue({}),
    runAgain: vi.fn().mockResolvedValue({}),
    resolve: vi.fn().mockResolvedValue({}),
    pipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Join clips', stageCount: 5 }]),
    outputUrl: (id: number) => `/api/production/passes/${id}/output`,
    batchDetail: vi.fn().mockResolvedValue({ batch: {}, passes: [] }),
    passLog: vi.fn().mockResolvedValue({ lines: [], entries: [] }),
  };
  const onBack = vi.fn();
  render(<ReviewRoute api={api as unknown as ProductionApi} batchId={batchId} onBack={onBack} />);
  return { api, onBack };
}

afterEach(() => {
  vi.useRealTimers();
});

const page = () => screen.getByRole('main', { name: 'Review' });

describe('ReviewRoute', () => {
  it('shows the batch its address names, with a way back to the board', async () => {
    const { onBack } = setup(1, [makeCard({ name: 'Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 })]);
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Production' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('approves the newest pass, reloads the batch and shows the new state', async () => {
    const review = makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 });
    const { api } = setup(1, [review], [{ ...review, status: 'approved' }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(within(page()).getByText('Approved')).toBeInTheDocument());
    expect(api.approve).toHaveBeenCalledWith(11);
    expect(api.cards).toHaveBeenCalledTimes(2);
  });

  it('sends only one request when Approve is clicked twice', { tags: ['full'] }, async () => {
    const { api } = setup(1, [makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 })]);
    api.approve.mockImplementation(() => new Promise(() => undefined));
    const approve = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(api.approve).toHaveBeenCalledTimes(1);
  });

  it('shows the server message on the page and keeps the page open', { tags: ['full'] }, async () => {
    const { api } = setup(1, [makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 })]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A newer pass exists for this batch.');
    expect(page()).toBeInTheDocument();
  });

  it('sends the chosen way out of a blocked batch', async () => {
    const { api } = setup(1, [makeCard({ name: 'B', status: 'blocked', blockedReason: 'Over', blockedChoices: ['keep_first'], batchId: 1, passId: 21 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep the first parts and trim the last' }));
    await act(async () => undefined);
    expect(api.resolve).toHaveBeenCalledWith(21, 'keep_first');
  });

  it('runs a batch again as a new pass', { tags: ['full'] }, async () => {
    const { api } = setup(7, [makeCard({ name: 'C', status: 'failed', error: 'Boom', batchId: 7, passId: 31 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Run again' }));
    await act(async () => undefined);
    expect(api.runAgain.mock.calls[0][0]).toBe(7);  // the pipeline id is sent too, as the batch's own
  });

  it('follows the batch when a refresh brings a new state', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const running = makeCard({ name: 'D', status: 'running', stageTitle: 'Render', stagePosition: 5, batchId: 4, passId: 41 });
    setup(4, [running], [{ ...running, status: 'review', output }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Render · stage 5 of 5')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('says so when the batch is no longer on the board', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    setup(99, [makeCard({ name: 'E', status: 'review', output, batchId: 5 })]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('This batch is no longer on the board.')).toBeInTheDocument();
  });

  it('drops an old action error when a refresh brings a different pass', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const review = makeCard({ name: 'G', status: 'review', output, batchId: 7, passId: 71 });
    const { api } = setup(7, [review], [{ ...review, passId: 72, status: 'running', stageTitle: 'Scan folder', stagePosition: 1, output: null }]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('A newer pass exists');
    await act(async () => { await vi.advanceTimersByTimeAsync(10100); });
    expect(screen.queryByText(/A newer pass exists/)).toBeNull();
  });
});
