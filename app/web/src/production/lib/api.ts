import { HttpClient } from '../../shared/lib/http';
import type { StageHandoff } from '../../shared/contracts/handoff';
import type { ActionName, ActionResults, Batch, BatchCard, BatchCreate, BatchListItem, BatchUpdate, BulkCreate, BulkResult, Defaults, FolderPreview, LogLines, Pass, PipelineChoice } from './types';

const BASE = '/api/production';

export class ProductionApi extends HttpClient {
  cards(): Promise<BatchCard[]> {
    return this.request<BatchCard[]>(`${BASE}/batches`);
  }

  /** Every batch with the status of its newest run, for the batch list. */
  batchList(): Promise<BatchListItem[]> {
    return this.request<BatchListItem[]>(`${BASE}/batch-list`);
  }

  /** Renames a batch or changes its output folder. */
  updateBatch(batchId: number, body: BatchUpdate): Promise<Batch> {
    return this.send<Batch>(`${BASE}/batches/${batchId}`, 'PATCH', body);
  }

  defaults(): Promise<Defaults> {
    return this.request<Defaults>(`${BASE}/defaults`);
  }

  createBatch(body: BatchCreate): Promise<Batch> {
    return this.send<Batch>(`${BASE}/batches`, 'POST', body);
  }

  approve(passId: number): Promise<StageHandoff> {
    return this.send<StageHandoff>(`${BASE}/passes/${passId}/approve`, 'POST', {});
  }

  /** Answers a blocked pass. picks are the clips kept, when the stop was Review by hand. */
  resolve(passId: number, choice: string, picks?: number[], caption?: string): Promise<Pass> {
    return this.send<Pass>(`${BASE}/passes/${passId}/resolve`, 'POST', { choice, ...(picks === undefined ? {} : { picks }), ...(caption === undefined ? {} : { caption }) });
  }

  /** A new run of the batch: one card per folder, from the original folders. Replaces the previous run. */
  runAgain(batchId: number, pipelineId?: number): Promise<{ batch: Batch; passes: Pass[] }> {
    return this.send<{ batch: Batch; passes: Pass[] }>(`${BASE}/batches/${batchId}/runs`, 'POST', pipelineId === undefined ? {} : { pipelineId });
  }

  /** Pause, resume, stop, run again or delete the given batches. One result per batch; a refused one says why. */
  batchActions(ids: number[], action: ActionName): Promise<ActionResults> {
    return this.send<ActionResults>(`${BASE}/batches/actions`, 'POST', { ids, action });
  }

  /** The same actions for cards (folders). */
  cardActions(ids: number[], action: ActionName): Promise<ActionResults> {
    return this.send<ActionResults>(`${BASE}/passes/actions`, 'POST', { ids, action });
  }

  /** The switched-on pipelines a batch can use. */
  pipelines(): Promise<PipelineChoice[]> {
    return this.request<PipelineChoice[]>(`${BASE}/pipelines`);
  }

  previewFolders(parentFolder: string, pattern: string, outputRoot?: string): Promise<FolderPreview> {
    return this.send<FolderPreview>(`${BASE}/folders/preview`, 'POST', outputRoot ? { parentFolder, pattern, outputRoot } : { parentFolder, pattern });
  }

  createBatches(body: BulkCreate): Promise<BulkResult> {
    return this.send<BulkResult>(`${BASE}/batches/bulk`, 'POST', body);
  }

  /** Removes the batches with their passes and logs. Refused, with nothing deleted, if one is waiting or running. */
  deleteBatches(batchIds: number[]): Promise<{ deleted: number }> {
    return this.send<{ deleted: number }>(`${BASE}/batches/delete`, 'POST', { batchIds });
  }

  /** The batch with the cards of its newest run. */
  batchDetail(batchId: number): Promise<{ batch: Batch; passes: Pass[] }> {
    return this.request<{ batch: Batch; passes: Pass[] }>(`${BASE}/batches/${batchId}`);
  }

  /** The log of a pass: the pipeline's stage lines or the ffmpeg output, each with its time. */
  passLog(passId: number, kind: 'pipeline' | 'ffmpeg'): Promise<LogLines> {
    return this.request<LogLines>(`${BASE}/passes/${passId}/logs?kind=${kind}`);
  }

  outputUrl(passId: number): string {
    return `${BASE}/passes/${passId}/output`;
  }

  stillUrl(passId: number, clip: string, at: number): string {
    return stillUrl(passId, clip, at);
  }

  /** The file of one clip of the card, for playing it. */
  clipUrl(passId: number, clip: string): string {
    return `${BASE}/passes/${passId}/clip?clip=${encodeURIComponent(clip)}`;
  }

  /** Replaces this clip's own trims on the card. An empty list keeps none. Answers the updated pass. */
  saveTrims(passId: number, clip: string, trims: { start: number; end: number }[]): Promise<Pass> {
    return this.send<Pass>(`${BASE}/passes/${passId}/trims`, 'PUT', { clip, trims });
  }

  /** Drops this clip's own trims, so the render uses the AI's parts for it again. Answers the updated pass. */
  resetTrims(passId: number, clip: string): Promise<Pass> {
    return this.request<Pass>(`${BASE}/passes/${passId}/trims/${encodeURIComponent(clip)}`, { method: 'DELETE' });
  }
}

/** The picture of one clip of a card at a time in it. The clip is its file name, as the card's scan lists it. */
export function stillUrl(passId: number, clip: string, at: number): string {
  return `${BASE}/passes/${passId}/still?clip=${encodeURIComponent(clip)}&at=${at}`;
}

export const productionApi = new ProductionApi();
