import { isOutdatedBackendConfig, normalizeCollector } from './normalize';
import type { BrowseResult, Collector, CollectorConfig, FolderPreview, FolderPreviewRequest, PlanResult, Run, ScheduleDraft } from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.fetchImpl = fetchImpl;
  }

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

  async browse(path?: string): Promise<BrowseResult> {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request<BrowseResult>(`/api/fs/browse${query}`);
  }

  private send<T>(url: string, method: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      throw new ApiError(response.status, await this.errorMessage(response, url));
    }
    return (await response.json()) as T;
  }

  private async errorMessage(response: Response, url: string): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') return body.detail;
    } catch {
      // fall through to the generic message
    }
    return `Request to ${url} failed with ${response.status}`;
  }
}

export const api = new ApiClient();
