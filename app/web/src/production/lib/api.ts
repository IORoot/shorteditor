import { HttpClient } from '../../shared/lib/http';
import type { StageHandoff } from '../../shared/contracts/handoff';
import type { Batch, BatchCard, BatchCreate, BulkCreate, BulkResult, CheckResult, Defaults, FolderPreview, Pass, PipelineChoice, WatchCreate, WatchView } from './types';

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

  resolve(passId: number, choice: string): Promise<Pass> {
    return this.send<Pass>(`${BASE}/passes/${passId}/resolve`, 'POST', { choice });
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

  deleteWatch(id: number): Promise<void> {
    return this.remove(`${BASE}/watches/${id}`);
  }

  setWatchEnabled(id: number, enabled: boolean): Promise<WatchView> {
    return this.send<WatchView>(`${BASE}/watches/${id}/enabled`, 'POST', { enabled });
  }

  checkWatch(id: number): Promise<CheckResult> {
    return this.send<CheckResult>(`${BASE}/watches/${id}/check`, 'POST', {});
  }

  outputUrl(passId: number): string {
    return `${BASE}/passes/${passId}/output`;
  }
}

export const productionApi = new ProductionApi();
