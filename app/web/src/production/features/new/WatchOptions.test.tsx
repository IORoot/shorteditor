import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultManyForm, type ManyForm } from '../../lib/presets';
import { WatchOptions } from './WatchOptions';

function show(over: Partial<ManyForm> = {}, mode: 'optional' | 'locked' | 'edit' = 'optional', folderCount = 3) {
  const onChange = vi.fn();
  render(<WatchOptions value={{ ...defaultManyForm(), parentFolder: '/Volumes/Edit/Coach', ...over }} onChange={onChange} mode={mode} folderCount={folderCount} />);
  return onChange;
}

describe('WatchOptions', () => {
  it('is off by default and shows only the switch until it is turned on', () => {
    const onChange = show();
    expect(screen.getByRole('switch', { name: 'Keep watching this folder' })).not.toBeChecked();
    expect(screen.queryByLabelText('Check every (minutes)')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    expect(onChange).toHaveBeenLastCalledWith({ watching: true });
  });

  it('shows the timing fields with 5, 10 and 20 when watching, and the watch name from the folder', () => {
    show({ watching: true });
    expect(screen.getByLabelText('Check every (minutes)')).toHaveValue('5');
    expect(screen.getByLabelText('Wait until nothing has changed for (minutes)')).toHaveValue('10');
    expect(screen.getByLabelText('At most per check (batches)')).toHaveValue('20');
    expect(screen.getByLabelText('Watch name')).toHaveAttribute('placeholder', 'Coach');
  });

  it('marks an invalid number with the same plain hint as the settings', () => {
    show({ watching: true, intervalMinutes: '0', maxPerCheck: '101' });
    expect(screen.getAllByText('Use a whole number from 1 to 1440')).toHaveLength(1);
    expect(screen.getByText('Use a whole number from 1 to 100')).toBeInTheDocument();
  });

  it('reports each change as a patch', () => {
    const onChange = show({ watching: true });
    fireEvent.change(screen.getByLabelText('Check every (minutes)'), { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith({ intervalMinutes: '15' });
    fireEvent.change(screen.getByLabelText('Watch name'), { target: { value: 'Coach Sat' } });
    expect(onChange).toHaveBeenLastCalledWith({ watchName: 'Coach Sat' });
  });

  it('offers to batch the folders already there, off by default, and says how many', () => {
    const onChange = show({ watching: true }, 'optional', 3);
    const existing = screen.getByRole('switch', { name: 'Also create batches for the 3 folders already there' });
    expect(existing).not.toBeChecked();
    expect(screen.getByText('Off: the folders already there are skipped and only new ones get batches.')).toBeInTheDocument();
    fireEvent.click(existing);
    expect(onChange).toHaveBeenLastCalledWith({ watchExisting: true });
  });

  it('uses the singular for one folder', () => {
    show({ watching: true }, 'optional', 1);
    expect(screen.getByRole('switch', { name: 'Also create batches for the 1 folder already there' })).toBeInTheDocument();
  });

  it('when the watch is added from the Watches panel, watching is already on and the switch is not offered', () => {
    show({}, 'locked');
    expect(screen.queryByRole('switch', { name: 'Keep watching this folder' })).toBeNull();
    expect(screen.getByLabelText('Check every (minutes)')).toBeInTheDocument();
  });

  it('when editing a watch there is no existing-folders switch, because it only applies when the watch starts', () => {
    show({ watching: true }, 'edit');
    expect(screen.queryByRole('switch', { name: /Also create batches/ })).toBeNull();
    expect(screen.getByLabelText('Watch name')).toBeInTheDocument();
  });
});
