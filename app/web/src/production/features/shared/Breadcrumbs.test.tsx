import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('shows the crumbs in order inside a labelled navigation', () => {
    render(<Breadcrumbs crumbs={[{ label: 'Production', onOpen: () => {} }, { label: 'Class Tuesdays', onOpen: () => {} }, { label: 'clip_0039' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toBe('ProductionClass Tuesdaysclip_0039');
  });

  it('makes every crumb with an action a button that calls it', () => {
    const onProduction = vi.fn();
    render(<Breadcrumbs crumbs={[{ label: 'Production', onOpen: onProduction }, { label: 'clip_0039' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(onProduction).toHaveBeenCalledTimes(1);
  });

  it('marks the last crumb as the current page and never as a button', () => {
    render(<Breadcrumbs crumbs={[{ label: 'Production', onOpen: () => {} }, { label: 'clip_0039' }]} />);
    const current = screen.getByText('clip_0039');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: 'clip_0039' })).toBeNull();
  });
});
