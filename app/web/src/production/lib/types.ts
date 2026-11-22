export type PassStatus = 'queued' | 'held' | 'paused' | 'running' | 'review' | 'blocked' | 'failed' | 'stopped' | 'approved';

/** What can be done to a batch or a card. */
export type ActionName = 'pause' | 'resume' | 'stop' | 'rerun' | 'delete';

export interface ActionResult {
  id: number;
  ok: boolean;
  message: string;
}

export interface ActionResults {
  results: ActionResult[];
}

export interface StageStep {
  key: string;
  settings: Record<string, unknown>;
  enabled: boolean;
}

export interface VideoData {
  path: string;
  duration: number;
  sizeBytes: number;
}

/** One batch on the board: the state of its newest pass. */
export interface BatchCard {
  batchId: number;
  passId: number;
  /** The card's folder, absolute: one folder of work in the batch. */
  folder: string;
  name: string;
  inputFolder: string;
  pipelineId: number | null;
  pipelineName: string | null;
  pipeline: string[];
  status: PassStatus;
  stageTitle: string;
  stagePosition: number;
  stageCount: number;
  passNumber: number;
  queuePosition: number | null;
  runOn: string;
  startedAt: string | null;
  blockedReason: string | null;
  blockedChoices: string[];
  blockedItems: string[];
  error: string | null;
  output: VideoData | null;
}

export interface WorkerInfo {
  id: string;
  label: string;
}

export interface Defaults {
  outputRoot: string;
  workers: WorkerInfo[];
}

export interface BatchCreate {
  name: string;
  inputFolder: string;
  pipelineId: number;
  runOn: string;
  outputRoot?: string;
  folderTemplate?: string;
  autoRun?: boolean;
}

export interface PipelineChoice {
  id: number;
  name: string;
  stageCount: number;
}

export interface Batch {
  id: number;
  name: string;
  inputFolder: string;
  /** The pipeline the batch runs. Null only for a batch made before pipelines. */
  pipelineId: number | null;
  steps: StageStep[];
  runOn: string;
  outputRoot: string;
  /** The batch's folder under the output folder, with {{name}}, {{id}} and {{date}} tags. */
  folderTemplate: string;
  createdAt: string;
  /** On: new cards start by themselves. Off: they wait as held until started. */
  autoRun: boolean;
  /** Set for a batch made from subfolders: the pattern the subfolders match. Only such a batch can watch. */
  folderPattern?: string | null;
  /** On: the batch keeps checking its input folder, and a new matching folder becomes a new card. */
  watching?: boolean;
  watchIntervalMinutes?: number;
  watchSettleMinutes?: number;
  watchMaxPerCheck?: number;
  watchLastCheckedAt?: string | null;
  watchLastError?: string | null;
  watchWaiting?: string[];
}

/** One row of the batch list: a batch with the status of its newest run. */
export interface BatchListItem {
  id: number;
  name: string;
  inputFolder: string;
  pipelineName: string | null;
  runNumber: number | null;
  runAt: string | null;
  folderCount: number;
  approvedCount: number;
  failedCount: number;
  status: 'empty' | 'queued' | 'held' | 'paused' | 'running' | 'review' | 'failed' | 'stopped' | 'approved';
  /** On: the batch watches its folder. `watchLine` says how that is going. */
  watching?: boolean;
  watchLine?: string | null;
}

export interface BatchUpdate {
  name?: string;
  outputRoot?: string;
  folderTemplate?: string;
  autoRun?: boolean;
  /** Takes effect on the next run, and not while a card is waiting or running. */
  pipelineId?: number;
  runOn?: string;
  watching?: boolean;
  watchIntervalMinutes?: number;
  watchSettleMinutes?: number;
  watchMaxPerCheck?: number;
}

export type StageRunStatus = 'running' | 'done' | 'failed' | 'blocked';

/** One stage a pass has reached: when it started and, once it is over, when it ended. */
export interface ClipDetail {
  name: string;
  start: number;
  end: number;
  length: number;
}

/** What a stage made: a list of clips, or the video it wrote. */
export type StageDetails =
  | { kind: 'clips'; clips: ClipDetail[]; total: number; before?: number | null; limit?: number; choice?: string | null }
  | { kind: 'video'; name: string; duration: number; sizeBytes: number; width: number | null; height: number | null; fps: number | null; target?: { width: number; height: number; fps: number } };

export interface StageRun {
  key: string;
  title: string;
  status: StageRunStatus;
  startedAt: string;
  finishedAt: string | null;
  details?: StageDetails | null;
}

export interface LogEntry {
  at: string;
  text: string;
}

export interface LogLines {
  lines: string[];
  entries: LogEntry[];
}

export interface Pass {
  id: number;
  batchId: number;
  number: number;
  status: PassStatus;
  stageIndex: number;
  stageKey: string;
  blockedReason: string | null;
  blockedChoices: string[];
  blockedItems: string[];
  error: string | null;
  output: VideoData | null;
  /** Per-stage settings the user set: the trims of each clip sit under apply_trims. */
  overrides: Record<string, Record<string, unknown>>;
  stages: StageRun[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type PreviewStatus = 'will_create' | 'already_batched' | 'no_videos' | 'unreadable';

export interface PreviewItem {
  name: string;
  path: string;
  clipCount: number;
  status: PreviewStatus;
}

export interface FolderPreview {
  matches: PreviewItem[];
  notMatching: number;
  truncated: boolean;
}

export interface BulkCreate {
  /** Keep checking the parent folder: a new matching folder becomes a new card of this batch. */
  watching?: boolean;
  /** When watching: the folders already there become cards (else they are skipped for good). */
  watchExisting?: boolean;
  watchIntervalMinutes?: number;
  watchSettleMinutes?: number;
  watchMaxPerCheck?: number;
  parentFolder: string;
  pattern: string;
  /** The batch's name. Left out, the server uses the parent folder's name. */
  name?: string;
  /** On: the parent folder is the one card. The pattern is not used. */
  ignoreSubfolders?: boolean;
  nameTemplate: string;
  pipelineId: number;
  runOn: string;
  outputRoot?: string;
  folderTemplate?: string;
  autoRun?: boolean;
}

export interface BulkResult {
  created: Batch[];
  skipped: PreviewItem[];
}
