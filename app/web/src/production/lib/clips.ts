import { timelineSource } from './timelineSource';
import type { Range } from './trims';
import type { Pass, StageRun } from './types';

export type ClipFilter = 'all' | 'action' | 'none' | 'edited';

/** One clip of the card as the clip library and the editor show it. */
export interface ClipRow {
  name: string;
  length: number;
  /** The parts the AI kept, in clip time. */
  parts: Range[];
  /** The user's own trims for this clip, or none. */
  trims: Range[];
  /** Where the picture is taken from: the start of the first part, or the start of the clip. */
  stillAt: number;
  /** What detection found: found, none (detection ran and kept nothing), or still waiting. */
  found: 'found' | 'none' | 'waiting';
}

/** The clips of the card, in scan order, with their parts and trims. */
export function clipRows(stages: StageRun[], overrides: Pass['overrides']): ClipRow[] {
  const scan = stages.find((stage) => stage.key === 'scan_folder')?.details;
  const scanned = scan?.kind === 'clips' ? scan.clips : [];
  const detect = stages.find((stage) => stage.key === 'detect_action');
  const detected = detect?.status === 'done';
  const pieces = timelineSource(stages).pieces;
  const trimmed = (overrides.apply_trims as { trims?: Record<string, Range[]> } | undefined)?.trims ?? {};
  return scanned.map((clip) => {
    const parts = pieces.filter((piece) => piece.name === clip.name).map((piece) => ({ start: piece.start, end: piece.end }));
    return {
      name: clip.name,
      length: clip.length,
      parts,
      trims: trimmed[clip.name] ?? [],
      stillAt: parts.length > 0 ? Math.min(parts[0].start, Math.max(clip.length - 0.05, 0)) : 0,
      found: parts.length > 0 ? 'found' : detected ? 'none' : 'waiting',
    };
  });
}

/** The rows a filter keeps. */
export function filterClips(rows: ClipRow[], filter: ClipFilter): ClipRow[] {
  switch (filter) {
    case 'action':
      return rows.filter((row) => row.found === 'found');
    case 'none':
      return rows.filter((row) => row.found === 'none');
    case 'edited':
      return rows.filter((row) => row.trims.length > 0);
    default:
      return rows;
  }
}
