import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCard } from '../../test/fixtures';
import { ReviewDrawer, type ReviewDrawerProps } from './ReviewDrawer';

const output = { path: '/out/Coach-1/pass-1/coach-sat.mp4', duration: 58.4, sizeBytes: 48_450_000 };

function drawer(overrides: Partial<ReviewDrawerProps> = {}, card = makeCard({ status: 'review', output, name: 'Coach Saturdays' })) {
  const props: ReviewDrawerProps = {
    card, outputUrl: '/api/production/passes/9/output', busy: false, error: null,
    onApprove: vi.fn(), onRunAgain: vi.fn(), onResolve: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<ReviewDrawer {...props} />) };
}

describe('ReviewDrawer', () => {
  it('lets the user play, approve or run again a finished batch', () => {
    const { props, container } = drawer();
    expect(screen.getByRole('dialog', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('Coach Saturdays')).toBeInTheDocument();
    expect(screen.getByText(/Pass 1/)).toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute('src', '/api/production/passes/9/output');
    expect(screen.getByText('coach-sat.mp4')).toBeInTheDocument();
    expect(screen.getByText('00:58')).toBeInTheDocument();
    expect(screen.getByText('46.2 MB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(props.onApprove).toHaveBeenCalledTimes(1);
    expect(props.onRunAgain).toHaveBeenCalledTimes(1);
  });

  it('never shows a broken player when there is no video, but still lets the user run it again', () => {
    const { container, props } = drawer({}, makeCard({ status: 'review', output: null }));
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(props.onRunAgain).toHaveBeenCalled();
  });

  it('says so when a blocked batch offers no choices', () => {
    drawer({}, makeCard({ status: 'blocked', blockedReason: 'Over', blockedChoices: [] }));
    expect(screen.getByText('No choices were offered for this block.')).toBeInTheDocument();
  });

  it('offers the choices of a blocked batch and nothing else', () => {
    const card = makeCard({ status: 'blocked', blockedReason: 'The video is 75 s, 15 s over the 60 s limit', blockedChoices: ['drop_shortest', 'keep_first', 'something_new'] });
    const { props, container } = drawer({}, card);
    expect(screen.getByText('The video is 75 s, 15 s over the 60 s limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drop the shortest parts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep the first parts and trim the last' }));
    expect(props.onResolve).toHaveBeenCalledWith('keep_first');
    fireEvent.click(screen.getByRole('button', { name: 'something_new' }));
    expect(props.onResolve).toHaveBeenCalledWith('something_new');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('shows what went wrong with a failed batch and lets the user run it again', () => {
    const { props } = drawer({}, makeCard({ status: 'failed', error: 'No clips found in /clips/x' }));
    expect(screen.getByText('No clips found in /clips/x')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(props.onRunAgain).toHaveBeenCalled();
  });

  it('only describes a running or queued batch', () => {
    const { rerender, props } = drawer({}, makeCard({ status: 'running', stageTitle: 'Join in order', stagePosition: 4 }));
    expect(screen.getByText('Join in order · stage 4 of 5')).toBeInTheDocument();
    rerender(<ReviewDrawer {...props} card={makeCard({ status: 'queued', queuePosition: 2 })} />);
    expect(screen.getByText('Starts after 2 batches')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
  });

  it('shows an approved batch with its video and no Approve button', () => {
    const { container } = drawer({}, makeCard({ status: 'approved', output }));
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows an action error inside the drawer', () => {
    drawer({ error: 'A newer pass exists for this batch.' });
    expect(screen.getByRole('alert')).toHaveTextContent('A newer pass exists for this batch.');
  });

  it('disables the actions while one is running', () => {
    drawer({ busy: true });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeDisabled();
  });

  it('says so when the video is not on the server any more', () => {
    const { container } = drawer();
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('alert')).toHaveTextContent('The video is not available on the server any more');
  });

  it('closes with the close button and with Escape', () => {
    const { props } = drawer();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('takes focus when it opens', () => {
    drawer();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('takes focus back when the button the user pressed goes away', () => {
    const { rerender, props } = drawer();
    const approve = screen.getByRole('button', { name: 'Approve' });
    approve.focus();
    rerender(<ReviewDrawer {...props} card={makeCard({ ...props.card, status: 'approved' })} />);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('keeps the full name readable through a tooltip', () => {
    drawer({}, makeCard({ status: 'failed', name: 'N'.repeat(300), error: 'E' }));
    expect(screen.getByTitle('N'.repeat(300))).toBeInTheDocument();
  });
});
