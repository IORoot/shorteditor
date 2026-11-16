import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlanResult } from '../../lib/types';
import { PlanDialog } from './PlanDialog';

const plan: PlanResult = {
  transfer: 'move',
  totalFiles: 14,
  totalBytes: 3 * 1024 ** 3,
  folderCount: 2,
  groups: [
    { folder: '2026-11-14_Sat_coach', path: '/out/2026-11-14_Sat_coach', renamed: false, count: 12, bytes: 1, sample: ['a.mp4', 'b.mp4'] },
    { folder: '2026-11-14_Sat_coach-2', path: '/out/2026-11-14_Sat_coach-2', renamed: true, count: 2, bytes: 1, sample: ['c.mp4', 'd.mp4'] },
  ],
  unmatched: 0,
  notSelected: 0,
  leftInPlace: 0,
  leftSample: [],
  notes: ['2026-11-14_Sat_coach already exists, so new clips go to 2026-11-14_Sat_coach-2.', 'Dates come from file modified time.'],
};

function renderDialog(overrides: Partial<Parameters<typeof PlanDialog>[0]> = {}) {
  const props = {
    mode: 'dry' as const,
    collectorName: 'Coach Saturdays',
    state: { status: 'ready' as const, data: plan },
    confirming: false,
    error: null,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<PlanDialog {...props} />);
  return props;
}

describe('PlanDialog', () => {
  it('shows the preview for a dry run, with no confirm button', () => {
    const props = renderDialog();
    expect(screen.getByRole('heading', { name: 'Dry run · Coach Saturdays' })).toBeInTheDocument();
    expect(screen.getByText('Preview only')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('3.0 GB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('lists each folder with its path, sample files and a numbered-suffix chip', () => {
    renderDialog();
    expect(screen.getByText('2026-11-14_Sat_coach')).toBeInTheDocument();
    expect(screen.getByText('-2 added')).toBeInTheDocument();
    expect(screen.getByText('/out/2026-11-14_Sat_coach-2')).toBeInTheDocument();
    expect(screen.getByText(/a\.mp4\s+b\.mp4\s+\+10 more/)).toBeInTheDocument();
    expect(screen.getByText('Dates come from file modified time.')).toBeInTheDocument();
  });

  it('asks for confirmation in run mode and confirms', () => {
    const props = renderDialog({ mode: 'run' });
    expect(screen.getByText('Will move files')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move 14 clips' }));
    expect(props.onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('uses copy and link verbs', () => {
    renderDialog({ mode: 'run', state: { status: 'ready', data: { ...plan, transfer: 'copy', totalFiles: 1 } } });
    expect(screen.getByRole('button', { name: 'Copy 1 clip' })).toBeInTheDocument();
  });

  it('disables confirm while loading, when nothing would happen, and while starting', () => {
    const { unmount } = render(<PlanDialog mode="run" collectorName="C" state={{ status: 'loading' }} confirming={false} error={null} onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Scanning');
    expect(screen.getByRole('button', { name: 'Move 0 clips' })).toBeDisabled();
    unmount();
    const empty = { ...plan, totalFiles: 0, groups: [], folderCount: 0, notes: ['No video files found in the input folder.'] };
    const second = render(<PlanDialog mode="run" collectorName="C" state={{ status: 'ready', data: empty }} confirming={false} error={null} onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Move 0 clips' })).toBeDisabled();
    second.unmount();
    renderDialog({ mode: 'run', confirming: true });
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('shows plan errors and start errors', () => {
    const { unmount } = render(<PlanDialog mode="dry" collectorName="C" state={{ status: 'error', message: 'SSH sources can’t be scanned yet' }} confirming={false} error={null} onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('SSH sources');
    unmount();
    renderDialog({ mode: 'run', error: 'Output folder is required' });
    expect(screen.getByRole('alert')).toHaveTextContent('Output folder is required');
  });

  it('lists what stays in place and why', () => {
    const left = { ...plan, unmatched: 5, notSelected: 2, leftInPlace: 7, leftSample: ['a.mp4', 'b.mp4'] };
    renderDialog({ state: { status: 'ready', data: left } });
    expect(screen.getByText('left in place')).toBeInTheDocument();
    expect(screen.getByText(/5 not matching the filters, 2 not picked by random selection/)).toBeInTheDocument();
    expect(screen.getByText(/a\.mp4\s+b\.mp4\s+\+5 more/)).toBeInTheDocument();
  });

  it('does not show the left-in-place box when nothing is left', () => {
    renderDialog();
    expect(screen.queryByText(/Left in place:/)).not.toBeInTheDocument();
  });
});
