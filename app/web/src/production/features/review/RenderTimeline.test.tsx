import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StageRun } from '../../lib/types';
import { RenderTimeline } from './RenderTimeline';

const stage = (key: string, clips: { name: string; start: number; end: number; length: number }[]): StageRun => ({
  key,
  title: key,
  status: 'done',
  startedAt: '2026-11-20T10:00:00Z',
  finishedAt: '2026-11-20T10:01:00Z',
  details: { kind: 'clips', clips, total: clips.reduce((sum, c) => sum + c.length, 0) },
});

// three videos, two action clips in each
const stages: StageRun[] = [
  stage('scan_folder', [
    { name: 'class_01.mp4', start: 0, end: 300, length: 300 },
    { name: 'class_02.mp4', start: 0, end: 200, length: 200 },
    { name: 'class_03.mp4', start: 0, end: 280, length: 280 },
  ]),
  stage('detect_action', [
    { name: 'class_01.mp4', start: 30, end: 90, length: 60 },
    { name: 'class_01.mp4', start: 180, end: 240, length: 60 },
    { name: 'class_02.mp4', start: 20, end: 60, length: 40 },
    { name: 'class_02.mp4', start: 110, end: 150, length: 40 },
    { name: 'class_03.mp4', start: 60, end: 120, length: 60 },
    { name: 'class_03.mp4', start: 200, end: 230, length: 30 },
  ]),
];

describe('RenderTimeline', () => {
  it('shows every video in order with its name, and its start and end times', () => {
    render(<RenderTimeline passId={9} stages={stages} />);
    const region = screen.getByRole('region', { name: 'Render timeline' });
    expect(within(region).getByText('class_01.mp4')).toBeInTheDocument();
    expect(within(region).getByText('class_02.mp4')).toBeInTheDocument();
    expect(within(region).getByText('class_03.mp4')).toBeInTheDocument();
    expect(within(region).getAllByText('00:00')).toHaveLength(3);
    expect(within(region).getByText('05:00')).toBeInTheDocument();
    expect(within(region).getByText('04:40')).toBeInTheDocument();
  });

  it('highlights each action clip inside its video, so three videos with two clips each show six boxes', () => {
    render(<RenderTimeline passId={9} stages={stages} />);
    const boxes = screen.getAllByRole('img', { name: /^Action clip/ });
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAttribute('aria-label', 'Action clip 00:30–01:30');
  });

  it('sizes each blue box to its part of its own video: 60 s of a 300 s video is 20% wide, starting at 10%', () => {
    render(<RenderTimeline passId={9} stages={stages} />);
    const first = screen.getAllByRole('img', { name: /^Action clip/ })[0];
    expect(first.style.width).toBe('20%');
    expect(first.style.left).toBe('10%');
  });

  it('a first half of a video is half of its box, not a sliver of the strip', () => {
    const tenSecs = [stage('scan_folder', [{ name: 'a.mp4', start: 0, end: 10, length: 10 }, { name: 'b.mp4', start: 0, end: 10, length: 10 }]),
      stage('detect_action', [{ name: 'a.mp4', start: 0, end: 5, length: 5 }])];
    render(<RenderTimeline passId={9} stages={tenSecs} />);
    expect(screen.getByRole('img', { name: /^Action clip/ }).style.width).toBe('50%');
  });

  it('gives the totals of the source and of what the render keeps', () => {
    render(<RenderTimeline passId={9} stages={stages} />);
    // 300 + 200 + 280 = 780 s of source; the six kept clips are 60 + 60 + 40 + 40 + 60 + 30 = 290 s
    expect(screen.getByText('3 videos · 13:00 of source → 04:50 rendered')).toBeInTheDocument();
  });

  it('shows a video with no action clips as a block with no boxes', () => {
    const onlyFirst = stage('detect_action', [{ name: 'class_01.mp4', start: 30, end: 90, length: 60 }]);
    render(<RenderTimeline passId={9} stages={[stages[0], onlyFirst]} />);
    expect(screen.getAllByRole('img', { name: /^Action clip/ })).toHaveLength(1);
    expect(screen.getByText('class_03.mp4')).toBeInTheDocument();
  });

  it('shows nothing before the scan has listed any videos', () => {
    render(<RenderTimeline passId={9} stages={[]} />);
    expect(screen.queryByRole('region', { name: 'Render timeline' })).toBeNull();
  });

  it('shows the picture of the first frame of each blue box, taken from this pass', () => {
    const { container } = render(<RenderTimeline passId={9} stages={stages} />);
    const box = screen.getAllByRole('img', { name: /^Action clip/ })[0];
    expect(box.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/api/production/passes/9/still?clip='));
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('selects the clip under a video when its bar is clicked, and outlines the selected one', () => {
    const onSelect = vi.fn();
    render(<RenderTimeline passId={9} stages={stages} selected="class_02.mp4" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select clip class_03.mp4' }));
    expect(onSelect).toHaveBeenCalledWith('class_03.mp4');
    expect(screen.getByRole('button', { name: 'Select clip class_02.mp4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select clip class_01.mp4' })).toHaveAttribute('aria-pressed', 'false');
  });
});
