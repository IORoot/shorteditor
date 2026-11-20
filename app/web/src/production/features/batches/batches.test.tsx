import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchListItem } from '../../lib/types';
import { makeCard } from '../../test/fixtures';
import { BatchBoardPage } from './BatchBoardPage';
import { BatchList } from './BatchList';

const row = (over: Partial<BatchListItem>): BatchListItem => ({
  id: 1, name: 'Coach', inputFolder: '/in/coach', pipelineName: 'Join clips', runNumber: 2, runAt: null,
  folderCount: 2, approvedCount: 0, failedCount: 0, status: 'review', ...over,
});

describe('BatchList', () => {
  it('filters the batches and opens the one clicked', { tags: ['full'] }, () => {
    const onOpen = vi.fn();
    const items = [row({ id: 1, name: 'Coach' }), row({ id: 2, name: 'Camera', status: 'running' })];
    render(<BatchList items={items} filter="all" onFilter={() => undefined} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Camera, Running/ }));
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });

  it('hides batches that are not under the chosen tab', { tags: ['full'] }, () => {
    const items = [row({ id: 1, name: 'Coach' }), row({ id: 2, name: 'Camera', status: 'running' })];
    render(<BatchList items={items} filter="running" onFilter={() => undefined} onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: /Coach, Review/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Running 1' })).toHaveAttribute('aria-pressed', 'true');
  });
});

afterEach(() => {
  window.location.hash = '';
});

function apiWith(cards: ReturnType<typeof makeCard>[]) {
  return {
    cards: vi.fn().mockResolvedValue(cards),
    batchDetail: vi.fn().mockResolvedValue({ batch: { id: 1, name: 'Coach Saturdays', inputFolder: '/in', steps: [], runOn: 'any', outputRoot: '/out', createdAt: '' }, passes: [] }),
    runAgain: vi.fn().mockResolvedValue({ batch: {}, passes: [] }),
    updateBatch: vi.fn().mockResolvedValue({}),
    batchActions: vi.fn().mockResolvedValue({ results: [] }),
    cardActions: vi.fn().mockResolvedValue({ results: [] }),
  };
}

describe('BatchBoardPage', () => {
  it('shows only the cards of its own batch', { tags: ['full'] }, async () => {
    const api = apiWith([
      makeCard({ name: 'Coach Saturdays', status: 'review', batchId: 1, passId: 11, folder: '/in/a' }),
      makeCard({ name: 'Camera A', status: 'queued', batchId: 2, passId: 21 }),
    ]);
    render(<BatchBoardPage api={api as unknown as Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'batchActions' | 'cardActions'>} batchId={1} onBack={() => undefined} />);
    const review = await screen.findByRole('region', { name: 'Review' });
    expect(within(review).getByRole('button', { name: /Coach Saturdays/ })).toBeInTheDocument();
    expect(screen.queryByText('Camera A')).toBeNull();
  });

  it('runs the batch again from its own page', { tags: ['full'] }, async () => {
    const api = apiWith([makeCard({ name: 'Coach Saturdays', status: 'approved', batchId: 1, passId: 11 })]);
    render(<BatchBoardPage api={api as unknown as Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'batchActions' | 'cardActions'>} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run again' }));
    await waitFor(() => expect(api.runAgain).toHaveBeenCalledWith(1));
  });

  it('opens a card on the review page by its card id', { tags: ['full'] }, async () => {
    const api = apiWith([makeCard({ name: 'Coach Saturdays', status: 'review', batchId: 1, passId: 11 })]);
    render(<BatchBoardPage api={api as unknown as Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'batchActions' | 'cardActions'>} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Coach Saturdays/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/production/cards/11'));
  });
});

