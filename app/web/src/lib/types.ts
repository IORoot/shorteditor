export type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'cron';
export type Transfer = 'move' | 'copy' | 'link';
export type RunStatus = 'done' | 'skipped' | 'failed';
export type RunTrigger = 'scheduled' | 'manual' | 'caught_up';
export type SourceType = 'local' | 'mount' | 'ssh';
export type GroupBy = 'none' | 'day' | 'week' | 'month' | 'window';
export type Tone = 'ok' | 'warn' | 'bad' | 'info';

export interface ScheduleDraft {
  enabled: boolean;
  kind: ScheduleKind;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  cron: string;
}

export interface Schedule extends ScheduleDraft {
  summary: string;
  nextRun: string | null;
}

export interface StatusNote {
  tone: 'warn' | 'bad';
  text: string;
}

export interface CollectorConfig {
  name: string;
  sourceType: SourceType;
  host: string;
  user: string;
  keyPath: string;
  inputFolder: string;
  outputFolder: string;
  folderTemplate: string;
  groupBy: GroupBy;
  transfer: Transfer;
  suffix: string;
}

export interface FolderPreviewRequest {
  folderTemplate: string;
  outputFolder: string;
  groupBy: GroupBy;
  suffix: string;
  sampleDate: string;
}

export interface FolderPreview {
  relativePath: string;
  fullPath: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface Collector {
  id: number;
  name: string;
  source: string;
  transfer: Transfer;
  config: CollectorConfig;
  schedule: Schedule;
  statusNote: StatusNote | null;
}

export interface Run {
  id: number;
  collectorId: number;
  startedAt: string;
  trigger: RunTrigger;
  status: RunStatus;
  outcome: string;
  canUndo: boolean;
}
