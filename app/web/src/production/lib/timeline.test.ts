import { describe, expect, it } from 'vitest';
import { timelineLayout } from './timeline';

const videos = [
  { name: 'class_01.mp4', length: 300 },
  { name: 'class_02.mp4', length: 200 },
  { name: 'class_03.mp4', length: 280 },
];

describe('timelineLayout', () => {
  it('lays the videos back to back, each as wide as its length, with the gaps between them', () => {
    const layout = timelineLayout(videos, [], 1368, 2);
    expect(layout.videos.map((v) => v.name)).toEqual(['class_01.mp4', 'class_02.mp4', 'class_03.mp4']);
    const widths = layout.videos.map((v) => v.widthPx);
    expect(widths[0] / widths[1]).toBeCloseTo(300 / 200);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1368 - 2 * 2);
  });

  it('places a piece at its real start inside its video, by seconds', () => {
    const layout = timelineLayout(videos, [{ name: 'class_01.mp4', start: 30, end: 90 }], 1368, 2);
    const [block] = layout.videos[0].blocks;
    const scale = layout.videos[0].widthPx / 300;
    expect(block.leftPx).toBeCloseTo(30 * scale);
    expect(block.widthPx).toBeCloseTo(60 * scale);
  });

  it('never draws a piece narrower than the minimum, so it stays visible', () => {
    const layout = timelineLayout(videos, [{ name: 'class_02.mp4', start: 10, end: 10.5 }], 1368, 2);
    expect(layout.videos[1].blocks[0].widthPx).toBe(4);
  });

  it('keeps a piece inside its video even when the minimum width would cross the end', () => {
    const layout = timelineLayout(videos, [{ name: 'class_02.mp4', start: 199.9, end: 200 }], 1368, 2);
    const video = layout.videos[1];
    const [block] = video.blocks;
    expect(block.leftPx + block.widthPx).toBeLessThanOrEqual(video.widthPx);
  });

  it('gives a video with no pieces an empty list of blocks, so it still shows as grey', () => {
    const layout = timelineLayout(videos, [{ name: 'class_01.mp4', start: 0, end: 10 }], 1368, 2);
    expect(layout.videos[2].blocks).toEqual([]);
    expect(layout.videos[2].name).toBe('class_03.mp4');
  });

  it('clamps a piece that runs past its video to the video, and drops one with no length', () => {
    const layout = timelineLayout(videos, [
      { name: 'class_01.mp4', start: 290, end: 400 },
      { name: 'class_01.mp4', start: 50, end: 50 },
    ], 1368, 2);
    expect(layout.videos[0].blocks).toHaveLength(1);
    const [block] = layout.videos[0].blocks;
    expect(block.leftPx + block.widthPx).toBeLessThanOrEqual(layout.videos[0].widthPx + 1e-9);
  });

  it('keeps the pieces of each video in start order', () => {
    const layout = timelineLayout(videos, [
      { name: 'class_01.mp4', start: 180, end: 240 },
      { name: 'class_01.mp4', start: 30, end: 90 },
    ], 1368, 2);
    expect(layout.videos[0].blocks.map((b) => b.start)).toEqual([30, 180]);
  });

  it('labels each video from 00:00 to its length, and names pieces that match no video', () => {
    const layout = timelineLayout(videos, [{ name: 'gone.mp4', start: 0, end: 5 }], 1368, 2);
    expect(layout.videos[0].startLabel).toBe('00:00');
    expect(layout.videos[0].endLabel).toBe('05:00');
    expect(layout.unmatched).toEqual(['gone.mp4']);
  });

  it('shows a block label with its start and end times', () => {
    const layout = timelineLayout(videos, [{ name: 'class_01.mp4', start: 30, end: 90 }], 1368, 2);
    expect(layout.videos[0].blocks[0].label).toBe('00:30–01:30');
  });

  it('returns nothing for a card with no videos', () => {
    expect(timelineLayout([], [], 1368, 2)).toEqual({ videos: [], unmatched: [] });
  });
});
