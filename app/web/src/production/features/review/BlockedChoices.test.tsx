import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlockedChoices } from './BlockedChoices';

describe('BlockedChoices', () => {
  it('sends the clips still ticked when a review stop is answered', () => {
    const onChoose = vi.fn();
    render(<BlockedChoices choices={['Keep the picked clips']} items={['a.mp4 (5.0 s)', 'b.mp4 (5.0 s)', 'c.mp4 (5.0 s)']} busy={false} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'b.mp4 (5.0 s)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep 2 picked' }));
    expect(onChoose).toHaveBeenCalledWith('Keep the picked clips', [0, 2]);
  });
});
