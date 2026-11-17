import { HttpClient } from '../../shared/lib/http';
import type { OffImpact, Pipeline, PipelineDetail, PipelineSave, PipelineSummary, StageInfo, StageStep } from './types';

const BASE = '/api/pipeline';

export class PipelineApi extends HttpClient {
  list(): Promise<PipelineSummary[]> {
    return this.request<PipelineSummary[]>(`${BASE}/pipelines`);
  }

  get(id: number): Promise<PipelineDetail> {
    return this.request<PipelineDetail>(`${BASE}/pipelines/${id}`);
  }

  create(body: PipelineSave): Promise<Pipeline> {
    return this.send<Pipeline>(`${BASE}/pipelines`, 'POST', body);
  }

  save(id: number, body: PipelineSave): Promise<Pipeline> {
    return this.send<Pipeline>(`${BASE}/pipelines/${id}`, 'PUT', body);
  }

  setEnabled(id: number, enabled: boolean): Promise<Pipeline> {
    return this.send<Pipeline>(`${BASE}/pipelines/${id}/enabled`, 'POST', { enabled });
  }

  impact(id: number): Promise<OffImpact> {
    return this.request<OffImpact>(`${BASE}/pipelines/${id}/impact`);
  }

  duplicate(id: number): Promise<Pipeline> {
    return this.send<Pipeline>(`${BASE}/pipelines/${id}/duplicate`, 'POST', {});
  }

  deletePipeline(id: number): Promise<void> {
    return this.remove(`${BASE}/pipelines/${id}`);
  }

  async template(): Promise<StageStep[]> {
    return (await this.request<{ steps: StageStep[] }>(`${BASE}/template`)).steps;
  }

  stages(): Promise<StageInfo[]> {
    return this.request<StageInfo[]>(`${BASE}/stages`);
  }

  async check(steps: StageStep[]): Promise<string[]> {
    return (await this.send<{ errors: string[] }>(`${BASE}/check`, 'POST', { steps })).errors;
  }
}

export const pipelineApi = new PipelineApi();
