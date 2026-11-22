import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Batch } from '../../lib/types';
import { EditBatchDialog } from './EditBatchDialog';

const batch: Batch = {
  id: 7, name: 'Coach', inputFolder: '/Volumes/Edit/Sat', steps: [], pipelineId: 1, runOn: 'any', outputRoot: '/Volumes/Edit/output',
  folderTemplate: '{{name}}-{{id}}', createdAt: '2026-11-20T10:00:00Z', autoRun: false,
  folderPattern: '^.+$', watching: false, watchIntervalMinutes: 5, watchSettleMinutes: 10, watchMaxPerCheck: 20,
};
const defaults = { outputRoot: '/out', workers: [{ id: 'local', label: 'This computer' }, { id: 'studio', label: 'Studio Mac' }] };
const pipelines = [{ id: 1, name: 'Join clips', stageCount: 5 }, { id: 2, name: 'Highlights', stageCount: 4 }];
const browse = vi.fn();

function show(over: Partial<Parameters<typeof EditBatchDialog>[0]> = {}) {
  const props = { batch, defaults, pipelines, browse, busy: false, error: null, onSave: vi.fn(), onClose: vi.fn(), ...over };
  render(<EditBatchDialog {...props} />);
  return props;
}

describe('EditBatchDialog', () => {
  it('opens with everything the batch is set up with', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Edit batch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Batch name')).toHaveValue('Coach');
    expect(screen.getByLabelText('Pipeline')).toHaveValue('1');
    expect(screen.getByLabelText('Run on')).toHaveValue('any');
    expect(screen.getByLabelText('Output folder')).toHaveValue('/Volumes/Edit/output');
    expect(screen.getByLabelText('Folder name')).toHaveValue('{{name}}-{{id}}');
    expect(screen.getByRole('switch', { name: 'Auto run' })).not.toBeChecked();
    expect(screen.getByText('/Volumes/Edit/Sat')).toBeInTheDocument();  // the input folder is shown, not editable
  });

  it('saves only what changed', () => {
    const props = show();
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach Tuesdays' } });
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Run on'), { target: { value: 'studio' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Auto run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith({ name: 'Coach Tuesdays', pipelineId: 2, runOn: 'studio', autoRun: true });
  });

  it('sends the output folder and folder name when they change', () => {
    const props = show();
    fireEvent.change(screen.getByLabelText('Output folder'), { target: { value: '/Volumes/Edit/results' } });
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'b-{{id}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith({ outputRoot: '/Volumes/Edit/results', folderTemplate: 'b-{{id}}' });
  });

  it('keeps Save off for an empty name, shows the server message, and closes on Cancel', () => {
    const props = show({ error: 'This batch is waiting or running.' });
    expect(screen.getByRole('alert')).toHaveTextContent('waiting or running');
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('switches watching on, with its timing, for a batch made from subfolders', () => {
    const props = show();
    expect(screen.getByRole('switch', { name: 'Keep watching this folder' })).not.toBeChecked();
    expect(screen.queryByLabelText('Check every (minutes)')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    expect(screen.getByLabelText('Check every (minutes)')).toHaveValue('5');
    fireEvent.change(screen.getByLabelText('Check every (minutes)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Wait until nothing has changed for (minutes)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Most new folders per check'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith({ watching: true, watchIntervalMinutes: 15, watchSettleMinutes: 3, watchMaxPerCheck: 7 });
  });

  it('shows the watch settings of a batch that is already watching, and switches it off', () => {
    const props = show({ batch: { ...batch, watching: true, watchIntervalMinutes: 9 } });
    expect(screen.getByRole('switch', { name: 'Keep watching this folder' })).toBeChecked();
    expect(screen.getByLabelText('Check every (minutes)')).toHaveValue('9');
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith({ watching: false });
  });

  it('keeps Save off for a timing number the server would refuse', () => {
    show({ batch: { ...batch, watching: true } });
    fireEvent.change(screen.getByLabelText('Check every (minutes)'), { target: { value: '0' } });
    expect(screen.getByText('Use a whole number from 1 to 1440')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says a batch of one folder cannot watch, and offers no switch', () => {
    show({ batch: { ...batch, folderPattern: null } });
    expect(screen.queryByRole('switch', { name: 'Keep watching this folder' })).toBeNull();
    expect(screen.getByText(/Only a batch made from subfolders can watch/)).toBeInTheDocument();
  });
});
