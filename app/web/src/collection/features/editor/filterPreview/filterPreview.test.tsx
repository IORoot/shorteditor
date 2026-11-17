import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import type { ClipVerdict, FilterPreviewResult } from '../../../lib/types';
import { useFilterPreview } from '../../../hooks/useFilterPreview';
import { makeConfig } from '../../../test/fixtures';
import { FileList } from './FileList';
import { FileRow } from './FileRow';
import { extensionOf, iconForFile } from './fileIcon';
import { FilterPreviewCard } from './FilterPreviewCard';
import { ListLegend } from './ListLegend';

afterEach(() => vi.restoreAllMocks());

const clip = (name: string, selected: boolean, reason = selected ? 'Collected' : "Doesn't match the filters"): ClipVerdict => ({
  name, selected, reason, when: '2026-11-14T09:12:00', label: 'Sat 14 Nov · 09:12',
});

const result = (clips: ClipVerdict[], extra: Partial<FilterPreviewResult> = {}): FilterPreviewResult => ({
  clips, total: clips.length, selectedCount: clips.filter((c) => c.selected).length, truncated: false, ...extra,
});

describe('fileIcon', () => {
  it('reads extensions case-insensitively', () => {
    expect(extensionOf('IMG 2210.JPG')).toBe('jpg');
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('.hidden')).toBe('');
  });

  it('maps types to icons and falls back to a generic file', () => {
    expect(iconForFile('a.mp4')).toBe(iconForFile('b.MOV'));
    expect(iconForFile('a.md')).not.toBe(iconForFile('a.mp4'));
    expect(iconForFile('mystery.xyz')).toBe(iconForFile('other'));
  });
});

describe('FileRow', () => {
  it('shows name, date and a collected state', () => {
    render(<ul><FileRow clip={clip('my raw clip.mov', true)} /></ul>);
    const row = screen.getByRole('listitem');
    expect(row).toHaveAttribute('data-state', 'selected');
    expect(row).toHaveTextContent('my raw clip.mov');
    expect(row).toHaveTextContent('Sat 14 Nov · 09:12');
  });

  it('shades filtered clips and explains why', () => {
    render(<ul><FileRow clip={clip('notes.md', false, 'Not a video file')} /></ul>);
    const row = screen.getByRole('listitem');
    expect(row).toHaveAttribute('data-state', 'filtered');
    expect(row).toHaveAttribute('title', 'notes.md · Not a video file');
    expect(row).toHaveTextContent('Filtered out: Not a video file');
  });
});

describe('FileList and legend', () => {
  it('renders one row per clip in the given order', () => {
    render(<FileList clips={[clip('a.mp4', true), clip('b.md', false)]} busy />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('a.mp4');
    expect(screen.getByRole('list', { name: 'Input folder files' })).toHaveAttribute('aria-busy', 'true');
  });

  it('labels both states', () => {
    render(<ListLegend />);
    expect(screen.getByText('Collected')).toBeInTheDocument();
    expect(screen.getByText('Filtered out')).toBeInTheDocument();
  });
});

describe('FilterPreviewCard', () => {
  const ready = result([clip('a.mp4', true), clip('b.md', false)]);

  it('shows the count, subtitle and list', () => {
    render(<FilterPreviewCard preview={{ result: ready, error: null, pending: false, reload: vi.fn() }} />);
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1 of 2');
    expect(screen.getByText('All 2 files in the input folder. Shaded files are filtered out.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('collapses and expands from the title', () => {
    render(<FilterPreviewCard preview={{ result: ready, error: null, pending: false, reload: vi.fn() }} />);
    const toggle = screen.getByRole('button', { name: 'Filter preview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('list', { name: 'Input folder files', hidden: true }).parentElement).toHaveClass('hidden');
    expect(screen.getByTestId('selected-count')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Input folder files' })).toBeVisible();
  });

  it('reloads the folder when refresh is pressed', () => {
    const reload = vi.fn();
    render(<FilterPreviewCard preview={{ result: ready, error: null, pending: false, reload }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh file list' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('spins and disables refresh while a scan is running', () => {
    render(<FilterPreviewCard preview={{ result: ready, error: null, pending: true, reload: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'Refresh file list' })).toBeDisabled();
  });

  it('says when the list is capped', () => {
    render(<FilterPreviewCard preview={{ result: result([clip('a.mp4', true)], { total: 900, truncated: true }), error: null, pending: false, reload: vi.fn() }} />);
    expect(screen.getByText('Showing the newest 1 of 900 files. Counts cover all of them.')).toBeInTheDocument();
  });

  it('says when the folder is empty', () => {
    render(<FilterPreviewCard preview={{ result: result([]), error: null, pending: false, reload: vi.fn() }} />);
    expect(screen.getByText('No files in the input folder.')).toBeInTheDocument();
  });

  it('can start collapsed', () => {
    render(<FilterPreviewCard preview={{ result: ready, error: null, pending: false, reload: vi.fn() }} defaultOpen={false} />);
    expect(screen.getByRole('button', { name: 'Filter preview' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows an error but keeps the last list', () => {
    render(<FilterPreviewCard preview={{ result: ready, error: 'Invalid regex', pending: false, reload: vi.fn() }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid regex');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows a loading note before the first result', () => {
    render(<FilterPreviewCard preview={{ result: null, error: null, pending: true, reload: vi.fn() }} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByTestId('selected-count')).not.toBeInTheDocument();
  });
});

describe('useFilterPreview', () => {
  it('sends the editor config to the API', async () => {
    const spy = vi.spyOn(api, 'previewFilters').mockResolvedValue(result([clip('a.mp4', true)]));
    const config = makeConfig({ filters: [{ rules: [{ kind: 'name', exclude: false, value: 'a', dateFrom: '', dateTo: '', days: [], start: '', end: '', caseSensitive: false, dateSource: 'modified', filenamePattern: '', random: { enabled: false, mode: 'percent', value: 10, scope: 'overall', seed: 1 } }] }] });
    const { result: hook } = renderHook(() => useFilterPreview(config, 0));
    await waitFor(() => expect(hook.current.result?.selectedCount).toBe(1));
    expect(spy).toHaveBeenCalledWith(config);
  });

  it('keeps the last result when a later request fails', async () => {
    const spy = vi.spyOn(api, 'previewFilters').mockResolvedValueOnce(result([clip('a.mp4', true)]));
    const { result: hook, rerender } = renderHook(({ c }) => useFilterPreview(c, 0), { initialProps: { c: makeConfig() } });
    await waitFor(() => expect(hook.current.result).not.toBeNull());
    spy.mockRejectedValue(new Error('Invalid regex'));
    rerender({ c: makeConfig({ filters: [{ rules: [] }] }) });
    await waitFor(() => expect(hook.current.error).toBe('Invalid regex'));
    expect(hook.current.result?.clips).toHaveLength(1);
  });
});

  it("doesn't rescan when only the collector name changes", async () => {
    const spy = vi.spyOn(api, 'previewFilters').mockResolvedValue(result([clip('a.mp4', true)]));
    const { result: hook, rerender } = renderHook(({ c }) => useFilterPreview(c, 0), { initialProps: { c: makeConfig() } });
    await waitFor(() => expect(hook.current.result).not.toBeNull());
    rerender({ c: makeConfig({ name: 'Renamed' }) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rescans when the input folder changes', async () => {
    const spy = vi.spyOn(api, 'previewFilters').mockResolvedValue(result([clip('a.mp4', true)]));
    const { result: hook, rerender } = renderHook(({ c }) => useFilterPreview(c, 0), { initialProps: { c: makeConfig() } });
    await waitFor(() => expect(hook.current.result).not.toBeNull());
    rerender({ c: makeConfig({ inputFolder: '/Volumes/Other' }) });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
