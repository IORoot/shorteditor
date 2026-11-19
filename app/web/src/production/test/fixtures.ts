import type { BatchCard, BatchListItem } from '../lib/types';

let next = 1;

export function makeCard(overrides: Partial<BatchCard> = {}): BatchCard {
  const id = next++;
  return {
    batchId: id,
    passId: id,
    folder: `/clips/batch-${id}`,
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

/** The batch list rows for a set of cards: one row per batch, with the status the server would derive. */
export function listRowsFor(cards: BatchCard[]): BatchListItem[] {
  const byBatch = new Map<number, BatchCard[]>();
  for (const card of cards) byBatch.set(card.batchId, [...(byBatch.get(card.batchId) ?? []), card]);
  return [...byBatch].map(([id, group]) => {
    const statuses = new Set(group.map((card) => card.status));
    const status = statuses.size === 1 && statuses.has('approved') ? 'approved'
      : statuses.has('failed') ? 'failed'
        : statuses.has('running') ? 'running'
          : statuses.has('queued') ? 'queued' : 'review';
    return {
      id, name: group[0].name, inputFolder: group[0].inputFolder, pipelineName: group[0].pipelineName, runNumber: 1, runAt: null,
      folderCount: group.length, approvedCount: group.filter((card) => card.status === 'approved').length,
      failedCount: group.filter((card) => card.status === 'failed').length, status,
    };
  });
}
