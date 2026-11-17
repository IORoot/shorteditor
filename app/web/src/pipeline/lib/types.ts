export interface StageStep {
  key: string;
  settings: Record<string, unknown>;
  enabled: boolean;
}

export interface StageInfo {
  key: string;
  title: string;
  description: string;
  transitions: Record<string, string>;
  position: string;
  settingsSchema: Record<string, unknown>;
}

export interface UsageItem {
  kind: 'batch' | 'watch';
  id: number;
  name: string;
  status: string | null;
  at: string | null;
}

export interface OffImpact {
  watches: number;
  waitingBatches: number;
}

export interface PipelineSummary {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  stageCount: number;
  maxSeconds: number | null;
  maxSizeMb: number | null;
  usedBy: number;
  updatedAt: string;
}

export interface Pipeline {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  steps: StageStep[];
  createdAt: string;
  updatedAt: string;
}

export interface PipelineDetail extends Pipeline {
  usedBy: UsageItem[];
  recentBatches: UsageItem[];
}

export interface PipelineSave {
  name: string;
  description: string;
  steps: StageStep[];
}
