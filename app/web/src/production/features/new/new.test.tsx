import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const onSaveWatch = vi.fn();
  const onClose = vi.fn();
  const previewFolders = vi.fn().mockResolvedValue(preview);
  render(<NewBatchDialog defaults={defaults} pipelines={[{ id: 1, name: 'Join clips', stageCount: 5 }]} busy={false} error={null} onCreate={onCreate} onCreateMany={onCreateMany} onSaveWatch={onSaveWatch} onClose={onClose} browse={browse} previewFolders={previewFolders} {...over} />);
  return { onCreate, onCreateMany, onSaveWatch, onClose, previewFolders };
}

const fill = (name: string, folder: string) => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Input folder'), { target: { value: folder } });
  fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
};

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
  it('keeps Create disabled until the name and folder are filled', { tags: ['full'] }, () => {
    const { onCreate } = open();
    const create = screen.getByRole('button', { name: 'Create batch' });
    expect(create).toBeDisabled();
    fill('Coach Saturdays', '/clips/coach');
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ name: 'Coach Saturdays', inputFolder: '/clips/coach', runOn: 'any' });
  });

  it('lets the user pick where it runs', { tags: ['full'] }, () => {
    const { onCreate } = open();
    fill('A', '/x');
    fireEvent.change(screen.getByLabelText('Run on'), { target: { value: 'studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ runOn: 'studio' });
  });

  it('offers Any worker plus the server workers', { tags: ['full'] }, () => {
    open();
    const options = Array.from(screen.getByLabelText('Run on').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Any worker', 'This computer', 'Studio Mac']);
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

  it('does not send twice while creating', { tags: ['full'] }, () => {
    open({ busy: true });
    fill('A', '/x');
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('puts the cursor in the Name field and closes on Escape', { tags: ['full'] }, () => {
    const { onClose } = open();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets Escape close only the folder picker when both are open', { tags: ['full'] }, async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose a folder' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the folder alone when the picker is cancelled', { tags: ['full'] }, async () => {
    open();
    fill('A', '/clips/mine');
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose a folder' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Input folder')).toHaveValue('/clips/mine');
  });
});

describe('NewBatchDialog, subfolders', () => {
  const many = () => fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
  const parent = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const pipeline = () => fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
  const settled = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500); }); };

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('switches between the two forms, with the right title, and keeps what was typed in each', { tags: ['full'] }, () => {
    open();
    expect(screen.getByRole('radio', { name: 'One folder' })).toHaveAttribute('aria-checked', 'true');
    fill('Coach', '/clips/coach');
    many();
    expect(screen.getByRole('heading', { name: 'New batches' })).toBeInTheDocument();
    expect(screen.getByLabelText('Parent folder')).toBeInTheDocument();
    expect(screen.queryByLabelText('Input folder')).toBeNull();
    parent('/Volumes/Edit/Collected');
    pipeline();
    fireEvent.click(screen.getByRole('radio', { name: 'One folder' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Coach');
    many();
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/Volumes/Edit/Collected');
  });

  it('does not ask the server for a preview while the one-folder form is showing', { tags: ['full'] }, async () => {
    const { previewFolders } = open();
    await settled();
    expect(previewFolders).not.toHaveBeenCalled();
  });

  it('previews the folders and offers to create one batch for each new one', async () => {
    const { previewFolders } = open();
    many();
    parent('/c');
    pipeline();
    await settled();
    expect(previewFolders).toHaveBeenCalledWith('/c', PATTERN_PRESETS[0].pattern, undefined);
    expect(await screen.findByText('2026-11-14_a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 1 batch' })).toBeEnabled();
  });

  it('sends the whole form once, as one batch request', async () => {
    const { onCreateMany } = open();
    many();
    parent('/c');
    pipeline();
    fireEvent.change(screen.getByLabelText('Name each batch'), { target: { value: '{name} reel' } });
    await settled();
    fireEvent.click(await screen.findByRole('button', { name: 'Create 1 batch' }));
    expect(onCreateMany).toHaveBeenCalledTimes(1);
    expect(onCreateMany.mock.calls[0][0]).toMatchObject({ parentFolder: '/c', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name} reel', pipelineId: 1 });
    expect(onCreateMany.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('keeps Create disabled with nothing to create, a refused pattern, or while busy', { tags: ['full'] }, async () => {
    const none = { matches: [preview.matches[3]], notMatching: 0, truncated: false };
    const { previewFolders } = open({ previewFolders: vi.fn().mockResolvedValue(none) });
    expect(previewFolders).toBeDefined();
    many();
    parent('/c');
    pipeline();
    await settled();
    expect(await screen.findByText('No videos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create 0 batches|Create batches/ })).toBeDisabled();
  });

  it('shows the server message for a refused pattern and keeps Create disabled', { tags: ['full'] }, async () => {
    open({ previewFolders: vi.fn().mockRejectedValue(new Error('The pattern could take far too long to match')) });
    many();
    parent('/c');
    pipeline();
    await settled();
    expect(await screen.findByRole('alert')).toHaveTextContent('far too long');
    expect(screen.getByRole('button', { name: /Create/ })).toBeDisabled();
  });

  it('shows Creating… and stays disabled while busy', { tags: ['full'] }, async () => {
    open({ busy: true });
    many();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('passes the output folder to the preview so a clash is shown before Create', { tags: ['full'] }, async () => {
    const { previewFolders } = open();
    many();
    parent('/c');
    pipeline();
    fireEvent.change(screen.getByLabelText('Output folder'), { target: { value: '/out/reels' } });
    await settled();
    expect(previewFolders).toHaveBeenLastCalledWith('/c', PATTERN_PRESETS[0].pattern, '/out/reels');
  });
});

describe('NewBatchDialog, keeping watch', () => {
  const many = () => fireEvent.click(screen.getByRole('radio', { name: 'Subfolders' }));
  const parent = (value: string) => fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value } });
  const pipeline = () => fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: '1' } });
  const settled = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); }); };

  it('with Keep watching on, Start watching saves a watch and creates no one-off batches', async () => {
    const { onSaveWatch, onCreateMany } = open();
    many();
    parent('/c');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.change(screen.getByLabelText('Watch name'), { target: { value: 'Coach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
    expect(onSaveWatch).toHaveBeenCalledTimes(1);
    expect(onSaveWatch.mock.calls[0]).toEqual([expect.objectContaining({ parentFolder: '/c', watching: true, watchName: 'Coach', watchExisting: false }), null]);
    expect(onCreateMany).not.toHaveBeenCalled();
  });

  it('with the existing folders switched on, the button says it creates them and starts watching', { tags: ['full'] }, async () => {
    open();
    many();
    parent('/c');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('switch', { name: 'Keep watching this folder' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Also create batches for the 2 folders already there' }));
    expect(screen.getByRole('button', { name: 'Create 2 batches and start watching' })).toBeEnabled();
  });

  it('adding a watch from the Watches panel is watch-only, with no mode switch and a title that says so', { tags: ['full'] }, async () => {
    const { onSaveWatch } = open({ watchTarget: { kind: 'add' } });
    expect(screen.getByRole('heading', { name: 'New watch' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'One folder' })).toBeNull();
    parent('/c');
    pipeline();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
    expect(onSaveWatch).toHaveBeenCalledWith(expect.objectContaining({ parentFolder: '/c', watching: true }), null);
  });

  it('editing a watch is prefilled, saves to that watch, and offers no existing-folders switch', { tags: ['full'] }, async () => {
    const watch = {
      id: 3, name: 'Coach', parentFolder: '/c/coach', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', runOn: 'any', outputRoot: null,
      steps: [], pipelineId: 1, pipelineName: 'Join clips', intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, enabled: true, createdAt: 'x', lastCheckedAt: null, lastError: null, waiting: [], createdTotal: 0,
      status: 'watching' as const, statusLine: '',
    };
    const { onSaveWatch } = open({ watchTarget: { kind: 'edit', watch } });
    expect(screen.getByRole('heading', { name: 'Edit watch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/c/coach');
    expect(screen.getByLabelText('Watch name')).toHaveValue('Coach');
    expect(screen.queryByRole('switch', { name: /Also create batches/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save watch' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save watch' }));
    expect(onSaveWatch).toHaveBeenCalledWith(expect.objectContaining({ parentFolder: '/c/coach', watching: true }), 3);
  });
});
