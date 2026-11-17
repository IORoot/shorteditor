import type { PipelineDetail, PipelineSummary, StageInfo, StageStep } from './lib/types';

export const summary = (over: Partial<PipelineSummary> = {}): PipelineSummary => ({
  id: 1, name: 'Join clips', description: 'Join a folder', enabled: true, stageCount: 5, maxSeconds: 900, maxSizeMb: 150, usedBy: 0, updatedAt: '2026-11-17T10:00:00+00:00', ...over,
});

export const library: StageInfo[] = [
  { key: 'scan_folder', title: 'Scan folder', transitions: { none: 'pieces' }, position: 'first', settingsSchema: { properties: { maxFiles: { default: 5000, minimum: 1, type: 'integer' } } } },
  { key: 'limit_length', title: 'Limit length', transitions: { pieces: 'pieces' }, position: 'any', settingsSchema: { properties: {
    maxSeconds: { default: 900, minimum: 1, type: 'number' },
    choice: { anyOf: [{ enum: ['drop_shortest', 'keep_first'], type: 'string' }, { type: 'null' }], default: null },
  } } },
  { key: 'render_output', title: 'Render', transitions: { video: 'video' }, position: 'last', settingsSchema: { properties: { maxSizeMb: { anyOf: [{ type: 'number' }, { type: 'null' }], default: 150 } } } },
];

export const steps = (): StageStep[] => [
  { key: 'scan_folder', settings: { maxFiles: 5000 }, enabled: true },
  { key: 'limit_length', settings: { maxSeconds: 900 }, enabled: true },
  { key: 'render_output', settings: { maxSizeMb: 150 }, enabled: true },
];

export const detail = (over: Partial<PipelineDetail> = {}): PipelineDetail => ({
  id: 1, name: 'Join clips', description: 'Join a folder', enabled: true, steps: steps(), createdAt: 't', updatedAt: 't', usedBy: [], recentBatches: [], ...over,
});
