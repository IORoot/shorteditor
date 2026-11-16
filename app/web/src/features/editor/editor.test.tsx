import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { makeCollector, makeConfig } from '../../test/fixtures';
import { EditCollectorScreen } from './EditCollectorScreen';
import { FolderField } from './FolderField';
import { FolderPicker } from './FolderPicker';
import { OutputSection } from './OutputSection';
import { PreviewPanel } from './PreviewPanel';
import { SourceSection } from './SourceSection';
import { TokenRow } from './TokenRow';

afterEach(() => vi.restoreAllMocks());

describe('FolderField', () => {
  it('reports typing and Browse clicks', () => {
    const onChange = vi.fn();
    const onBrowse = vi.fn();
    render(<FolderField label="Input folder" value="/a" onChange={onChange} onBrowse={onBrowse} />);
    fireEvent.change(screen.getByLabelText('Input folder'), { target: { value: '/b' } });
    expect(onChange).toHaveBeenCalledWith('/b');
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    expect(onBrowse).toHaveBeenCalled();
  });

  it('can disable browsing', () => {
    render(<FolderField label="Input folder" value="" onChange={() => undefined} onBrowse={() => undefined} browseDisabled />);
    expect(screen.getByRole('button', { name: 'Browse for input folder' })).toBeDisabled();
  });
});

describe('SourceSection', () => {
  it('shows the SSH fields for ssh sources and edits them', () => {
    const onChange = vi.fn();
    render(<SourceSection config={makeConfig()} onChange={onChange} onBrowseInput={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'other-nas' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ host: 'other-nas' }));
    expect(screen.getByLabelText('Key path')).toHaveValue('~/.ssh/id_ed25519');
    expect(screen.getByRole('button', { name: 'Browse for input folder' })).toBeDisabled();
    expect(screen.getByText(/Browsing SSH folders is not available yet/)).toBeInTheDocument();
  });

  it('hides the SSH fields for local sources and allows browsing', () => {
    const onBrowse = vi.fn();
    render(<SourceSection config={makeConfig({ sourceType: 'local' })} onChange={() => undefined} onBrowseInput={onBrowse} />);
    expect(screen.queryByLabelText('Host')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browse for input folder' }));
    expect(onBrowse).toHaveBeenCalled();
  });

  it('changes the source type', () => {
    const onChange = vi.fn();
    render(<SourceSection config={makeConfig({ sourceType: 'local' })} onChange={onChange} onBrowseInput={() => undefined} />);
    expect(screen.queryByRole('radio', { name: 'Mount' })).not.toBeInTheDocument();
  });
});

describe('TokenRow', () => {
  it('inserts the clicked token', () => {
    const onInsert = vi.fn();
    render(<TokenRow onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: '{weekday}' }));
    expect(onInsert).toHaveBeenCalledWith('{weekday}');
  });
});

describe('OutputSection', () => {
  it('appends a token to the folder structure when the field has no selection', () => {
    const onChange = vi.fn();
    render(<OutputSection config={makeConfig({ folderTemplate: 'a' })} onChange={onChange} onBrowseOutput={() => undefined} />);
    const field = screen.getByLabelText('Folder structure') as HTMLInputElement;
    field.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: '{counter}' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ folderTemplate: 'a{counter}' }));
  });

  it('edits group by, transfer and suffix', () => {
    const onChange = vi.fn();
    render(<OutputSection config={makeConfig()} onChange={onChange} onBrowseOutput={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ groupBy: 'week' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Copy' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ transfer: 'copy' }));
    fireEvent.change(screen.getByLabelText('Suffix'), { target: { value: 'jam' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ suffix: 'jam' }));
  });

  it('opens the output browser', () => {
    const onBrowse = vi.fn();
    render(<OutputSection config={makeConfig()} onChange={() => undefined} onBrowseOutput={onBrowse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse for output folder' }));
    expect(onBrowse).toHaveBeenCalled();
  });
});

describe('PreviewPanel', () => {
  it('shows the rendered folder for the sample clip', () => {
    render(<PreviewPanel state={{ status: 'ready', data: { relativePath: '2026-11-14_Sat_coach', fullPath: '/o/2026-11-14_Sat_coach' } }} outputFolder="/Volumes/Edit/" />);
    expect(screen.getByTestId('preview-folder')).toHaveTextContent('2026-11-14_Sat_coach');
    expect(screen.getByText('/Volumes/Edit/')).toBeInTheDocument();
    expect(screen.getByText(/-2 suffix/)).toBeInTheDocument();
  });

  it('shows a placeholder while loading and the error message on failure', () => {
    const { rerender } = render(<PreviewPanel state={{ status: 'loading' }} outputFolder="" />);
    expect(screen.getByTestId('preview-folder')).toHaveTextContent('…');
    rerender(<PreviewPanel state={{ status: 'error', message: 'Unknown token {bogus}' }} outputFolder="" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown token {bogus}');
  });

  it('lists the tokens with examples', () => {
    render(<PreviewPanel state={{ status: 'loading' }} outputFolder="" />);
    expect(screen.getByText('{window:start}')).toBeInTheDocument();
  });
});

describe('FolderPicker', () => {
  const listing = {
    path: '/Volumes/Edit',
    parent: '/Volumes',
    entries: [{ name: 'Collected', path: '/Volumes/Edit/Collected' }],
  };

  it('lists folders, navigates into one and chooses the current folder', async () => {
    const browse = vi
      .spyOn(api, 'browse')
      .mockResolvedValueOnce(listing)
      .mockResolvedValueOnce({ path: '/Volumes/Edit/Collected', parent: '/Volumes/Edit', entries: [] });
    const onChoose = vi.fn();
    render(<FolderPicker startPath="/Volumes/Edit" onChoose={onChoose} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Collected' }));
    expect(await screen.findByText('No subfolders.')).toBeInTheDocument();
    expect(browse).toHaveBeenLastCalledWith('/Volumes/Edit/Collected');
    fireEvent.click(screen.getByRole('button', { name: 'Choose this folder' }));
    expect(onChoose).toHaveBeenCalledWith('/Volumes/Edit/Collected');
  });

  it('can go up to the parent', async () => {
    const browse = vi.spyOn(api, 'browse').mockResolvedValue(listing);
    render(<FolderPicker startPath="/Volumes/Edit" onChoose={() => undefined} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: '..' }));
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith('/Volumes'));
  });

  it('shows an error and keeps Choose disabled', async () => {
    vi.spyOn(api, 'browse').mockRejectedValue(new Error('Folder not found'));
    const onClose = vi.fn();
    render(<FolderPicker startPath="/nope" onChoose={() => undefined} onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Folder not found');
    expect(screen.getByRole('button', { name: 'Choose this folder' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('lets you climb out of a folder that does not exist yet', async () => {
    const browse = vi
      .spyOn(api, 'browse')
      .mockRejectedValueOnce(new Error('Folder not found: /Volumes/Edit/Collected'))
      .mockResolvedValueOnce({ path: '/Volumes/Edit', parent: '/Volumes', entries: [] });
    render(<FolderPicker startPath="/Volumes/Edit/Collected" onChoose={() => undefined} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to parent folder' }));
    expect(await screen.findByText('No subfolders.')).toBeInTheDocument();
    expect(browse).toHaveBeenLastCalledWith('/Volumes/Edit');
  });
});

describe('EditCollectorScreen', () => {
  const collector = makeCollector();

  function mockPreview() {
    return vi.spyOn(api, 'previewFolder').mockResolvedValue({ relativePath: '2026-11-14_Sat_coach', fullPath: '/x' });
  }

  it('shows the current config and a live preview', async () => {
    mockPreview();
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Coach Saturdays');
    expect(screen.getByLabelText('Output folder')).toHaveValue('/Volumes/Edit/Collected');
    expect(await screen.findByText('2026-11-14_Sat_coach')).toBeInTheDocument();
  });

  it('saves the edited config and reports success', async () => {
    mockPreview();
    const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(collector);
    const onSaved = vi.fn();
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Coach Sundays' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Coach Sundays', folderTemplate: '{date:YYYY-MM-DD}_{weekday}_{suffix}' }));
  });

  it('shows the server validation message and does not leave the screen', async () => {
    mockPreview();
    vi.spyOn(api, 'saveConfig').mockRejectedValue(new Error('Output folder is required'));
    const onSaved = vi.fn();
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={() => undefined} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
    expect(await screen.findByText('Output folder is required')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('cancels from the Cancel button and the breadcrumb', () => {
    mockPreview();
    const onCancel = vi.fn();
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={onCancel} onSaved={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Collectors \/ Coach Saturdays/ }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('fills the output folder from the folder picker', async () => {
    mockPreview();
    vi.spyOn(api, 'browse').mockResolvedValue({ path: '/Volumes/Other', parent: '/Volumes', entries: [] });
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={() => undefined} onSaved={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse for output folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose this folder' }));
    expect(screen.getByLabelText('Output folder')).toHaveValue('/Volumes/Other');
  });

  it('shows the filters section between source and output and saves the filters', async () => {
    mockPreview();
    const save = vi.spyOn(api, 'saveConfig').mockResolvedValue(collector);
    render(<EditCollectorScreen onDelete={() => undefined} collector={collector} onCancel={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    fireEvent.change(screen.getByLabelText('Rule value'), { target: { value: 'coach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1].filters[0].rules[0]).toMatchObject({ kind: 'name', value: 'coach' });
    expect(save.mock.calls[0][1].dateSource).toBe('modified');
  });
});
