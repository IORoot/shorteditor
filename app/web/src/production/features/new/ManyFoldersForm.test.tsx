import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PATTERN_PRESETS, defaultManyForm, type ManyForm } from '../../lib/presets';
import type { PreviewState } from '../../hooks/useFolderPreview';
import { ManyFoldersForm } from './ManyFoldersForm';

const defaults = { outputRoot: '/out', workers: [{ id: 'local', label: 'This computer' }] };
const browse = vi.fn().mockResolvedValue({ path: '/c', parent: '/', entries: [] });
const ready: PreviewState = {
  status: 'ready', refreshing: false,
  data: { matches: [{ name: '2026-11-07_a', path: '/c/2026-11-07_a', clipCount: 4, status: 'will_create' }], notMatching: 1, truncated: false },
};

function show(over: Partial<ManyForm> = {}, preview: PreviewState = { status: 'idle' }) {
  const onChange = vi.fn();
  const form = { ...defaultManyForm(), ...over };
  render(<ManyFoldersForm form={form} onChange={onChange} defaults={defaults} pipelines={[{ id: 1, name: 'Join clips', stageCount: 5 }]} browse={browse} preview={preview} />);
  return onChange;
}

describe('ManyFoldersForm', () => {
  it('hints that the output goes in an "output" folder beside the parent folder', () => {
    show({ parentFolder: '/Volumes/Edit/Sat' });
    expect(screen.getByLabelText('Output folder')).toHaveAttribute('placeholder', '/Volumes/Edit/output');
  });


  it('asks for the parent folder, the pattern, the preset and the name template', { tags: ['full'] }, () => {
    show({ parentFolder: '/c' });
    expect(screen.getByLabelText('Parent folder')).toHaveValue('/c');
    expect(screen.getByLabelText('Folder name pattern (regular expression)')).toHaveValue(PATTERN_PRESETS[0].pattern);
    expect(screen.getByLabelText('Pattern preset')).toHaveValue('date');
    expect(screen.getByLabelText('Batch name')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Ignore subfolders' })).not.toBeChecked();
  });

  it('reports every edit as a patch', { tags: ['full'] }, () => {
    const onChange = show();
    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: '/Volumes/Edit' } });
    expect(onChange).toHaveBeenLastCalledWith({ parentFolder: '/Volumes/Edit' });
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'Reel' } });
    expect(onChange).toHaveBeenLastCalledWith({ batchName: 'Reel' });
  });

  it('fills the pattern from a preset and clears it for Custom', { tags: ['full'] }, () => {
    const onChange = show();
    fireEvent.change(screen.getByLabelText('Pattern preset'), { target: { value: 'any' } });
    expect(onChange).toHaveBeenLastCalledWith({ presetId: 'any', pattern: '^.+$' });
    fireEvent.change(screen.getByLabelText('Pattern preset'), { target: { value: 'custom' } });
    expect(onChange).toHaveBeenLastCalledWith({ presetId: 'custom', pattern: '' });
  });

  it('switches to Custom when the user edits the pattern by hand', { tags: ['full'] }, () => {
    const onChange = show();
    fireEvent.change(screen.getByLabelText('Folder name pattern (regular expression)'), { target: { value: '^cam-\\d+$' } });
    expect(onChange).toHaveBeenLastCalledWith({ presetId: 'custom', pattern: '^cam-\\d+$' });
  });

  it('opens the folder picker for the parent folder', { tags: ['full'] }, async () => {
    const onChange = show({ parentFolder: '/c' });
    fireEvent.click(screen.getByRole('button', { name: 'Browse for parent folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose this folder' }));
    expect(onChange).toHaveBeenLastCalledWith({ parentFolder: '/c' });
  });

  it('says what to do first, shows loading, the server message, and the list', { tags: ['full'] }, () => {
    const view = (preview: PreviewState) => {
      const { unmount } = render(<ManyFoldersForm form={defaultManyForm()} onChange={() => undefined} defaults={defaults} pipelines={[{ id: 1, name: 'Join clips', stageCount: 5 }]} browse={browse} preview={preview} />);
      return unmount;
    };
    let unmount = view({ status: 'idle' });
    expect(screen.getByText('Choose a parent folder to see the folders inside it.')).toBeInTheDocument();
    unmount();
    unmount = view({ status: 'loading' });
    expect(screen.getByText('Looking at the folders…')).toBeInTheDocument();
    unmount();
    unmount = view({ status: 'error', message: 'The pattern could take far too long to match' });
    expect(screen.getByRole('alert')).toHaveTextContent('far too long');
    unmount();
    view(ready);
    expect(screen.getByText('2026-11-07_a')).toBeInTheDocument();
  });

  it('keeps showing the list while it refreshes', { tags: ['full'] }, () => {
    show({}, { ...(ready as Extract<PreviewState, { status: 'ready' }>), refreshing: true });
    expect(screen.getByText('2026-11-07_a')).toBeInTheDocument();
    expect(screen.getByText('Updating…')).toBeInTheDocument();
  });

  it('shows the shared settings for every batch', { tags: ['full'] }, () => {
    show();
    expect(screen.getByText('Settings for every batch')).toBeInTheDocument();
    expect(screen.getByLabelText('Run on')).toBeInTheDocument();
    expect(screen.getByLabelText('Output folder')).toHaveAttribute('placeholder', '/out');
  });

  it('shows no watch options for a one-off batch run', { tags: ['full'] }, () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Keep watching this folder' })).toBeNull();
  });

  it('with watching on and the existing folders not batched, the preview says they are already there and offers no boxes', () => {
    const onChange = vi.fn();
    render(<ManyFoldersForm form={{ ...defaultManyForm(), parentFolder: '/c', watching: true }} onChange={onChange} defaults={defaults} pipelines={[{ id: 1, name: 'Join clips', stageCount: 5 }]} browse={browse} preview={ready} watch="optional" />);
    expect(screen.getByText('Already there')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '2026-11-07_a' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Keep watching this folder' })).toBeChecked();
  });
});
