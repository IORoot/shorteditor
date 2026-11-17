import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATTERN_PRESETS } from '../../lib/presets';
import { FolderField } from './FolderField';
import { NewBatchDialog } from './NewBatchDialog';

const defaults = { outputRoot: '/Volumes/Edit/production_output', workers: [{ id: 'local', label: 'This computer' }, { id: 'studio', label: 'Studio Mac' }] };
const browse = vi.fn(async (path?: string) =>
  path === '/clips/coach'
    ? { path: '/clips/coach', parent: '/clips', entries: [] }
    : { path: '/clips', parent: '/', entries: [{ name: 'coach', path: '/clips/coach' }] },
);

const preview = {
  matches: [
    { name: '2026-11-14_a', path: '/c/2026-11-14_a', clipCount: 4, status: 'will_create' as const },
    { name: '2026-11-07_b', path: '/c/2026-11-07_b', clipCount: 2, status: 'will_create' as const },
    { name: '2026-10-17_old', path: '/c/2026-10-17_old', clipCount: 9, status: 'already_batched' as const },
    { name: '2026-11-15_empty', path: '/c/2026-11-15_empty', clipCount: 0, status: 'no_videos' as const },
  ],
  notMatching: 1,
  truncated: false,
};

function open(over: Partial<React.ComponentProps<typeof NewBatchDialog>> = {}) {
  const onCreate = vi.fn();
  const onCreateMany = vi.fn();
  const onClose = vi.fn();
  const previewFolders = vi.fn().mockResolvedValue(preview);
  render(<NewBatchDialog defaults={defaults} busy={false} error={null} onCreate={onCreate} onCreateMany={onCreateMany} onClose={onClose} browse={browse} previewFolders={previewFolders} {...over} />);
  return { onCreate, onCreateMany, onClose, previewFolders };
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

describe('NewBatchDialog, folders inside a folder', () => {
  const many = () => fireEvent.click(screen.getByRole('radio', { name: 'Folders inside a folder' }));
  const parent = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const settled = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); };

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('switches between the two forms, with the right title, and keeps what was typed in each', () => {
    open();
    expect(screen.getByRole('radio', { name: 'One folder' })).toHaveAttribute('aria-checked', 'true');
    fill('Coach', '/clips/coach');
    many();
    expect(screen.getByRole('heading', { name: 'New batches' })).toBeInTheDocument();
    expect(screen.getByLabelText('Parent folder')).toBeInTheDocument();
    expect(screen.queryByLabelText('Input folder')).toBeNull();
    parent('/Volumes/Edit/Collected');
    fireEvent.click(screen.getByRole('radio', { name: 'One folder' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Coach');
    many();
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/Volumes/Edit/Collected');
  });

  it('does not ask the server for a preview while the one-folder form is showing', async () => {
    const { previewFolders } = open();
    await settled();
    expect(previewFolders).not.toHaveBeenCalled();
  });

  it('previews the folders and offers to create one batch for each new one', async () => {
    const { previewFolders } = open();
    many();
    parent('/c');
    await settled();
    expect(previewFolders).toHaveBeenCalledWith('/c', PATTERN_PRESETS[0].pattern, undefined);
    expect(await screen.findByText('2026-11-14_a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 2 batches' })).toBeEnabled();
  });

  it('counts a ticked already-batched folder, and says "1 batch" for one', async () => {
    open();
    many();
    parent('/c');
    await settled();
    fireEvent.click(await screen.findByRole('checkbox', { name: '2026-10-17_old' }));
    expect(screen.getByRole('button', { name: 'Create 3 batches' })).toBeEnabled();
  });

  it('sends the whole form, with the folders to include again, once', async () => {
    const { onCreateMany } = open();
    many();
    parent('/c');
    fireEvent.change(screen.getByLabelText('Name each batch'), { target: { value: '{name} reel' } });
    await settled();
    fireEvent.click(await screen.findByRole('checkbox', { name: '2026-10-17_old' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create 3 batches' }));
    expect(onCreateMany).toHaveBeenCalledTimes(1);
    expect(onCreateMany.mock.calls[0][0]).toMatchObject({ parentFolder: '/c', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name} reel', include: ['2026-10-17_old'], maxSeconds: '60' });
  });

  it('keeps Create disabled with nothing to create, a refused pattern, bad limits, or while busy', async () => {
    const none = { matches: [preview.matches[3]], notMatching: 0, truncated: false };
    const { previewFolders } = open({ previewFolders: vi.fn().mockResolvedValue(none) });
    expect(previewFolders).toBeDefined();
    many();
    parent('/c');
    await settled();
    expect(await screen.findByText('No videos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create 0 batches|Create batches/ })).toBeDisabled();
  });

  it('shows the server message for a refused pattern and keeps Create disabled', async () => {
    open({ previewFolders: vi.fn().mockRejectedValue(new Error('The pattern could take far too long to match')) });
    many();
    parent('/c');
    await settled();
    expect(await screen.findByRole('alert')).toHaveTextContent('far too long');
    expect(screen.getByRole('button', { name: /Create/ })).toBeDisabled();
  });

  it('disables Create for a limit the server would refuse', async () => {
    open();
    many();
    parent('/c');
    await settled();
    await screen.findByText('2026-11-14_a');
    fireEvent.change(screen.getByLabelText('Max length (seconds)'), { target: { value: '0.5' } });
    expect(screen.getByRole('button', { name: 'Create 2 batches' })).toBeDisabled();
  });

  it('shows Creating… and stays disabled while busy', async () => {
    open({ busy: true });
    many();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('passes the output folder to the preview so a clash is shown before Create', async () => {
    const { previewFolders } = open();
    many();
    parent('/c');
    fireEvent.change(screen.getByLabelText('Output folder'), { target: { value: '/out/reels' } });
    await settled();
    expect(previewFolders).toHaveBeenLastCalledWith('/c', PATTERN_PRESETS[0].pattern, '/out/reels');
  });
});
