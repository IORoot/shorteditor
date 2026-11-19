import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectorActions } from './CollectorActions';

describe('CollectorActions', () => {
  it('shows Edit, Dry run and Run now, each with an icon', { tags: ['full'] }, () => {
    render(<CollectorActions onEdit={() => undefined} />);
    for (const name of ['Edit', 'Dry run', 'Run now']) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).not.toBeNull();
    }
  });

  it('calls the matching handler', () => {
    const onEdit = vi.fn();
    const onDryRun = vi.fn();
    const onRun = vi.fn();
    render(<CollectorActions onEdit={onEdit} onDryRun={onDryRun} onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect([onEdit, onDryRun, onRun].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('calls onDuplicate from the Duplicate button', { tags: ['full'] }, () => {
    const onDuplicate = vi.fn();
    render(<CollectorActions onEdit={() => undefined} onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('can disable Run now while a run is in progress', { tags: ['full'] }, () => {
    render(<CollectorActions onEdit={() => undefined} runDisabled />);
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeEnabled();
  });
});
