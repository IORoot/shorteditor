import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { BatchCard } from './BatchCard';
import { Board } from './Board';
import { StageStrip } from './StageStrip';

const output = { path: '/out/a.mp4', duration: 58.4, sizeBytes: 48_450_000 };

describe('StageStrip', () => {
  it('renders one segment per stage with its state', { tags: ['full'] }, () => {
    render(<StageStrip segments={['done', 'run', 'todo']} />);
    const states = within(screen.getByTestId('stage-strip')).getAllByTestId('stage-segment').map((el) => el.getAttribute('data-state'));
    expect(states).toEqual(['done', 'run', 'todo']);
  });
});

describe('BatchCard', () => {
  it('shows the stage of a running batch with its strip and chip', { tags: ['full'] }, () => {
    render(<BatchCard card={makeCard({ name: 'Class Tuesdays', status: 'running', stageTitle: 'Join in order', stagePosition: 4 })} selected={false} onOpen={() => undefined} />);
    const card = screen.getByRole('button', { name: 'Class Tuesdays, Running' });
    expect(within(card).getByText('Join in order')).toBeInTheDocument();
    expect(within(card).getAllByTestId('stage-segment').map((el) => el.getAttribute('data-state'))).toEqual(['done', 'done', 'done', 'run', 'todo']);
  });

  it('says when a queued batch will start', { tags: ['full'] }, () => {
    const { rerender } = render(<BatchCard card={makeCard({ status: 'queued', queuePosition: 0 })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    rerender(<BatchCard card={makeCard({ status: 'queued', queuePosition: 2 })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText('Starts after 2 batches')).toBeInTheDocument();
  });

  it('shows why a blocked batch is waiting and what went wrong with a failed one', { tags: ['full'] }, () => {
    const { rerender } = render(<BatchCard card={makeCard({ status: 'blocked', blockedReason: 'The video is 75 s, 15 s over the 60 s limit' })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText('The video is 75 s, 15 s over the 60 s limit')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    rerender(<BatchCard card={makeCard({ status: 'failed', error: 'No clips found in /clips/x' })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText('No clips found in /clips/x')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows a still from the first clip, and the film icon when there is no picture', () => {
    const { container } = render(<BatchCard card={makeCard({ batchId: 7, status: 'review', output })} selected={false} onOpen={() => undefined} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/api/production/batches/7/thumbnail');
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the size and length of a finished video, and nothing odd when there is no output', { tags: ['full'] }, () => {
    const { rerender, container } = render(<BatchCard card={makeCard({ status: 'review', output })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText('46.2 MB · 00:58')).toBeInTheDocument();
    rerender(<BatchCard card={makeCard({ status: 'review', output: null })} selected={false} onOpen={() => undefined} />);
    expect(container.textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('keeps a very long name and path from breaking the card but keeps them readable', { tags: ['full'] }, () => {
    const name = 'N'.repeat(200);
    render(<BatchCard card={makeCard({ name, inputFolder: `/clips/${'p'.repeat(200)}` })} selected={false} onOpen={() => undefined} />);
    const title = screen.getByText(name);
    expect(title).toHaveAttribute('title', name);
    expect(title.className).toMatch(/truncate/);
  });

  it('says stage in the singular for a one-stage pipeline', { tags: ['full'] }, () => {
    render(<BatchCard card={makeCard({ pipeline: ['Render'], stageCount: 1 })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByText(/· 1 stage$/)).toBeInTheDocument();
  });

  it('keeps the stage strip out of block elements, which a button may not contain', { tags: ['full'] }, () => {
    render(<StageStrip segments={['done']} />);
    expect(screen.getByTestId('stage-strip').tagName).toBe('SPAN');
  });

  it('shows the whole error as a tooltip when the line is cut short', { tags: ['full'] }, () => {
    render(<BatchCard card={makeCard({ status: 'failed', error: 'No clips found in /very/long/path' })} selected={false} onOpen={() => undefined} />);
    expect(screen.getByTitle('No clips found in /very/long/path')).toBeInTheDocument();
  });

  it('opens on click and shows the selected state', { tags: ['full'] }, () => {
    const onOpen = vi.fn();
    const card = makeCard({ name: 'A' });
    render(<BatchCard card={card} selected onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: /^A,/ });
    expect(button).toHaveAttribute('aria-current', 'true');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(card);
  });
});

describe('Board', () => {
  const cards = [
    makeCard({ name: 'Ready one', status: 'review', output }),
    makeCard({ name: 'Blocked one', status: 'blocked', blockedReason: 'Over' }),
    makeCard({ name: 'Failed one', status: 'failed', error: 'Boom' }),
    makeCard({ name: 'Running one', status: 'running', stagePosition: 2, stageTitle: 'Order clips' }),
    makeCard({ name: 'Queued one', status: 'queued', queuePosition: 0 }),
    makeCard({ name: 'Done one', status: 'approved', output }),
  ];

  it('puts each batch in its column with a count', () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const column = (name: string) => screen.getByRole('region', { name });
    expect(within(column('Review')).getByText('Ready one')).toBeInTheDocument();
    expect(within(column('Review')).getByText('Blocked one')).toBeInTheDocument();
    expect(within(column('Review')).getByText('Failed one')).toBeInTheDocument();
    expect(within(column('Review')).getByText('3')).toBeInTheDocument();
    expect(within(column('Running')).getByText('Running one')).toBeInTheDocument();
    expect(within(column('Queued')).getByText('Queued one')).toBeInTheDocument();
  });

  it('shows the flow left to right as Queued, Running, Review, then Approved', { tags: ['full'] }, () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const titles = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(titles).toEqual(['Queued', 'Running', 'Review', 'Approved']);
  });

  it('paints a failed batch red and keeps it in Review', { tags: ['full'] }, () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const review = screen.getByRole('region', { name: 'Review' });
    expect(within(review).getByRole('button', { name: /Failed one/ }).className).toContain('bg-bad-soft');
    expect(within(review).getByRole('button', { name: /Ready one/ }).className).toContain('bg-surface');
  });

  it('keeps approved batches out of the other columns and in the Approved column', { tags: ['full'] }, () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const others = ['Queued', 'Running', 'Review'].map((n) => screen.getByRole('region', { name: n }));
    others.forEach((c) => expect(within(c).queryByText('Done one')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Approved' })).getByText('Done one')).toBeInTheDocument();
  });

  it('says so in a column with nothing in it', { tags: ['full'] }, () => {
    render(<Board cards={[makeCard({ status: 'queued' })]} selectedBatchId={null} onOpen={() => undefined} />);
    expect(within(screen.getByRole('region', { name: 'Running' })).getByText('Nothing here')).toBeInTheDocument();
  });

  it('marks only the selected batch and opens a clicked one', { tags: ['full'] }, () => {
    const onOpen = vi.fn();
    render(<Board cards={cards} selectedBatchId={cards[0].batchId} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Ready one/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Blocked one/ })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: /Failed one/ }));
    expect(onOpen).toHaveBeenCalledWith(cards[2]);
  });

  it('copes with hundreds of batches', { tags: ['full'] }, () => {
    const many = Array.from({ length: 300 }, (_, i) => makeCard({ name: `Batch ${i}`, status: i % 2 ? 'queued' : 'review', queuePosition: i, output }));
    render(<Board cards={many} selectedBatchId={null} onOpen={() => undefined} />);
    expect(screen.getAllByRole('button').length).toBe(300);
  });
});
