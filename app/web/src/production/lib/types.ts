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
  steps: StageStep[];
  runOn: string;
  outputRoot: string;
  createdAt: string;
  /** On: new cards start by themselves. Off: they wait as held until started. */
  autoRun: boolean;
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
}

export interface BatchUpdate {
  name?: string;
  outputRoot?: string;
  autoRun?: boolean;
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
  parentFolder: string;
  pattern: string;
  nameTemplate: string;
  pipelineId: number;
  runOn: string;
  outputRoot?: string;
  autoRun?: boolean;
}

export interface BulkResult {
  created: Batch[];
  skipped: PreviewItem[];
}

export type WatchStatus = 'watching' | 'waiting' | 'paused' | 'problem';

export interface WatchCreate {
  name: string;
  parentFolder: string;
  pattern: string;
  nameTemplate: string;
  pipelineId: number;
  runOn: string;
  outputRoot?: string;
  intervalMinutes: number;
  settleMinutes: number;
  maxPerCheck: number;
  includeExisting: boolean;
  enabled: boolean;
}

export interface WatchView {
  id: number;
  name: string;
  parentFolder: string;
  pattern: string;
  nameTemplate: string;
  pipelineId: number | null;
  pipelineName: string | null;
  steps: StageStep[];
  runOn: string;
  outputRoot: string | null;
  intervalMinutes: number;
  settleMinutes: number;
  maxPerCheck: number;
  enabled: boolean;
  createdAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  waiting: string[];
  createdTotal: number;
  status: WatchStatus;
  statusLine: string;
}

export interface CheckResult {
  created: Batch[];
  waiting: string[];
  error: string | null;
}
