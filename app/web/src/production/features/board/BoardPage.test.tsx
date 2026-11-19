import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { BoardPage } from './BoardPage';
import type { ProductionApi } from '../../lib/api';

const apiOf = (cards: ReturnType<typeof vi.fn>) => ({ cards, defaults: vi.fn().mockResolvedValue({ outputRoot: '/out', workers: [] }), pipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Join clips', stageCount: 5 }]), createBatch: vi.fn() }) as unknown as ProductionApi;

describe('BoardPage', () => {
  it('shows the title, the counts and the batch names once loaded', async () => {
    const cards = vi.fn().mockResolvedValue([makeCard({ name: 'Coach Saturdays', status: 'review' }), makeCard({ name: 'Camera A', status: 'queued' })]);
    render(<BoardPage api={apiOf(cards)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText('Coach Saturdays')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Production', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('2 batches · 1 queued · 1 to review')).toBeInTheDocument();
  });

  it('shows the empty state', { tags: ['full'] }, async () => {
    render(<BoardPage api={apiOf(vi.fn().mockResolvedValue([]))} />);
    expect(await screen.findByText('No batches yet. Create one to start.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that loads again', { tags: ['full'] }, async () => {
    const cards = vi.fn().mockRejectedValueOnce(new Error('Couldn’t reach the backend')).mockResolvedValue([makeCard({ name: 'Back again' })]);
    render(<BoardPage api={apiOf(cards)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach the backend');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
  });

  it('tells the user when the list on screen may be out of date', { tags: ['full'] }, async () => {
    vi.useFakeTimers();
    try {
      const cards = vi.fn().mockResolvedValueOnce([makeCard({ name: 'Still here', status: 'running' })]).mockRejectedValue(new Error('offline'));
      render(<BoardPage api={apiOf(cards)} />);
      await vi.advanceTimersByTimeAsync(2100);
      expect(screen.getByText('Still here')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Showing the last list');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the new batch dialog from the New batch button and closes it again', async () => {
    render(<BoardPage api={apiOf(vi.fn().mockResolvedValue([]))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    expect(screen.getByRole('dialog', { name: 'New batch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'New batch' })).toBeNull();
  });
});
