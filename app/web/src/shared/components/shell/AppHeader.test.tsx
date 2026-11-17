import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

const TABS = [
  { id: 'collection', label: 'Collection', enabled: true },
  { id: 'production', label: 'Production', enabled: true },
  { id: 'output', label: 'Output', enabled: false },
];

describe('AppHeader tabs', () => {
  it('reports which enabled tab was clicked', { tags: ['full'] }, () => {
    const onSelect = vi.fn();
    render(<AppHeader tabs={TABS} activeTab="collection" status={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(onSelect).toHaveBeenCalledWith('production');
  });

  it('does nothing for a tab that is not available yet', { tags: ['full'] }, () => {
    const onSelect = vi.fn();
    render(<AppHeader tabs={TABS} activeTab="collection" status={null} onSelect={onSelect} />);
    const output = screen.getByRole('button', { name: /Output/ });
    expect(output).toBeDisabled();
    fireEvent.click(output);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the active tab as the current page', { tags: ['full'] }, () => {
    render(<AppHeader tabs={TABS} activeTab="production" status={null} />);
    expect(screen.getByRole('button', { name: 'Production' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Collection' })).not.toHaveAttribute('aria-current');
  });
});
