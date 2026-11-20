import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard } from '../../lib/types';
import { makeCard } from '../../test/fixtures';
import { ReviewRoute } from './ReviewRoute';

const output = { path: '/out/a/pass-1/output.mp4', duration: 58, sizeBytes: 5_000_000 };

function setup(cardId: number, first: BatchCard[], ...rest: BatchCard[][]) {
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
  render(<ReviewRoute api={api as unknown as ProductionApi} cardId={cardId} onBack={onBack} />);
  return { api, onBack };
}

afterEach(() => {
  vi.useRealTimers();
});

const page = () => screen.getByRole('main', { name: 'Review' });

describe('ReviewRoute', () => {
  it('shows the card with its path above it, and each level above the card goes back to it', async () => {
    // the card's name is its batch's name; the page's title is the folder, not the batch
    const { onBack } = setup(11, [makeCard({ name: 'Batch name', folder: '/clips/Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 })]);
    expect(await screen.findByRole('heading', { name: 'Coach Saturdays' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toContain('Production');
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(onBack).toHaveBeenLastCalledWith(null);
  });

  it('shows the render timeline of this card, built from its stages', async () => {
    const stages = [
      { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 300, clips: [{ name: 'class_01.mp4', start: 0, end: 300, length: 300 }] } },
      { key: 'detect_action', title: 'Detect action', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 60, clips: [{ name: 'class_01.mp4', start: 30, end: 90, length: 60 }] } },
    ];
    const card = makeCard({ name: 'Coach Saturdays', folder: '/clips/Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 });
    const api = {
      cards: vi.fn().mockResolvedValue([card]),
      approve: vi.fn(), runAgain: vi.fn(), resolve: vi.fn(),
      pipelines: vi.fn().mockResolvedValue([]),
      outputUrl: (id: number) => `/api/production/passes/${id}/output`,
      batchDetail: vi.fn().mockResolvedValue({ batch: { name: 'Coach Saturdays batch' }, passes: [{ id: 11, stages }] }),
      passLog: vi.fn().mockResolvedValue({ lines: [], entries: [] }),
    };
    render(<ReviewRoute api={api as unknown as ProductionApi} cardId={11} onBack={vi.fn()} />);
    const region = await screen.findByRole('region', { name: 'Render timeline' });
    expect(within(region).getByText('class_01.mp4')).toBeInTheDocument();
    expect(within(region).getAllByRole('img', { name: /^Action clip/ })).toHaveLength(1);
  });

  it('puts the batch between Production and the card in the path, and goes back to the batch', async () => {
    const { onBack } = setup(11, [makeCard({ name: 'Coach Saturdays', folder: '/clips/Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 })]);
    await screen.findByRole('heading', { name: 'Coach Saturdays' });
    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    expect(onBack).toHaveBeenLastCalledWith(1);
  });

  it('approves the newest pass, reloads the batch and shows the new state', async () => {
    const review = makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 });
    const { api } = setup(11, [review], [{ ...review, status: 'approved' }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(within(page()).getByText('Approved')).toBeInTheDocument());
    expect(api.approve).toHaveBeenCalledWith(11);
    expect(api.cards).toHaveBeenCalledTimes(2);
  });

  it('sends only one request when Approve is clicked twice', { tags: ['full'] }, async () => {
    const { api } = setup(11, [makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 })]);
    api.approve.mockImplementation(() => new Promise(() => undefined));
    const approve = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(api.approve).toHaveBeenCalledTimes(1);
  });

  it('shows the server message on the page and keeps the page open', { tags: ['full'] }, async () => {
    const { api } = setup(11, [makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 })]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A newer pass exists for this batch.');
    expect(page()).toBeInTheDocument();
  });

  it('sends the chosen way out of a blocked batch', async () => {
    const { api } = setup(21, [makeCard({ name: 'B', status: 'blocked', blockedReason: 'Over', blockedChoices: ['keep_first'], batchId: 1, passId: 21 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep the first parts and trim the last' }));
    await act(async () => undefined);
    expect(api.resolve).toHaveBeenCalledWith(21, 'keep_first');
  });

  it('runs a batch again as a new pass', { tags: ['full'] }, async () => {
    const { api } = setup(31, [makeCard({ name: 'C', status: 'failed', error: 'Boom', batchId: 7, passId: 31 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Run again' }));
    await act(async () => undefined);
    expect(api.runAgain.mock.calls[0][0]).toBe(7);  // the pipeline id is sent too, as the batch's own
  });

  it('follows the batch when a refresh brings a new state', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    const running = makeCard({ name: 'D', status: 'running', stageTitle: 'Render', stagePosition: 5, batchId: 4, passId: 41 });
    setup(41, [running], [{ ...running, status: 'review', output }]);
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
    const { api } = setup(71, [review], [{ ...review, passId: 72, status: 'running', stageTitle: 'Scan folder', stagePosition: 1, output: null }]);
    api.approve.mockRejectedValue(new Error('A newer pass exists for this batch.'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('A newer pass exists');
    await act(async () => { await vi.advanceTimersByTimeAsync(10100); });
    expect(screen.queryByText(/A newer pass exists/)).toBeNull();
  });

  it('opens a clip from the library in the sidebar, and goes back to the output', async () => {
    const stages = [
      { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 6, clips: [{ name: 'class_01.mp4', start: 0, end: 6, length: 6 }] } },
      { key: 'detect_action', title: 'Detect action', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 2, clips: [{ name: 'class_01.mp4', start: 1, end: 3, length: 2 }] } },
    ];
    const card = makeCard({ name: 'Coach Saturdays', folder: '/clips/Coach Saturdays', status: 'review', output, batchId: 1, passId: 11 });
    const api = {
      cards: vi.fn().mockResolvedValue([card]),
      approve: vi.fn(), runAgain: vi.fn(), resolve: vi.fn(), cardActions: vi.fn(),
      pipelines: vi.fn().mockResolvedValue([]),
      outputUrl: (id: number) => `/api/production/passes/${id}/output`,
      clipUrl: (id: number, clip: string) => `/api/production/passes/${id}/clip?clip=${clip}`,
      saveTrims: vi.fn(), resetTrims: vi.fn(),
      batchDetail: vi.fn().mockResolvedValue({ batch: { name: 'Coach Saturdays batch' }, passes: [{ id: 11, stages, overrides: {} }] }),
      passLog: vi.fn().mockResolvedValue({ lines: [], entries: [] }),
    };
    render(<ReviewRoute api={api as unknown as ProductionApi} cardId={11} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /class_01\.mp4/ }));
    expect(await screen.findByRole('region', { name: 'Clip editor' })).toHaveTextContent('class_01.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Back to output' }));
    expect(screen.queryByRole('region', { name: 'Clip editor' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Output' })).toBeInTheDocument();
  });
});
