import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Run } from '../../lib/types';
import { RunHistory } from './RunHistory';
import { RunRow } from './RunRow';

const run: Run = {
  id: 9,
  collectorId: 1,
  startedAt: 'Sun 15 Nov, 02:00',
  trigger: 'scheduled',
  status: 'done',
  outcome: 'Moved 142 clips',
  canUndo: true,
};

describe('RunRow', () => {
  it('shows the trigger, outcome and status', () => {
    render(<table><tbody><RunRow run={run} onUndo={() => undefined} /></tbody></table>);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Moved 142 clips')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('calls onUndo with the run id', () => {
    const onUndo = vi.fn();
    render(<table><tbody><RunRow run={run} onUndo={onUndo} /></tbody></table>);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledWith(9);
  });

  it('hides Undo when the run cannot be undone', () => {
    render(<table><tbody><RunRow run={{ ...run, canUndo: false, status: 'failed', trigger: 'manual' }} onUndo={() => undefined} /></tbody></table>);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });
});

describe('RunHistory', () => {
  it('shows loading when there is no state yet', () => {
    render(<RunHistory state={null} onUndo={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading history');
  });

  it('shows the empty state', () => {
    render(<RunHistory state={{ status: 'ready', data: [] }} onUndo={() => undefined} />);
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
  });

  it('shows an error message', () => {
    render(<RunHistory state={{ status: 'error', message: 'down' }} onUndo={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load history');
  });

  it('renders a row per run', () => {
    render(<RunHistory state={{ status: 'ready', data: [run, { ...run, id: 10 }] }} onUndo={() => undefined} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
  });
});
