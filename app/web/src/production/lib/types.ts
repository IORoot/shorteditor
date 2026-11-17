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
  steps: StageStep[];
  runOn: string;
  outputRoot?: string;
}

export interface ValidateResult {
  errors: string[];
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

export interface Pass {
  id: number;
  batchId: number;
  number: number;
  status: PassStatus;
  stageIndex: number;
  stageKey: string;
  blockedReason: string | null;
  blockedChoices: string[];
  error: string | null;
  output: VideoData | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
