import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionApi } from '../../lib/api';
import type { WatchView } from '../../lib/types';
import { WatchesPanel } from './WatchesPanel';

const watch = (over: Partial<WatchView> = {}): WatchView => ({
  id: 1, name: 'Coach', parentFolder: '/Volumes/Edit/Coach', pattern: '^\\d{4}-\\d{2}-\\d{2}_.+$', nameTemplate: '{name}', steps: [], runOn: 'any', outputRoot: null,
  intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, enabled: true, createdAt: '2026-11-17T10:00:00', lastCheckedAt: '2026-11-17T10:42:00', lastError: null,
  waiting: [], createdTotal: 2, status: 'watching', statusLine: 'Last checked 10:42 · created 2 batches in total · next check in 3 minutes', ...over,
});

function fakeApi(watches: WatchView[] = [watch()]) {
  return {
    watches: vi.fn().mockResolvedValue(watches),
    setWatchEnabled: vi.fn().mockImplementation((id: number, enabled: boolean) => Promise.resolve({ ...watches.find((w) => w.id === id), enabled })),
    checkWatch: vi.fn().mockResolvedValue({ created: [{ id: 9 }, { id: 10 }], waiting: [], error: null }),
    deleteWatch: vi.fn().mockResolvedValue(undefined),
  };
}

type PanelApi = Pick<ProductionApi, 'watches' | 'setWatchEnabled' | 'checkWatch' | 'deleteWatch'>;

function show(api = fakeApi(), handlers: Partial<React.ComponentProps<typeof WatchesPanel>> = {}) {
  const props = { onAdd: vi.fn(), onEdit: vi.fn(), onChanged: vi.fn(), onClose: vi.fn(), ...handlers };
  render(<WatchesPanel api={api as unknown as PanelApi} {...props} />);
  return { api, ...props };
}

const row = (name: string) => screen.getByRole('listitem', { name: `Watch ${name}` });

describe('WatchesPanel', () => {
  it('lists each watch with its status, folder, pattern and status line', async () => {
    show();
    const item = await screen.findByRole('listitem', { name: 'Watch Coach' });
    expect(within(item).getByText('Watching')).toBeInTheDocument();
    expect(within(item).getByText('/Volumes/Edit/Coach')).toBeInTheDocument();
    expect(within(item).getByText('^\\d{4}-\\d{2}-\\d{2}_.+$')).toBeInTheDocument();
    expect(within(item).getByText(/created 2 batches in total/)).toBeInTheDocument();
  });

  it('shows each status with its own label', async () => {
    show(fakeApi([
      watch({ id: 1, name: 'W1', status: 'waiting', statusLine: 'line waiting' }),
      watch({ id: 2, name: 'W2', status: 'paused', statusLine: 'line paused' }),
      watch({ id: 3, name: 'W3', status: 'problem', statusLine: 'line problem' }),
    ]));
    expect(await screen.findByRole('listitem', { name: 'Watch W1' })).toHaveTextContent('Waiting');
    expect(row('W2')).toHaveTextContent('Paused');
    expect(row('W3')).toHaveTextContent('Problem');
  });

  it('says so when there are no watches, and "Add watch" opens the form', async () => {
    const { onAdd } = show(fakeApi([]));
    expect(await screen.findByText('No watches yet. Add one to batch new folders automatically.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add watch' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('pauses a watch, then refreshes the list', async () => {
    const { api } = show();
    fireEvent.click(await screen.findByRole('switch', { name: 'Watching Coach' }));
    await waitFor(() => expect(api.watches).toHaveBeenCalledTimes(2));
    expect(api.setWatchEnabled).toHaveBeenCalledWith(1, false);
  });

  it('checks a watch now, shows what it did, and tells the board when batches were made', async () => {
    const { api, onChanged } = show();
    fireEvent.click(within(await screen.findByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Check now' }));
    expect(within(row('Coach')).getByText('Checking…')).toBeInTheDocument();
    expect(await within(row('Coach')).findByText('Created 2 batches')).toBeInTheDocument();
    expect(api.checkWatch).toHaveBeenCalledWith(1);
    expect(onChanged).toHaveBeenCalled();
  });

  it('a check that finds nothing says so and does not reload the board', async () => {
    const api = fakeApi();
    api.checkWatch.mockResolvedValue({ created: [], waiting: [], error: null });
    const { onChanged } = show(api);
    fireEvent.click(within(await screen.findByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Check now' }));
    expect(await within(row('Coach')).findByText('Nothing new')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('edits a watch with its current settings', async () => {
    const { onEdit } = show();
    fireEvent.click(within(await screen.findByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Coach' }));
  });

  it('asks before deleting, and deletes only when confirmed', async () => {
    const { api } = show();
    fireEvent.click(within(await screen.findByRole('listitem', { name: 'Watch Coach' })).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this watch? Its batches stay.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(api.deleteWatch).not.toHaveBeenCalled();
    fireEvent.click(within(row('Coach')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete watch' }));
    await waitFor(() => expect(api.watches).toHaveBeenCalledTimes(2));
    expect(api.deleteWatch).toHaveBeenCalledWith(1);
  });

  it('shows a failed action as an alert and keeps the list', async () => {
    const api = fakeApi();
    api.setWatchEnabled.mockRejectedValue(new Error('The watch is gone'));
    show(api);
    fireEvent.click(await screen.findByRole('switch', { name: 'Watching Coach' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The watch is gone');
    expect(row('Coach')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { onClose } = show();
    await screen.findByRole('listitem', { name: 'Watch Coach' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
