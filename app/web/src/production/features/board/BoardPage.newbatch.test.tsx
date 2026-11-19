import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard } from '../../lib/types';
import { listRowsFor, makeCard } from '../../test/fixtures';
import { BoardPage } from './BoardPage';

let defaultsOverride: (() => Promise<unknown>) | null = null;
let openBatch: ((batchId: number) => void) | undefined;

function setup(first: BatchCard[], ...rest: BatchCard[][]) {
  const cards = vi.fn().mockResolvedValueOnce(first);
  rest.forEach((list) => cards.mockResolvedValueOnce(list));
  cards.mockResolvedValue(rest.length ? rest[rest.length - 1] : first);
  const batchList = vi.fn(() => cards().then(listRowsFor));
  const api = {
    batchList,
    approve: vi.fn().mockResolvedValue({}),
    runAgain: vi.fn().mockResolvedValue({}),
    resolve: vi.fn().mockResolvedValue({}),
    defaults: vi.fn(() => (defaultsOverride ? defaultsOverride() : Promise.resolve({ outputRoot: '/out', workers: [] }))),
    createBatch: vi.fn().mockResolvedValue({}),
    pipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Join clips', stageCount: 5 }]),
    outputUrl: (id: number) => `/api/production/passes/${id}/output`,
    batchDetail: vi.fn().mockResolvedValue({ batch: {}, passes: [] }),
    passLog: vi.fn().mockResolvedValue({ lines: [], entries: [] }),
  };
  render(<BoardPage api={api as unknown as ProductionApi} onOpenBatch={openBatch} />);
  return api;
}

afterEach(() => {
  vi.useRealTimers();
  defaultsOverride = null;
  openBatch = undefined;
  window.location.hash = '';
});

describe('BoardPage', () => {
  it('opens the batch board of the clicked batch', async () => {
    openBatch = vi.fn();
    setup([makeCard({ name: 'Coach Saturdays', status: 'review', batchId: 1, passId: 11 })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Coach Saturdays, Review' }));
    expect(openBatch).toHaveBeenCalledWith(1);
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
