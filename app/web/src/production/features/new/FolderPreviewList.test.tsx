import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FolderPreview, PreviewItem } from '../../lib/types';
import { FolderPreviewList } from './FolderPreviewList';

const item = (name: string, status: PreviewItem['status'], clipCount = 3): PreviewItem => ({ name, path: `/p/${name}`, clipCount, status });
const preview = (matches: PreviewItem[], extra: Partial<FolderPreview> = {}): FolderPreview => ({ matches, notMatching: 0, truncated: false, ...extra });

describe('FolderPreviewList', () => {
  const full = preview(
    [item('2026-11-14_a', 'will_create', 142), item('2026-11-07_b', 'will_create', 1), item('2026-10-17_c', 'already_batched', 97), item('2026-11-15_d', 'no_videos', 0), item('2026-11-16_e', 'unreadable', 5)],
    { notMatching: 2 },
  );

  it('counts each kind in the header and leaves zero parts out', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={full} />);
    expect(screen.getByText('2 will be cards in one batch · 1 already batched · 1 has no videos · 1 cannot be fully read · 2 do not match')).toBeInTheDocument();
    render(<FolderPreviewList preview={preview([item('a', 'will_create')])} />);
    expect(screen.getByText('1 will be cards in one batch')).toBeInTheDocument();
  });

  it('shows each folder with its clip count and status chip', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={full} />);
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(within(row('2026-11-14_a')).getByText('142 clips')).toBeInTheDocument();
    expect(within(row('2026-11-14_a')).getByText('Will create')).toBeInTheDocument();
    expect(within(row('2026-11-07_b')).getByText('1 clip')).toBeInTheDocument();
    expect(within(row('2026-10-17_c')).getByText('Already batched')).toBeInTheDocument();
    expect(within(row('2026-11-15_d')).getByText('No videos')).toBeInTheDocument();
    expect(within(row('2026-11-16_e')).getByText('Cannot be fully read')).toBeInTheDocument();
  });

  it('ticks and fixes the folders that will be created, and gives no box to the rest', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={full} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['2026-11-14_a', '2026-11-07_b']);
    boxes.forEach((box) => {
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    });
  });

  it('says so when the list was cut, and when nothing matches', { tags: ['full'] }, () => {
    const { rerender } = render(<FolderPreviewList preview={preview([item('a', 'will_create')], { truncated: true })} />);
    expect(screen.getByText(/list was cut/)).toBeInTheDocument();
    rerender(<FolderPreviewList preview={preview([], { notMatching: 4 })} />);
    expect(screen.getByText('No folders match this pattern.')).toBeInTheDocument();
    expect(screen.getByText('4 do not match')).toBeInTheDocument();
  });

  it('explains how already batched folders are treated', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={full} />);
    expect(screen.getByText('Folders already in a batch are left out.')).toBeInTheDocument();
  });

  it('keeps long names inside the row', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={preview([item('N'.repeat(200), 'will_create')])} />);
    expect(screen.getByTitle('N'.repeat(200))).toBeInTheDocument();
  });
});

describe('FolderPreviewList when watching', () => {
  const folders = preview([item('2026-11-14_a', 'will_create', 4), item('2026-10-17_c', 'already_batched', 9), item('2026-11-15_d', 'no_videos', 0)], { notMatching: 1 });

  it('when the watch creates the existing folders, they are marked as created by the first check and old ones have no box', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={folders} watching="create" />);
    expect(screen.getByText('1 will be created · 1 already batched · 1 has no videos · 1 does not match')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '2026-10-17_c' })).toBeNull();
    expect(screen.queryByText('Folders already in a batch are left out.')).toBeNull();
  });

  it('when the existing folders are only skipped, nothing new is batched now and they are shown as already there', { tags: ['full'] }, () => {
    render(<FolderPreviewList preview={folders} watching="skip" />);
    expect(screen.getByText('1 already there, not batched now · 1 already batched · 1 has no videos · 1 does not match')).toBeInTheDocument();
    const row = screen.getByText('2026-11-14_a').closest('li') as HTMLElement;
    expect(within(row).getByText('Already there')).toBeInTheDocument();
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
