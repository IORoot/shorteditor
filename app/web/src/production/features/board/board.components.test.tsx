import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { ApprovedRow } from './ApprovedRow';
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
    expect(within(column('Ready to review')).getByText('Ready one')).toBeInTheDocument();
    expect(within(column('Needs attention')).getByText('Blocked one')).toBeInTheDocument();
    expect(within(column('Needs attention')).getByText('Failed one')).toBeInTheDocument();
    expect(within(column('Needs attention')).getByText('2')).toBeInTheDocument();
    expect(within(column('Running')).getByText('Running one')).toBeInTheDocument();
    expect(within(column('Queued')).getByText('Queued one')).toBeInTheDocument();
  });

  it('shows the columns left to right as Queued, Running, Needs attention, Ready to review', { tags: ['full'] }, () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const titles = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(titles).toEqual(['Queued', 'Running', 'Needs attention', 'Ready to review', 'Approved']);
  });

  it('keeps approved batches out of the columns and in the approved row', { tags: ['full'] }, () => {
    render(<Board cards={cards} selectedBatchId={null} onOpen={() => undefined} />);
    const columns = ['Ready to review', 'Needs attention', 'Running', 'Queued'].map((n) => screen.getByRole('region', { name: n }));
    columns.forEach((c) => expect(within(c).queryByText('Done one')).toBeNull());
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

describe('ApprovedRow', () => {
  const approved = Array.from({ length: 8 }, (_, i) => makeCard({ name: `Approved ${i}`, status: 'approved', batchId: 100 + i, output }));

  it('shows nothing when there are no approved batches', { tags: ['full'] }, () => {
    const { container } = render(<ApprovedRow cards={[]} onOpen={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the newest five and reveals the rest on request', { tags: ['full'] }, () => {
    render(<ApprovedRow cards={approved} onOpen={() => undefined} />);
    expect(screen.getAllByRole('button', { name: /^Approved \d,/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: /^Approved 7,/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approved 0,/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all (8)' }));
    expect(screen.getAllByRole('button', { name: /^Approved \d,/ })).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });

  it('has no Show all button for five or fewer', { tags: ['full'] }, () => {
    render(<ApprovedRow cards={approved.slice(0, 5)} onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});
