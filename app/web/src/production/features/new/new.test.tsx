import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FolderField } from './FolderField';
import { NewBatchDialog } from './NewBatchDialog';

const defaults = { outputRoot: '/Volumes/Edit/production_output', workers: [{ id: 'local', label: 'This computer' }, { id: 'studio', label: 'Studio Mac' }] };
const browse = vi.fn(async (path?: string) =>
  path === '/clips/coach'
    ? { path: '/clips/coach', parent: '/clips', entries: [] }
    : { path: '/clips', parent: '/', entries: [{ name: 'coach', path: '/clips/coach' }] },
);

function open(over: Partial<React.ComponentProps<typeof NewBatchDialog>> = {}) {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  render(<NewBatchDialog defaults={defaults} busy={false} error={null} onCreate={onCreate} onClose={onClose} browse={browse} {...over} />);
  return { onCreate, onClose };
}

const fill = (name: string, folder: string) => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Input folder'), { target: { value: folder } });
};

describe('FolderField', () => {
  it('types a path, or browses and picks one', async () => {
    const onChange = vi.fn();
    render(<FolderField label="Input folder" value="/clips" onChange={onChange} browse={browse} />);
    fireEvent.change(screen.getByLabelText('Input folder'), { target: { value: '/clips/x' } });
    expect(onChange).toHaveBeenCalledWith('/clips/x');
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'coach' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose this folder' }));
    expect(onChange).toHaveBeenLastCalledWith('/clips/coach');
    expect(screen.queryByRole('dialog', { name: 'Choose a folder' })).toBeNull();
  });
});

describe('NewBatchDialog', () => {
  it('keeps Create disabled until the name and folder are filled', () => {
    const { onCreate } = open();
    const create = screen.getByRole('button', { name: 'Create batch' });
    expect(create).toBeDisabled();
    fill('Coach Saturdays', '/clips/coach');
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ name: 'Coach Saturdays', inputFolder: '/clips/coach', maxSeconds: '60', maxSizeMb: '50', fit: 'crop', runOn: 'any' });
  });

  it('disables Create for a limit that is not a positive number', () => {
    open();
    fill('A', '/x');
    fireEvent.change(screen.getByLabelText('Max length (seconds)'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeDisabled();
  });

  it('lets the user pick order, fit and where it runs', () => {
    const { onCreate } = open();
    fill('A', '/x');
    fireEvent.change(screen.getByLabelText('Order clips by'), { target: { value: 'random' } });
    fireEvent.change(screen.getByLabelText('Fit different shapes'), { target: { value: 'blur' } });
    fireEvent.change(screen.getByLabelText('Run on'), { target: { value: 'studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ orderBy: 'random', fit: 'blur', runOn: 'studio' });
  });

  it('offers Any worker plus the server workers', () => {
    open();
    const options = Array.from(screen.getByLabelText('Run on').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Any worker', 'This computer', 'Studio Mac']);
  });

  it('shows the default output folder as a hint and keeps Action clips for later', () => {
    open();
    expect(screen.getByLabelText('Output folder')).toHaveAttribute('placeholder', '/Volumes/Edit/production_output');
    const pipeline = screen.getByLabelText('Pipeline') as HTMLSelectElement;
    expect(Array.from(pipeline.options).map((o) => [o.textContent, o.disabled])).toEqual([['Join clips', false], ['Action clips (coming with AI detect)', true]]);
  });

  it('shows the server error and closes with Cancel', () => {
    const { onClose } = open({ error: 'The output folder and the input folder must not overlap' });
    expect(screen.getByRole('alert')).toHaveTextContent('must not overlap');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not send twice while creating', () => {
    open({ busy: true });
    fill('A', '/x');
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('explains a limit it cannot use instead of just disabling Create', () => {
    open();
    fill('A', '/x');
    fireEvent.change(screen.getByLabelText('Max length (seconds)'), { target: { value: '1,5' } });
    expect(screen.getByText('Use a number like 45 or 30.5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Max size (MB)'), { target: { value: '100001' } });
    expect(screen.getByText('At most 100000 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeDisabled();
  });

  it('puts the cursor in the Name field and closes on Escape', () => {
    const { onClose } = open();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets Escape close only the folder picker when both are open', async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose a folder' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the folder alone when the picker is cancelled', async () => {
    open();
    fill('A', '/clips/mine');
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Input folder')).toHaveValue('/clips/mine');
  });
});
