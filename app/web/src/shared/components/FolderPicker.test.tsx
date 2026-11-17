import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FolderPicker } from './FolderPicker';

describe('FolderPicker', () => {
  const listing = {
    path: '/Volumes/Edit',
    parent: '/Volumes',
    entries: [{ name: 'Collected', path: '/Volumes/Edit/Collected' }],
  };

  it('lists folders, navigates into one and chooses the current folder', async () => {
    const browse = vi
      .fn()
      .mockResolvedValueOnce(listing)
      .mockResolvedValueOnce({ path: '/Volumes/Edit/Collected', parent: '/Volumes/Edit', entries: [] });
    const onChoose = vi.fn();
    render(<FolderPicker startPath="/Volumes/Edit" browse={browse} onChoose={onChoose} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Collected' }));
    expect(await screen.findByText('No subfolders.')).toBeInTheDocument();
    expect(browse).toHaveBeenLastCalledWith('/Volumes/Edit/Collected');
    fireEvent.click(screen.getByRole('button', { name: 'Choose this folder' }));
    expect(onChoose).toHaveBeenCalledWith('/Volumes/Edit/Collected');
  });

  it('can go up to the parent', async () => {
    const browse = vi.fn().mockResolvedValue(listing);
    render(<FolderPicker startPath="/Volumes/Edit" browse={browse} onChoose={() => undefined} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: '..' }));
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith('/Volumes'));
  });

  it('shows an error and keeps Choose disabled', async () => {
    const browse = vi.fn().mockRejectedValue(new Error('Folder not found'));
    const onClose = vi.fn();
    render(<FolderPicker startPath="/nope" browse={browse} onChoose={() => undefined} onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Folder not found');
    expect(screen.getByRole('button', { name: 'Choose this folder' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('lets you climb out of a folder that does not exist yet', async () => {
    const browse = vi
      .fn()
      .mockRejectedValueOnce(new Error('Folder not found: /Volumes/Edit/Collected'))
      .mockResolvedValueOnce({ path: '/Volumes/Edit', parent: '/Volumes', entries: [] });
    render(<FolderPicker startPath="/Volumes/Edit/Collected" browse={browse} onChoose={() => undefined} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to parent folder' }));
    expect(await screen.findByText('No subfolders.')).toBeInTheDocument();
    expect(browse).toHaveBeenLastCalledWith('/Volumes/Edit');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<FolderPicker startPath="/Volumes/Edit" browse={vi.fn().mockResolvedValue(listing)} onChoose={() => undefined} onClose={onClose} />);
    await screen.findByRole('button', { name: '..' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
