import { stillUrl } from '../../lib/api';
import type { StageRun } from '../../lib/types';
import { clockLabel, timelineLayout } from '../../lib/timeline';
import { timelineSource } from '../../lib/timelineSource';

export interface RenderTimelineProps {
  /** The pass whose clips these are: its pictures are taken from it. */
  passId: number;
  /** The pass's stages, as the batch detail returns them. */
  stages: StageRun[];
  /** The clip open in the editor, by name: its video is outlined. */
  selected?: string | null;
  /** Called with a video's name when its bar is clicked: that clip is selected in the clip list. */
  onSelect?: (name: string) => void;
}

/** Scale used for the layout. Positions come out as tenths of a percent, so the strip fills whatever width it has. */
const SCALE = 10000;

/** A position or width as a percentage of its video's box, which is the box the blue boxes sit in. */
const percentOf = (px: number, videoPx: number): number => (videoPx > 0 ? (px / videoPx) * 100 : 0);

/**
 * Every source video of the card back to back at its true length, with its name and start and end times,
 * and a blue box over each action clip the render keeps. Shown only once the scan has listed the videos.
 */
export function RenderTimeline({ passId, stages, selected = null, onSelect }: RenderTimelineProps) {
  const source = timelineSource(stages);
  if (source.videos.length === 0) return null;
  // no gaps between videos: each one is separated by a border, so the widths add up to the whole strip
  const layout = timelineLayout(source.videos, source.pieces, SCALE, 0, 0);
  const sourceTotal = source.videos.reduce((sum, v) => sum + v.length, 0);
  const renderedTotal = layout.videos.reduce((sum, v) => sum + v.blocks.reduce((s, b) => s + (b.end - b.start), 0), 0);
  const count = source.videos.length;

  return (
    <section aria-label="Render timeline" className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body font-semibold">Final render timeline</h2>
        <p className="text-small text-text-2">{`${count} video${count === 1 ? '' : 's'}  ·  ${clockLabel(sourceTotal)} of source  →  ${clockLabel(renderedTotal)} rendered`}</p>
      </div>
      <div className="flex min-w-0 items-start">
        {layout.videos.map((video, index) => (
          <div
            key={`${index}-${video.name}`}
            style={{ width: `${video.widthPx / 100}%` }}
            className={`flex min-w-0 flex-col gap-1.5 ${index > 0 ? 'border-l-2 border-surface' : ''}`}
          >
            <span title={video.name} className="truncate px-1 text-caption font-semibold text-text">{video.name}</span>
            <button
              type="button"
              aria-label={`Select clip ${video.name}`}
              aria-pressed={selected === video.name}
              disabled={!onSelect}
              onClick={() => onSelect?.(video.name)}
              className={`relative block h-16 w-full overflow-hidden rounded-lg bg-fill-2 text-left disabled:cursor-default ${selected === video.name ? 'ring-2 ring-accent' : ''}`}
            >
              {video.blocks.map((block) => (
                <div
                  key={`${block.start}-${block.end}`}
                  role="img"
                  aria-label={`Action clip ${block.label}`}
                  title={block.label}
                  style={{ left: `${percentOf(block.leftPx, video.widthPx)}%`, width: `${percentOf(block.widthPx, video.widthPx)}%`, minWidth: 4 }}
                  className="absolute bottom-0 top-0 overflow-hidden rounded-md border-2 border-accent bg-accent-soft"
                >
                  <img src={stillUrl(passId, video.name, block.start)} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              ))}
            </button>
            <div className="flex justify-between px-0.5 text-caption text-text-3">
              <span>{video.startLabel}</span>
              <span>{video.endLabel}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-caption text-text-2">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3.5 rounded border-2 border-accent bg-accent-soft" />
          Action clip in render
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3.5 rounded bg-fill-2" />
          Not used
        </span>
        {layout.unmatched.length > 0 ? <span className="text-warn">{`${layout.unmatched.length} clip${layout.unmatched.length === 1 ? '' : 's'} match no video and are not shown`}</span> : null}
      </div>
    </section>
  );
}
