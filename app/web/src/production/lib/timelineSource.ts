import type { ClipDetail, StageRun } from './types';
import type { TimelinePiece, TimelineVideo } from './timeline';

/** The stages that list the whole videos, in the order they ran. */
const VIDEO_STAGES = ['order_clips', 'scan_folder'];
/** The stages that list the kept pieces; the last one to run is what the render uses. */
const PIECE_STAGES = ['detect_action', 'limit_length'];

function clipsOf(stage: StageRun | undefined): ClipDetail[] | null {
  return stage?.details?.kind === 'clips' ? stage.details.clips : null;
}

/**
 * Reads the timeline's inputs from a pass's stages: each source video with its full length, in the order
 * the render uses (the order-clips stage when it ran before detection, else the scan), and the kept pieces.
 */
export function timelineSource(stages: StageRun[]): { videos: TimelineVideo[]; pieces: TimelinePiece[] } {
  const detectAt = stages.findIndex((s) => s.key === 'detect_action');
  // the order-clips stage lists whole videos only when it ran before detection
  const orderStage = stages.find((s) => s.key === 'order_clips');
  const orderIsWhole = orderStage !== undefined && (detectAt === -1 || stages.indexOf(orderStage) < detectAt);
  const videoStage = VIDEO_STAGES.map((key) => (key === 'order_clips' && !orderIsWhole ? undefined : stages.find((s) => s.key === key))).find((s) => s !== undefined);
  const videoClips = clipsOf(videoStage) ?? [];
  const videos: TimelineVideo[] = videoClips.map((c) => ({ name: c.name, length: c.length }));

  const pieceStage = [...stages].reverse().find((s) => PIECE_STAGES.includes(s.key) && s.details?.kind === 'clips');
  const pieceClips = clipsOf(pieceStage) ?? [];
  const pieces: TimelinePiece[] = pieceClips.map((c) => ({ name: c.name, start: c.start, end: c.end }));
  return { videos, pieces };
}
