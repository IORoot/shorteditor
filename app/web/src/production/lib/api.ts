import { HttpClient } from '../../shared/lib/http';
import type { StageHandoff } from '../../shared/contracts/handoff';
import type { Batch, BatchCard, BatchCreate, BulkCreate, BulkResult, CheckResult, Defaults, FolderPreview, LogLines, Pass, PipelineChoice, WatchCreate, WatchView } from './types';

const BASE = '/api/production';

export class ProductionApi extends HttpClient {
  cards(): Promise<BatchCard[]> {
    return this.request<BatchCard[]>(`${BASE}/batches`);
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
  resolve(passId: number, choice: string, picks?: number[]): Promise<Pass> {
    return this.send<Pass>(`${BASE}/passes/${passId}/resolve`, 'POST', picks === undefined ? { choice } : { choice, picks });
  }

  /** A new pass from the original clips, optionally switching the batch to another pipeline first. */
  runAgain(batchId: number, pipelineId?: number): Promise<Pass> {
    return this.send<Pass>(`${BASE}/batches/${batchId}/passes`, 'POST', pipelineId === undefined ? {} : { pipelineId });
  }

  /** The switched-on pipelines a batch or watch can use. */
  pipelines(): Promise<PipelineChoice[]> {
    return this.request<PipelineChoice[]>(`${BASE}/pipelines`);
  }

  previewFolders(parentFolder: string, pattern: string, outputRoot?: string): Promise<FolderPreview> {
    return this.send<FolderPreview>(`${BASE}/folders/preview`, 'POST', outputRoot ? { parentFolder, pattern, outputRoot } : { parentFolder, pattern });
  }

  createBatches(body: BulkCreate): Promise<BulkResult> {
    return this.send<BulkResult>(`${BASE}/batches/bulk`, 'POST', body);
  }

  watches(): Promise<WatchView[]> {
    return this.request<WatchView[]>(`${BASE}/watches`);
  }

  createWatch(body: WatchCreate): Promise<WatchView> {
    return this.send<WatchView>(`${BASE}/watches`, 'POST', body);
  }

  updateWatch(id: number, body: WatchCreate): Promise<WatchView> {
    return this.send<WatchView>(`${BASE}/watches/${id}`, 'PUT', body);
  }

  /** Removes the batches with their passes and logs. Refused, with nothing deleted, if one is waiting or running. */
  deleteBatches(batchIds: number[]): Promise<{ deleted: number }> {
    return this.send<{ deleted: number }>(`${BASE}/batches/delete`, 'POST', { batchIds });
  }

  deleteWatch(id: number): Promise<void> {
    return this.remove(`${BASE}/watches/${id}`);
  }

  setWatchEnabled(id: number, enabled: boolean): Promise<WatchView> {
    return this.send<WatchView>(`${BASE}/watches/${id}/enabled`, 'POST', { enabled });
  }

  checkWatch(id: number): Promise<CheckResult> {
    return this.send<CheckResult>(`${BASE}/watches/${id}/check`, 'POST', {});
  }

  /** The batch with all its passes, so the review screen can read the pass it is showing. */
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
}

export const productionApi = new ProductionApi();
