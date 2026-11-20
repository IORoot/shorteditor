import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pass, StageRun } from '../../lib/types';
import { ClipLibrary } from './ClipLibrary';

const stages: StageRun[] = [
  { key: 'scan_folder', title: 'Scan folder', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 15, clips: [
    { name: 'a.mp4', start: 0, end: 10, length: 10 },
    { name: 'b.mp4', start: 0, end: 5, length: 5 },
  ] } },
  { key: 'detect_action', title: 'Detect action', status: 'done', startedAt: '2026-11-20T10:00:00Z', finishedAt: null, details: { kind: 'clips', total: 2, clips: [
    { name: 'a.mp4', start: 2, end: 4, length: 2 },
  ] } },
];

function setup(overrides: Pass['overrides'] = {}, selected: string | null = null) {
  const onSelect = vi.fn();
  render(<ClipLibrary passId={9} stages={stages} overrides={overrides} selected={selected} onSelect={onSelect} />);
  return { onSelect };
}

describe('ClipLibrary', () => {
  it('shows a picture, the tag and the length for each clip', () => {
    setup();
    const a = screen.getByRole('button', { name: /a\.mp4/ });
    expect(within(a).getByText('1 segment')).toBeInTheDocument();
    expect(within(a).getByText('0:10')).toBeInTheDocument();
    expect(a.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/api/production/passes/9/still?clip=a.mp4'));
    expect(screen.getByRole('button', { name: /b\.mp4/ })).toHaveTextContent('No action');
  });

  it('keeps only the clips a filter names', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'No action' }));
    expect(screen.queryByRole('button', { name: /a\.mp4/ })).toBeNull();
    expect(screen.getByRole('button', { name: /b\.mp4/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edited by me' }));
    expect(screen.getByText('No clips match this filter.')).toBeInTheDocument();
  });

  it('opens a clip when it is clicked, and marks the one open', () => {
    const { onSelect } = setup({}, 'a.mp4');
    expect(screen.getByRole('button', { name: /a\.mp4/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /b\.mp4/ }));
    expect(onSelect).toHaveBeenCalledWith('b.mp4');
  });

  it('marks a clip with its own trims as edited', () => {
    setup({ apply_trims: { trims: { 'b.mp4': [{ start: 0, end: 1 }] } } } as Pass['overrides']);
    expect(screen.getByRole('button', { name: /b\.mp4/ })).toHaveTextContent('Edited');
  });
});
