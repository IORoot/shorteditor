import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayPicker } from './DayPicker';

describe('DayPicker', () => {
  it('adds a day and keeps the list sorted', () => {
    const onChange = vi.fn();
    render(<DayPicker selected={[3]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(onChange).toHaveBeenCalledWith([0, 3]);
  });

  it('removes a day that is already selected', () => {
    const onChange = vi.fn();
    render(<DayPicker selected={[0, 6]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  it('marks selected days as pressed', () => {
    render(<DayPicker selected={[6]} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts the week on Monday and ends on Sunday', () => {
    render(<DayPicker selected={[]} onChange={() => undefined} />);
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  });

  it('has a compact variant with smaller chips and a hidden legend', () => {
    render(<DayPicker compact selected={[]} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Monday' }).className).toContain('size-7');
    expect(screen.getByText('Days')).toHaveClass('sr-only');
  });
});
