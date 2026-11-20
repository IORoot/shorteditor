import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { ReviewPage, type ReviewPageProps } from '../review/ReviewPage';
import { ChosenBar, ConfirmDialog, Outcome } from './ActionBar';

describe('ChosenBar', () => {
  it('offers every action, and asks for the count on delete', { tags: ['full'] }, () => {
    const onAct = vi.fn();
    render(<ChosenBar label="Chosen cards" noun="cards" count={2} busy={false} onAct={onAct} onClear={() => undefined} />);
    const bar = screen.getByRole('toolbar', { name: 'Chosen cards' });
    expect(bar).toHaveTextContent('2 chosen');
    for (const name of ['Pause', 'Resume', 'Stop', 'Run again', 'Delete 2']) expect(screen.getByRole('button', { name })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onAct).toHaveBeenCalledWith('stop');
  });

  it('is disabled until something is chosen', { tags: ['full'] }, () => {
    render(<ChosenBar label="Chosen batches" noun="batches" count={0} busy={false} onAct={() => undefined} onClear={() => undefined} />);
    expect(screen.getByText('Click the batches to choose them')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });
});

describe('Outcome', () => {
  it('says how many were done and why the others were not', { tags: ['full'] }, () => {
    render(<Outcome results={[{ id: 1, ok: true, message: 'Paused' }, { id: 2, ok: false, message: 'A approved card cannot be paused' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 done, 1 not done');
    expect(screen.getByText('A approved card cannot be paused')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('does nothing until the confirm button is pressed', { tags: ['full'] }, () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="Delete this card?" body="Gone." confirmLabel="Delete card" busy={false} error={null} onConfirm={onConfirm} onClose={() => undefined} />);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete card' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

function reviewWith(card: ReturnType<typeof makeCard>, onCardAction = vi.fn()) {
  const props: ReviewPageProps = {
    card, outputUrl: '/out', busy: false, error: null, pipelines: [], onApprove: () => undefined, onRunAgain: () => undefined,
    onResolve: () => undefined, onBack: () => undefined, onCardAction,
  };
  render(<ReviewPage {...props} />);
  return onCardAction;
}

describe('the card review page', () => {
  it('offers pause and stop while a card waits, and resume once it is paused', { tags: ['full'] }, () => {
    reviewWith(makeCard({ status: 'queued' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('sends the chosen action for this card, and asks before deleting it', { tags: ['full'] }, () => {
    const onCardAction = reviewWith(makeCard({ status: 'stopped' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onCardAction).toHaveBeenLastCalledWith('resume');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onCardAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete card' }));
    expect(onCardAction).toHaveBeenLastCalledWith('delete');
  });

  it('shows no card actions for a card that is running and cannot be deleted', { tags: ['full'] }, () => {
    reviewWith(makeCard({ status: 'running' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run this card again' })).toBeNull();
  });
});
