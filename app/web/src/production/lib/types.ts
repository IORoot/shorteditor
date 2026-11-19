export type PassStatus = 'queued' | 'running' | 'review' | 'blocked' | 'failed' | 'approved';

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
}

export type StageRunStatus = 'running' | 'done' | 'failed' | 'blocked';

/** One stage a pass has reached: when it started and, once it is over, when it ended. */
export interface StageRun {
  key: string;
  title: string;
  status: StageRunStatus;
  startedAt: string;
  finishedAt: string | null;
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
  include: string[];
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
