import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Collector } from '../../lib/types';
import { makeCollector } from '../../test/fixtures';
import { CollectorList } from './CollectorList';
import { CollectorRow } from './CollectorRow';

const base: Collector = makeCollector({ source: 'SSH coach-nas · Move' });

describe('CollectorRow', () => {
  it('shows the next run when the schedule is on', { tags: ['full'] }, () => {
    render(<CollectorRow collector={base} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('Next · Sun 02:00')).toBeInTheDocument();
  });

  it('shows Schedule off when disabled', { tags: ['full'] }, () => {
    const collector = { ...base, schedule: { ...base.schedule, enabled: false } };
    render(<CollectorRow collector={collector} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('Schedule off')).toBeInTheDocument();
  });

  it('shows a status note when there is one', { tags: ['full'] }, () => {
    const collector = { ...base, statusNote: { tone: 'warn' as const, text: '1 skipped' } };
    render(<CollectorRow collector={collector} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('shows when an auto-collecting collector last looked, and that it waits while the source is down', () => {
    const now = Date.now();
    const auto = { ...base, schedule: { ...base.schedule, mode: 'auto' as const, lastChecked: new Date(now - 12_000).toISOString() } };
    const { rerender } = render(<CollectorRow collector={auto} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('Auto-collecting · checked 12s ago')).toBeInTheDocument();
    rerender(<CollectorRow collector={{ ...auto, schedule: { ...auto.schedule, lastChecked: null } }} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('Auto-collecting · not checked yet')).toBeInTheDocument();
    rerender(<CollectorRow collector={{ ...auto, active: false }} selected={false} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('Turned off')).toBeInTheDocument();
  });

  it('selects by id and toggles with the new value', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<CollectorRow collector={base} selected onSelect={onSelect} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Coach Saturdays' }));
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Coach Saturdays' }));
    expect(onToggle).toHaveBeenCalledWith(1, false);
  });

  it('selects when anywhere on the row is clicked, but the switch only toggles', { tags: ['full'] }, () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<CollectorRow collector={base} selected={false} onSelect={onSelect} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('SSH coach-nas · Move'));
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('switch', { name: 'Turn on Coach Saturdays' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(1, false);
  });
});

describe('CollectorList', () => {
  const noop = () => undefined;

  it('shows loading', { tags: ['full'] }, () => {
    render(<CollectorList onNew={() => undefined} state={{ status: 'loading' }} selectedId={null} onSelect={noop} onToggle={noop} onRetry={noop} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading collectors');
  });

  it('shows an error with retry', { tags: ['full'] }, () => {
    const onRetry = vi.fn();
    render(<CollectorList onNew={() => undefined} state={{ status: 'error', message: 'down' }} selectedId={null} onSelect={noop} onToggle={noop} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t reach the backend');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the empty state', { tags: ['full'] }, () => {
    render(<CollectorList onNew={() => undefined} state={{ status: 'ready', data: [] }} selectedId={null} onSelect={noop} onToggle={noop} onRetry={noop} />);
    expect(screen.getByText('No collectors yet.')).toBeInTheDocument();
  });

  it('renders each collector', { tags: ['full'] }, () => {
    render(<CollectorList onNew={() => undefined} state={{ status: 'ready', data: [base] }} selectedId={1} onSelect={noop} onToggle={noop} onRetry={noop} />);
    expect(screen.getByRole('button', { name: 'Coach Saturdays' })).toHaveAttribute('aria-pressed', 'true');
  });
});
