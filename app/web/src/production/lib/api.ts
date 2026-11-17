import { HttpClient } from '../../shared/lib/http';
import type { StageHandoff } from '../../shared/contracts/handoff';
import type { Batch, BatchCard, BatchCreate, Defaults, Pass, StageStep, ValidateResult } from './types';

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

  /** A new pass from the original clips, optionally with a changed pipeline. */
  runAgain(batchId: number, steps?: StageStep[]): Promise<Pass> {
    return this.send<Pass>(`${BASE}/batches/${batchId}/passes`, 'POST', steps ? { steps } : {});
  }

  validate(steps: StageStep[]): Promise<ValidateResult> {
    return this.send<ValidateResult>(`${BASE}/pipelines/validate`, 'POST', { steps });
  }

  outputUrl(passId: number): string {
    return `${BASE}/passes/${passId}/output`;
  }
}

export const productionApi = new ProductionApi();
