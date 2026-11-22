import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultManyForm, type ManyForm } from '../../lib/presets';
import { WatchOptions } from './WatchOptions';

function show(over: Partial<ManyForm> = {}, mode: 'optional' = 'optional', folderCount = 3) {
  const onChange = vi.fn();
  render(<WatchOptions value={{ ...defaultManyForm(), parentFolder: '/Volumes/Edit/Coach', ...over }} onChange={onChange} mode={mode} folderCount={folderCount} />);
  return onChange;
}

describe('WatchOptions', () => {
  it('is off by default and shows only the switch until it is turned on', { tags: ['full'] }, () => {
    const onChange = show();
    expect(screen.getByRole('switch', { name: 'Keep watching this folder' })).not.toBeChecked();
    expect(screen.queryByLabelText('Check every (minutes)')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    expect(onChange).toHaveBeenLastCalledWith({ watching: true });
  });

  it('shows the timing fields with 5, 10 and 20 when watching, and the timing fields', { tags: ['full'] }, () => {
    show({ watching: true });
    expect(screen.getByLabelText('Check every (minutes)')).toHaveValue('5');
    expect(screen.getByLabelText('Wait until nothing has changed for (minutes)')).toHaveValue('10');
    expect(screen.getByLabelText('Most new folders per check')).toHaveValue('20');
    expect(screen.queryByLabelText('Watch name')).toBeNull();  // the batch's own name is the watch's name
  });

  it('marks an invalid number with the same plain hint as the settings', { tags: ['full'] }, () => {
    show({ watching: true, intervalMinutes: '0', maxPerCheck: '101' });
    expect(screen.getAllByText('Use a whole number from 1 to 1440')).toHaveLength(1);
    expect(screen.getByText('Use a whole number from 1 to 100')).toBeInTheDocument();
  });

  it('reports each change as a patch', { tags: ['full'] }, () => {
    const onChange = show({ watching: true });
    fireEvent.change(screen.getByLabelText('Check every (minutes)'), { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith({ intervalMinutes: '15' });
  });

  it('offers to add the folders already there as cards, off by default, and says how many', { tags: ['full'] }, () => {
    const onChange = show({ watching: true }, 'optional', 3);
    const existing = screen.getByRole('switch', { name: 'Also add the 3 folders already there as cards' });
    expect(existing).not.toBeChecked();
    expect(screen.getByText('Off: folders already there are skipped. Any still being copied are added once they settle.')).toBeInTheDocument();
    fireEvent.click(existing);
    expect(onChange).toHaveBeenLastCalledWith({ watchExisting: true });
  });

  it('uses the singular for one folder', { tags: ['full'] }, () => {
    show({ watching: true }, 'optional', 1);
    expect(screen.getByRole('switch', { name: 'Also add the 1 folder already there as cards' })).toBeInTheDocument();
  });
});
