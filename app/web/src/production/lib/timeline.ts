/** The smallest width a piece is drawn at, so a short piece stays visible. */
export const MIN_BOX_PX = 4;

export interface TimelineVideo {
  name: string;
  /** Full length in seconds, as the source has it. */
  length: number;
}

export interface TimelinePiece {
  /** The source video's file name, the same as its `name`. */
  name: string;
  /** Seconds from the start of the source video. */
  start: number;
  end: number;
}

export interface TimelineBlock {
  start: number;
  end: number;
  leftPx: number;
  widthPx: number;
  /** "00:30–01:30", for the hover label. */
  label: string;
}

export interface TimelineVideoLayout {
  name: string;
  widthPx: number;
  startLabel: string;
  endLabel: string;
  blocks: TimelineBlock[];
}

export interface TimelineLayout {
  videos: TimelineVideoLayout[];
  /** Names of pieces that match no video, so they can be reported rather than silently dropped. */
  unmatched: string[];
}

/** mm:ss, or h:mm:ss from an hour on. */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Lays the source videos out back to back, each as wide as its length in the available width,
 * and places each piece at its real start and end inside its video.
 * Pieces are clamped to their video, pieces with no length are dropped, and a piece narrower than
 * MIN_BOX_PX is drawn at MIN_BOX_PX and kept inside its video.
 */
export function timelineLayout(videos: TimelineVideo[], pieces: TimelinePiece[], widthPx: number, gapPx: number, minBoxPx: number = MIN_BOX_PX): TimelineLayout {
  if (videos.length === 0) return { videos: [], unmatched: [] };
  const total = videos.reduce((sum, v) => sum + v.length, 0);
  const available = Math.max(0, widthPx - gapPx * (videos.length - 1));
  const byName = new Map<string, TimelineVideo>(videos.map((v) => [v.name, v]));
  const unmatched = [...new Set(pieces.filter((p) => !byName.has(p.name)).map((p) => p.name))];

  const layout: TimelineVideoLayout[] = videos.map((video) => {
    const videoWidth = total > 0 ? (available * video.length) / total : 0;
    const scale = video.length > 0 ? videoWidth / video.length : 0;
    const blocks = pieces
      .filter((p) => p.name === video.name)
      .map((p) => ({ start: Math.max(0, Math.min(p.start, video.length)), end: Math.max(0, Math.min(p.end, video.length)) }))
      .filter((p) => p.end > p.start)
      .sort((a, b) => a.start - b.start)
      .map((p) => {
        const natural = (p.end - p.start) * scale;
        const width = Math.max(minBoxPx, natural);
        const left = Math.min(p.start * scale, Math.max(0, videoWidth - width));
        return { start: p.start, end: p.end, leftPx: left, widthPx: width, label: `${clockLabel(p.start)}–${clockLabel(p.end)}` };
      });
    return { name: video.name, widthPx: videoWidth, startLabel: clockLabel(0), endLabel: clockLabel(video.length), blocks };
  });
  return { videos: layout, unmatched };
}
