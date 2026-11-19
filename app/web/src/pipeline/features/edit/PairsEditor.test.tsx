import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PairsEditor } from './PairsEditor';

describe('PairsEditor', () => {
  it('adds, edits and removes name and value rows, saving only the named ones', { tags: ['full'] }, () => {
    const onChange = vi.fn();
    render(<PairsEditor label="Variables" help="Your own values." value={{ CLASS_LIMIT: '45' }} onChange={onChange} />);
    expect(screen.getByLabelText('Name 1')).toHaveValue('CLASS_LIMIT');
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    expect(onChange).not.toHaveBeenLastCalledWith(expect.objectContaining({ '': '' }));
    fireEvent.change(screen.getByLabelText('Name 2'), { target: { value: 'MIN_GAP' } });
    fireEvent.change(screen.getByLabelText('Value 2'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith({ CLASS_LIMIT: '45', MIN_GAP: '2' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove CLASS_LIMIT' }));
    expect(onChange).toHaveBeenLastCalledWith({ MIN_GAP: '2' });
  });
});
