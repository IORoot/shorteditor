import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard } from '../../lib/types';
import { listRowsFor, makeCard } from '../../test/fixtures';
import { BoardPage } from './BoardPage';

const output = { path: '/out/a/pass-1/output.mp4', duration: 58, sizeBytes: 5_000_000 };

function setup(cards: BatchCard[]) {
  const api = {
    cards: vi.fn().mockResolvedValue(cards),
    batchList: vi.fn().mockResolvedValue(listRowsFor(cards)),
    approve: vi.fn().mockResolvedValue({}),
    runAgain: vi.fn().mockResolvedValue({}),
    resolve: vi.fn().mockResolvedValue({}),
    defaults: vi.fn().mockResolvedValue({ outputRoot: '/out', workers: [] }),
    pipelines: vi.fn().mockResolvedValue([]),
    outputUrl: (id: number) => `/api/production/passes/${id}/output`,
    batchDetail: vi.fn().mockResolvedValue({ batch: {}, passes: [] }),
    passLog: vi.fn().mockResolvedValue({ lines: [], entries: [] }),
    deleteBatches: vi.fn().mockResolvedValue({ deleted: 2 }),
  };
  render(<BoardPage api={api as unknown as ProductionApi} />);
  return api;
}

afterEach(() => {
  window.location.hash = '';
});

describe('BoardPage choosing batches to delete', () => {
  const cards = () => [
    makeCard({ name: 'A', status: 'review', output, batchId: 1, passId: 11 }),
    makeCard({ name: 'B', status: 'failed', error: 'Boom', batchId: 2, passId: 12 }),
    makeCard({ name: 'C', status: 'running', stageTitle: 'Scan folder', stagePosition: 1, batchId: 3, passId: 13 }),
  ];

  it('chooses cards on click instead of opening them, and leaves running ones alone', { tags: ['full'] }, async () => {
    setup(cards());
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'A, Review' }));
    expect(screen.getByRole('button', { name: 'A, Review' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('toolbar', { name: 'Chosen batches' })).toHaveTextContent('1 chosen');
    expect(screen.getByRole('button', { name: 'C, Running' })).toBeDisabled();
    expect(window.location.hash).toBe('');
  });

  it('deletes the chosen batches after a confirmation and leaves choosing mode', { tags: ['full'] }, async () => {
    const api = setup(cards());
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'A, Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'B, Failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete batches' });
    expect(dialog).toHaveTextContent('Delete 2 batches?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 batches' }));
    await waitFor(() => expect(api.deleteBatches).toHaveBeenCalledWith([1, 2]));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete batches' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  it('keeps the dialog open and shows the reason when the server refuses', { tags: ['full'] }, async () => {
    const api = setup(cards());
    api.deleteBatches.mockRejectedValue(new Error('A batch that is waiting or running cannot be deleted.'));
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'A, Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete batches' })).getByRole('button', { name: 'Delete batch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be deleted');
    expect(screen.getByRole('dialog', { name: 'Delete batches' })).toBeInTheDocument();
  });

  it('clears the choice when Clear is pressed', { tags: ['full'] }, async () => {
    setup(cards());
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'A, Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'A, Review' })).toHaveAttribute('aria-pressed', 'false');
  });
});
