import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FolderPreview, PreviewItem } from '../../lib/types';
import { FolderPreviewList } from './FolderPreviewList';

const item = (name: string, status: PreviewItem['status'], clipCount = 3): PreviewItem => ({ name, path: `/p/${name}`, clipCount, status });
const preview = (matches: PreviewItem[], extra: Partial<FolderPreview> = {}): FolderPreview => ({ matches, notMatching: 0, truncated: false, ...extra });

describe('FolderPreviewList', () => {
  const full = preview(
    [item('2026-11-14_a', 'will_create', 142), item('2026-11-07_b', 'will_create', 1), item('2026-10-17_c', 'already_batched', 97), item('2026-11-15_d', 'no_videos', 0), item('2026-11-16_e', 'unreadable', 5)],
    { notMatching: 2 },
  );

  it('counts each kind in the header and leaves zero parts out', () => {
    render(<FolderPreviewList preview={full} include={[]} onToggle={() => undefined} />);
    expect(screen.getByText('2 will be created · 1 already batched · 1 has no videos · 1 cannot be fully read · 2 do not match')).toBeInTheDocument();
    render(<FolderPreviewList preview={preview([item('a', 'will_create')])} include={[]} onToggle={() => undefined} />);
    expect(screen.getByText('1 will be created')).toBeInTheDocument();
  });

  it('shows each folder with its clip count and status chip', () => {
    render(<FolderPreviewList preview={full} include={[]} onToggle={() => undefined} />);
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(within(row('2026-11-14_a')).getByText('142 clips')).toBeInTheDocument();
    expect(within(row('2026-11-14_a')).getByText('Will create')).toBeInTheDocument();
    expect(within(row('2026-11-07_b')).getByText('1 clip')).toBeInTheDocument();
    expect(within(row('2026-10-17_c')).getByText('Already batched')).toBeInTheDocument();
    expect(within(row('2026-11-15_d')).getByText('No videos')).toBeInTheDocument();
    expect(within(row('2026-11-16_e')).getByText('Cannot be fully read')).toBeInTheDocument();
  });

  it('ticks and fixes the folders that will be created, and offers a box only for already-batched ones', () => {
    render(<FolderPreviewList preview={full} include={[]} onToggle={() => undefined} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['2026-11-14_a', '2026-11-07_b', '2026-10-17_c']);
    expect(boxes[0]).toBeChecked();
    expect(boxes[0]).toBeDisabled();
    expect(boxes[2]).not.toBeChecked();
    expect(boxes[2]).toBeEnabled();
  });

  it('reports a toggle of an already-batched folder, and shows it ticked when included', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FolderPreviewList preview={full} include={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '2026-10-17_c' }));
    expect(onToggle).toHaveBeenCalledWith('2026-10-17_c');
    rerender(<FolderPreviewList preview={full} include={['2026-10-17_c']} onToggle={onToggle} />);
    expect(screen.getByRole('checkbox', { name: '2026-10-17_c' })).toBeChecked();
  });

  it('says so when the list was cut, and when nothing matches', () => {
    const { rerender } = render(<FolderPreviewList preview={preview([item('a', 'will_create')], { truncated: true })} include={[]} onToggle={() => undefined} />);
    expect(screen.getByText(/list was cut/)).toBeInTheDocument();
    rerender(<FolderPreviewList preview={preview([], { notMatching: 4 })} include={[]} onToggle={() => undefined} />);
    expect(screen.getByText('No folders match this pattern.')).toBeInTheDocument();
    expect(screen.getByText('4 do not match')).toBeInTheDocument();
  });

  it('explains how already batched folders are treated', () => {
    render(<FolderPreviewList preview={full} include={[]} onToggle={() => undefined} />);
    expect(screen.getByText('Folders already batched are skipped. Tick one to include it again.')).toBeInTheDocument();
  });

  it('keeps long names inside the row', () => {
    render(<FolderPreviewList preview={preview([item('N'.repeat(200), 'will_create')])} include={[]} onToggle={() => undefined} />);
    expect(screen.getByTitle('N'.repeat(200))).toBeInTheDocument();
  });
});
