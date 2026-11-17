import type { BatchCard } from '../lib/types';

let next = 1;

export function makeCard(overrides: Partial<BatchCard> = {}): BatchCard {
  const id = next++;
  return {
    batchId: id,
    passId: id,
    name: `Batch ${id}`,
    inputFolder: `/clips/batch-${id}`,
    pipelineId: 1,
    pipelineName: 'Join clips',
    pipeline: ['Scan folder', 'Order clips', 'Limit length', 'Join in order', 'Render'],
    status: 'queued',
    stageTitle: '',
    stagePosition: 0,
    stageCount: 5,
    passNumber: 1,
    queuePosition: 0,
    runOn: 'any',
    startedAt: null,
    blockedReason: null,
    blockedChoices: [],
    blockedItems: [],
    error: null,
    output: null,
    ...overrides,
  };
}
