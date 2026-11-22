import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchListItem } from '../../lib/types';
import { makeCard } from '../../test/fixtures';
import { BatchBoardPage } from './BatchBoardPage';
import { BatchList } from './BatchList';

afterEach(() => {
  window.location.hash = '';
});

const batch = { id: 1, name: 'Coach Saturdays', inputFolder: '/in', pipelineId: 1, steps: [], runOn: 'any', outputRoot: '/out', folderTemplate: '{{name}}-{{id}}', createdAt: '', autoRun: false };

function apiWith() {
  return {
    cards: vi.fn().mockResolvedValue([makeCard({ name: 'Coach Saturdays', status: 'approved', batchId: 1, passId: 11 })]),
    batchDetail: vi.fn().mockResolvedValue({ batch, passes: [] }),
    runAgain: vi.fn(),
    updateBatch: vi.fn().mockResolvedValue(batch),
    defaults: vi.fn().mockResolvedValue({ outputRoot: '/out', workers: [{ id: 'local', label: 'This computer' }] }),
    pipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Join clips', stageCount: 5 }, { id: 2, name: 'Highlights', stageCount: 4 }]),
    batchActions: vi.fn().mockResolvedValue({ results: [] }),
    cardActions: vi.fn().mockResolvedValue({ results: [] }),
  };
}
type Api = Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch' | 'defaults' | 'pipelines' | 'batchActions' | 'cardActions'>;

describe('editing a batch from its board', () => {
  it('Edit opens the whole batch in a dialog, not a panel above the cards, and saves what changed', async () => {
    const api = apiWith();
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit batch' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit batch' })).toBeNull();
    await waitFor(() => expect((screen.getByLabelText('Pipeline') as HTMLSelectElement).options.length).toBe(3));
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach Tuesdays' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateBatch).toHaveBeenCalledWith(1, { name: 'Coach Tuesdays', pipelineId: 2 }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit batch' })).toBeNull());
  });

  it('has no Auto run switch in its header: Auto run is set in the dialog', async () => {
    const api = apiWith();
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit batch' });
    expect(screen.getAllByRole('switch', { name: 'Auto run' })).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Auto run' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateBatch).toHaveBeenCalledWith(1, { autoRun: true }));
  });

  it('keeps the dialog open with the server message when the save is refused', async () => {
    const api = apiWith();
    api.updateBatch.mockRejectedValue(new Error('This batch is waiting or running.'));
    render(<BatchBoardPage api={api as unknown as Api} batchId={1} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText('Batch name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('waiting or running');
    expect(screen.getByRole('dialog', { name: 'Edit batch' })).toBeInTheDocument();
  });
});

describe('editing a batch from the list', () => {
  const item: BatchListItem = { id: 1, name: 'Coach', inputFolder: '/in/coach', pipelineName: 'Join clips', runNumber: 2, runAt: null, folderCount: 2, approvedCount: 0, failedCount: 0, status: 'review' };

  it('each row has an Edit button that edits that batch', () => {
    const onEdit = vi.fn();
    render(<BatchList items={[item]} filter="all" onFilter={() => undefined} onOpen={() => undefined} onAct={() => undefined} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Coach' }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it('has no Edit button when the list cannot edit', () => {
    render(<BatchList items={[item]} filter="all" onFilter={() => undefined} onOpen={() => undefined} onAct={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Edit Coach' })).toBeNull();
  });
});
