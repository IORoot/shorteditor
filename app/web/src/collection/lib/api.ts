import { ApiError, HttpClient } from '../../shared/lib/http';
import { isOutdatedBackendConfig, normalizeCollector } from './normalize';
import type { BrowseResult } from '../../shared/lib/types';
import type { Collector, CollectorConfig, FilterPreviewResult, FolderPreview, FolderPreviewRequest, PlanResult, Run, ScheduleDraft } from './types';

export class ApiClient extends HttpClient {
  async listCollectors(): Promise<Collector[]> {
    return (await this.request<Collector[]>('/api/collectors')).map(normalizeCollector);
  }

  async listRuns(collectorId: number): Promise<Run[]> {
    return this.request<Run[]>(`/api/collectors/${collectorId}/runs`);
  }

  async saveSchedule(collectorId: number, draft: ScheduleDraft): Promise<Collector> {
    const saved = await this.request<Collector>(`/api/collectors/${collectorId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    return normalizeCollector(saved);
  }

  async dryRun(collectorId: number): Promise<PlanResult> {
    return this.send<PlanResult>(`/api/collectors/${collectorId}/dry-run`, 'POST', {});
  }

  async startRun(collectorId: number): Promise<Run> {
    return this.send<Run>(`/api/collectors/${collectorId}/run`, 'POST', {});
  }

  /** Turns the whole collector on or off. A turned-off collector never runs, by hand or by schedule. */
  async setActive(collectorId: number, active: boolean): Promise<Collector> {
    return normalizeCollector(await this.send<Collector>(`/api/collectors/${collectorId}/active`, 'PUT', { active }));
  }

  async createCollector(name: string): Promise<Collector> {
    return normalizeCollector(await this.send<Collector>('/api/collectors', 'POST', { name }));
  }

  /** The backend answers 204 with no body, so this doesn't parse JSON. */
  async deleteCollector(collectorId: number): Promise<void> {
    await this.remove(`/api/collectors/${collectorId}`);
  }

  async undoRun(runId: number): Promise<Run> {
    return this.send<Run>(`/api/runs/${runId}/undo`, 'POST', {});
  }

  async saveConfig(collectorId: number, config: CollectorConfig): Promise<Collector> {
    const saved = await this.send<Collector>(`/api/collectors/${collectorId}`, 'PUT', config);
    if (isOutdatedBackendConfig(saved.config)) {
      throw new ApiError(0, 'The backend is out of date and did not save the filters. Restart the backend, then save again.');
    }
    return normalizeCollector(saved);
  }

  async previewFolder(request: FolderPreviewRequest): Promise<FolderPreview> {
    return this.send<FolderPreview>('/api/preview/folder', 'POST', request);
  }

  async previewFilters(config: CollectorConfig): Promise<FilterPreviewResult> {
    return this.send<FilterPreviewResult>('/api/preview/filters', 'POST', config);
  }

  async browse(path?: string): Promise<BrowseResult> {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request<BrowseResult>(`/api/fs/browse${query}`);
  }
}

export const api = new ApiClient();
