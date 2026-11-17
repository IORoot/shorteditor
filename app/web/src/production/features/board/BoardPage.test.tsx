import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { BoardPage } from './BoardPage';
import type { ProductionApi } from '../../lib/api';

const apiOf = (cards: ReturnType<typeof vi.fn>) => ({ cards }) as unknown as ProductionApi;

describe('BoardPage', () => {
  it('shows the title, the counts and the batch names once loaded', async () => {
    const cards = vi.fn().mockResolvedValue([makeCard({ name: 'Coach Saturdays', status: 'review' }), makeCard({ name: 'Camera A', status: 'queued' })]);
    render(<BoardPage api={apiOf(cards)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText('Coach Saturdays')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Production', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('2 batches · 1 ready to review · 1 queued')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    render(<BoardPage api={apiOf(vi.fn().mockResolvedValue([]))} />);
    expect(await screen.findByText('No batches yet. Create one to start.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that loads again', async () => {
    const cards = vi.fn().mockRejectedValueOnce(new Error('Couldn’t reach the backend')).mockResolvedValue([makeCard({ name: 'Back again' })]);
    render(<BoardPage api={apiOf(cards)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t reach the backend');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
  });

  it('tells the user when the list on screen may be out of date', async () => {
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

  it('has a New batch button that calls back', async () => {
    const onNew = vi.fn();
    render(<BoardPage api={apiOf(vi.fn().mockResolvedValue([]))} onNew={onNew} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New batch' }));
    expect(onNew).toHaveBeenCalled();
  });
});
