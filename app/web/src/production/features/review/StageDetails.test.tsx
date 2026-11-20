import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageDetailsView } from './StageDetails';

describe('StageDetailsView', () => {
  it('lists the clips in order with their length and times', { tags: ['full'] }, () => {
    render(<StageDetailsView details={{ kind: 'clips', total: 45, clips: [{ name: 'b.mov', start: 5, end: 20, length: 15 }, { name: 'a.mov', start: 0, end: 30, length: 30 }] }} />);
    const list = screen.getByRole('list', { name: 'Clips' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('b.mov');
    expect(items[0]).toHaveTextContent('0:15 · from 0:05 to 0:20');
    expect(screen.getByText('2 clips · 0:45 in total')).toBeInTheDocument();
  });

  it('says what a limit cut the batch from and to', { tags: ['full'] }, () => {
    render(<StageDetailsView details={{ kind: 'clips', total: 900, before: 1200, limit: 900, choice: 'keep_first', clips: [] }} />);
    expect(screen.getByText('20:00 before, cut to 15:00 against a 15:00 limit by keep the first clips and trim the last')).toBeInTheDocument();
  });

  it('says when a batch was already within the limit', { tags: ['full'] }, () => {
    render(<StageDetailsView details={{ kind: 'clips', total: 300, before: 300, limit: 900, clips: [] }} />);
    expect(screen.getByText('5:00 is within the 15:00 limit, so nothing is cut')).toBeInTheDocument();
  });

  it('shows the video it made: length, size, picture, frame rate and the join target', { tags: ['full'] }, () => {
    render(<StageDetailsView details={{ kind: 'video', name: 'joined.mp4', duration: 14.5, sizeBytes: 46_000_000, width: 720, height: 1280, fps: 30, target: { width: 1080, height: 1920, fps: 30 } }} />);
    expect(screen.getByText('0:14')).toBeInTheDocument();
    expect(screen.getByText('46.0 MB')).toBeInTheDocument();
    expect(screen.getByText('720 × 1280')).toBeInTheDocument();
    expect(screen.getByText('Shaped to 1080 × 1920 at 30 fps')).toBeInTheDocument();
  });
});
