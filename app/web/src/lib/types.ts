export type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'cron';
export type Transfer = 'move' | 'copy' | 'link';
export type RunStatus = 'running' | 'done' | 'skipped' | 'failed';
export type RunTrigger = 'scheduled' | 'manual' | 'caught_up';
export type SourceType = 'local' | 'ssh';
export type GroupBy = 'none' | 'day' | 'week' | 'month';
export type RuleKind = 'name' | 'glob' | 'regex' | 'date_range' | 'weekday' | 'window';
export type DateSourceKind = 'modified' | 'created' | 'filename';
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

export interface FilterRule {
  kind: RuleKind;
  exclude: boolean;
  value: string;
  dateFrom: string;
  dateTo: string;
  days: number[];
  start: string;
  end: string;
  caseSensitive: boolean;
  dateSource: DateSourceKind;
  filenamePattern: string;
}

export interface FilterGroup {
  rules: FilterRule[];
}

export interface RandomSelection {
  enabled: boolean;
  mode: 'count' | 'percent';
  value: number;
  scope: 'overall' | 'folder';
  seed: number;
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
  filters: FilterGroup[];
  randomSelection: RandomSelection;
  dateSource: DateSourceKind;
  filenamePattern: string;
}

export interface FolderPreviewRequest {
  folderTemplate: string;
  outputFolder: string;
  groupBy: GroupBy;
  suffix: string;
  sampleDate: string;
}

export interface ClipVerdict {
  name: string;
  when: string;
  label: string;
  selected: boolean;
  reason: string;
}

export interface FilterPreviewResult {
  clips: ClipVerdict[];
  selectedCount: number;
  total: number;
  truncated: boolean;
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

export interface PlanGroup {
  folder: string;
  path: string;
  renamed: boolean;
  count: number;
  bytes: number;
  sample: string[];
}

export interface PlanResult {
  transfer: Transfer;
  totalFiles: number;
  totalBytes: number;
  folderCount: number;
  groups: PlanGroup[];
  notes: string[];
  unmatched: number;
  notSelected: number;
  leftInPlace: number;
  leftSample: string[];
}
