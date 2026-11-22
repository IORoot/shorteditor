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
  const onCreateMany = vi.fn();
  const onClose = vi.fn();
  const previewFolders = vi.fn().mockResolvedValue(preview);
  render(<NewBatchDialog defaults={defaults} pipelines={[{ id: 1, name: 'Join clips', stageCount: 5 }]} busy={false} error={null} onCreateMany={onCreateMany} onClose={onClose} browse={browse} previewFolders={previewFolders} {...over} />);
  return { onCreateMany, onClose, previewFolders };
}


describe('FolderField', () => {
  it('types a path, or browses and picks one', { tags: ['full'] }, async () => {
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
  const parentFolder = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const pipeline = () => fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
  const settled = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); };

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('has no one-folder option: it always starts on subfolders', { tags: ['full'] }, () => {
    open();
    expect(screen.getByRole('heading', { name: 'New batch' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Input folder')).toBeNull();
    expect(screen.getByLabelText('Parent folder')).toBeInTheDocument();
  });

  it('keeps Create disabled until the parent folder and pipeline are set', async () => {
    open();
    await settled();
    const create = screen.getByRole('button', { name: 'Create batches' });
    expect(create).toBeDisabled();
    parentFolder('/c');
    pipeline();
    await settled();
    expect(await screen.findByRole('button', { name: 'Create 1 batch' })).toBeEnabled();
  });

  it('shows the default output folder as a hint and lists the switched-on pipelines', { tags: ['full'] }, () => {
    open();
    expect(screen.getByLabelText('Output folder')).toHaveAttribute('placeholder', '/Volumes/Edit/production_output');
    const pipeline = screen.getByLabelText('Pipeline') as HTMLSelectElement;
    expect(Array.from(pipeline.options).map((o) => [o.textContent, o.disabled])).toEqual([['Choose a pipeline', false], ['Join clips', false]]);
  });

  it('shows the server error and closes with Cancel', { tags: ['full'] }, () => {
    const { onClose } = open({ error: 'The output folder and the input folder must not overlap' });
    expect(screen.getByRole('alert')).toHaveTextContent('must not overlap');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', { tags: ['full'] }, () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets Escape close only the folder picker when both are open', { tags: ['full'] }, async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Browse for parent folder' }));
    await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose a folder' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the parent folder alone when the picker is cancelled', { tags: ['full'] }, async () => {
    open();
    parentFolder('/clips/mine');
    fireEvent.click(screen.getByRole('button', { name: 'Browse for parent folder' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/clips/mine');
  });

  it('names the batch after the parent folder until the name is typed over', async () => {
    open();
    parentFolder('/Volumes/Edit/Collected');
    expect(screen.getByLabelText('Batch name')).toHaveValue('Collected');
    parentFolder('/Volumes/Edit/Reels');
    expect(screen.getByLabelText('Batch name')).toHaveValue('Reels');
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach Saturdays' } });
    parentFolder('/Volumes/Edit/Other');
    expect(screen.getByLabelText('Batch name')).toHaveValue('Coach Saturdays');
  });

  it('ignoring subfolders hides the pattern and preview, needs no preview, and sends the flag', async () => {
    const { onCreateMany, previewFolders } = open();
    parentFolder('/c');
    pipeline();
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore subfolders' }));
    expect(screen.queryByLabelText('Folder name pattern (regular expression)')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull();
    await settled();
    expect(previewFolders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 batch' }));
    expect(onCreateMany.mock.calls[0][0]).toMatchObject({ parentFolder: '/c', ignoreSubfolders: true, batchName: 'c' });
  });

  it('sends a typed batch name in the one request', async () => {
    const { onCreateMany } = open();
    parentFolder('/c');
    pipeline();
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach Saturdays' } });
    await settled();
    fireEvent.click(await screen.findByRole('button', { name: 'Create 1 batch' }));
    expect(onCreateMany.mock.calls[0][0]).toMatchObject({ batchName: 'Coach Saturdays', ignoreSubfolders: false });
  });
});

describe('NewBatchDialog, subfolders', () => {
  const parent = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const pipeline = () => fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
  const settled = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); };

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('keeps what was typed when the parent folder changes', { tags: ['full'] }, () => {
    open();
    parent('/Volumes/Edit/Collected');
    pipeline();
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/Volumes/Edit/Collected');
    expect(screen.getByLabelText('Pipeline')).toHaveValue('1');
  });

  it('previews the folders and offers to create one batch for each new one', async () => {
    const { previewFolders } = open();
    parent('/c');
    pipeline();
    await settled();
    expect(previewFolders).toHaveBeenCalledWith('/c', PATTERN_PRESETS[0].pattern, undefined);
    expect(await screen.findByText('2026-11-14_a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 1 batch' })).toBeEnabled();
  });

  it('sends the whole form once, as one batch request', async () => {
    const { onCreateMany } = open();
    parent('/c');
    pipeline();
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Reel' } });
    await settled();
    fireEvent.click(await screen.findByRole('button', { name: 'Create 1 batch' }));
    expect(onCreateMany).toHaveBeenCalledTimes(1);
    expect(onCreateMany.mock.calls[0][0]).toMatchObject({ parentFolder: '/c', pattern: PATTERN_PRESETS[0].pattern, batchName: 'Reel', pipelineId: 1 });
    expect(onCreateMany.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('keeps Create disabled with nothing to create, a refused pattern, or while busy', { tags: ['full'] }, async () => {
    const none = { matches: [preview.matches[3]], notMatching: 0, truncated: false };
    const { previewFolders } = open({ previewFolders: vi.fn().mockResolvedValue(none) });
    expect(previewFolders).toBeDefined();
    parent('/c');
    pipeline();
    await settled();
    expect(await screen.findByText('No videos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create 0 batches|Create batches/ })).toBeDisabled();
  });

  it('shows the server message for a refused pattern and keeps Create disabled', { tags: ['full'] }, async () => {
    open({ previewFolders: vi.fn().mockRejectedValue(new Error('The pattern could take far too long to match')) });
    parent('/c');
    pipeline();
    await settled();
    expect(await screen.findByRole('alert')).toHaveTextContent('far too long');
    expect(screen.getByRole('button', { name: /Create/ })).toBeDisabled();
  });

  it('shows Creating… and stays disabled while busy', { tags: ['full'] }, async () => {
    open({ busy: true });
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('passes the output folder to the preview so a clash is shown before Create', { tags: ['full'] }, async () => {
    const { previewFolders } = open();
    parent('/c');
    pipeline();
    fireEvent.change(screen.getByLabelText('Output folder'), { target: { value: '/out/reels' } });
    await settled();
    expect(previewFolders).toHaveBeenLastCalledWith('/c', PATTERN_PRESETS[0].pattern, '/out/reels');
  });
});

describe('NewBatchDialog, keeping watch', () => {
  const parent = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const pipeline = () => fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
  const settled = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); }); };

  it('with Keep watching on, one watching batch is created, named like any batch', async () => {
    const { onCreateMany } = open();
    parent('/c');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    expect(screen.getByLabelText('Batch name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Watch name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Coach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch and start watching' }));
    expect(onCreateMany).toHaveBeenCalledTimes(1);
    expect(onCreateMany.mock.calls[0][0]).toEqual(expect.objectContaining({ parentFolder: '/c', watching: true, batchName: 'Coach', watchExisting: false }));
  });

  it('can start watching a folder that has nothing in it yet', async () => {
    open({ previewFolders: vi.fn().mockResolvedValue({ matches: [], notMatching: 0, truncated: false }) });
    parent('/empty');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    expect(screen.getByRole('button', { name: 'Create batch and start watching' })).toBeEnabled();
  });

  it('the existing folders can be switched on to become cards now', { tags: ['full'] }, async () => {
    const { onCreateMany } = open();
    parent('/c');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Also add the 2 folders already there as cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create batch and start watching' }));
    expect(onCreateMany.mock.calls[0][0]).toEqual(expect.objectContaining({ watching: true, watchExisting: true }));
  });
});
