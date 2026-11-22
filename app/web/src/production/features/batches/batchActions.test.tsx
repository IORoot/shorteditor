import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import { makeCard } from '../../test/fixtures';
import { BatchBoardPage } from './BatchBoardPage';
import { BatchList } from './BatchList';

function apiWith(cards: ReturnType<typeof makeCard>[]) {
  return {
    cards: vi.fn().mockResolvedValue(cards),
    batchDetail: vi.fn().mockResolvedValue({ batch: { id: 1, name: 'Coach', inputFolder: '/in', steps: [], runOn: 'any', outputRoot: '/out', createdAt: '' }, passes: [] }),
    runAgain: vi.fn().mockResolvedValue({ batch: {}, passes: [] }),
    updateBatch: vi.fn().mockResolvedValue({}),
    defaults: vi.fn().mockResolvedValue({ outputRoot: '/out', workers: [] }),
    pipelines: vi.fn().mockResolvedValue([]),
    batchActions: vi.fn().mockResolvedValue({ results: [{ id: 1, ok: true, message: 'Paused 2 cards' }] }),
    cardActions: vi.fn().mockResolvedValue({ results: [{ id: 11, ok: true, message: 'Paused' }, { id: 12, ok: false, message: 'A approved card cannot be paused' }] }),
  };
}

type Api = Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'defaults' | 'pipelines' | 'batchActions' | 'cardActions'>;

describe('BatchBoardPage actions', () => {
  it('chooses cards on the board and pauses them together', { tags: ['full'] }, async () => {
    const api = apiWith([
      makeCard({ name: 'Coach', status: 'queued', batchId: 1, passId: 11, folder: '/in/class-1' }),
      makeCard({ name: 'Coach', status: 'approved', batchId: 1, passId: 12, folder: '/in/class-2' }),
    ]);
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select cards' }));
    fireEvent.click(screen.getByRole('button', { name: /Coach, Queued/ }));
    fireEvent.click(screen.getByRole('button', { name: /Coach, Approved/ }));
    expect(screen.getByRole('toolbar', { name: 'Chosen cards' })).toHaveTextContent('2 chosen');
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Chosen cards' })).getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(api.cardActions).toHaveBeenCalledWith([11, 12], 'pause'));
    expect(await screen.findByRole('status')).toHaveTextContent('1 done, 1 not done');
    expect(screen.getByText('A approved card cannot be paused')).toBeInTheDocument();
  });

  it('asks before deleting chosen cards', { tags: ['full'] }, async () => {
    const api = apiWith([makeCard({ name: 'Coach', status: 'review', batchId: 1, passId: 11, folder: '/in/class-1' })]);
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select cards' }));
    fireEvent.click(screen.getByRole('button', { name: /Coach, Ready/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    expect(api.cardActions).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Delete 1 card?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));
    await waitFor(() => expect(api.cardActions).toHaveBeenCalledWith([11], 'delete'));
  });

  it('pauses the whole batch from its own header', { tags: ['full'] }, async () => {
    const api = apiWith([makeCard({ name: 'Coach', status: 'queued', batchId: 1, passId: 11 })]);
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(api.batchActions).toHaveBeenCalledWith([1], 'pause'));
  });

  it('deletes the batch only after the confirmation, then goes back', { tags: ['full'] }, async () => {
    const onBack = vi.fn();
    const api = apiWith([makeCard({ name: 'Coach', status: 'review', batchId: 1, passId: 11 })]);
    api.batchActions.mockResolvedValue({ results: [{ id: 1, ok: true, message: 'Deleted' }] });
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={onBack} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(api.batchActions).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete batch' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(api.batchActions).toHaveBeenCalledWith([1], 'delete');
  });
});

describe('BatchList row icons', () => {
  const item = (over: Partial<import('../../lib/types').BatchListItem>): import('../../lib/types').BatchListItem => ({
    id: 3, name: 'Coach', inputFolder: '/in/coach', pipelineName: 'Join clips', runNumber: 1, runAt: null,
    folderCount: 2, approvedCount: 0, failedCount: 0, status: 'queued', ...over,
  });

  it('shows pause, stop and delete for a waiting batch, and resume with run again once it has stopped', { tags: ['full'] }, () => {
    const { rerender } = render(<BatchList items={[item({ status: 'queued' })]} filter="all" onFilter={() => undefined} onOpen={() => undefined} onAct={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Pause Coach' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop Coach' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Coach' })).toBeEnabled();
    rerender(<BatchList items={[item({ status: 'stopped' })]} filter="all" onFilter={() => undefined} onOpen={() => undefined} onAct={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Resume Coach' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Run again Coach' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Stop Coach' })).toBeNull();
  });

  it('acts on that one batch without opening it, and cannot delete a running one', { tags: ['full'] }, () => {
    const onAct = vi.fn();
    const onOpen = vi.fn();
    const running = item({ status: 'running' });
    render(<BatchList items={[running]} filter="all" onFilter={() => undefined} onOpen={onOpen} onAct={onAct} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause Coach' }));
    expect(onAct).toHaveBeenCalledWith(running, 'pause');
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Coach' })).toBeDisabled();
  });

  it('shows no icons when the list is not given actions', { tags: ['full'] }, () => {
    render(<BatchList items={[item({})]} filter="all" onFilter={() => undefined} onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Delete Coach' })).toBeNull();
  });
});

describe('BatchBoardPage auto run', () => {
  it('turns auto run on for the batch from its header', { tags: ['full'] }, async () => {
    const api = apiWith([makeCard({ name: 'Coach', status: 'held', batchId: 1, passId: 11 })]);
    api.batchDetail.mockResolvedValue({ batch: { id: 1, name: 'Coach', inputFolder: '/in', steps: [], runOn: 'any', outputRoot: '/out', createdAt: '', autoRun: false }, passes: [] });
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Auto run' }));
    await waitFor(() => expect(api.updateBatch).toHaveBeenCalledWith(1, { autoRun: true }));
  });
});
