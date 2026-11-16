import type { BrowseResult, Collector, CollectorConfig, FolderPreview, FolderPreviewRequest, Run, ScheduleDraft } from './types';

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
    return this.request<Collector[]>('/api/collectors');
  }

  async listRuns(collectorId: number): Promise<Run[]> {
    return this.request<Run[]>(`/api/collectors/${collectorId}/runs`);
  }

  async saveSchedule(collectorId: number, draft: ScheduleDraft): Promise<Collector> {
    return this.request<Collector>(`/api/collectors/${collectorId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  }

  async saveConfig(collectorId: number, config: CollectorConfig): Promise<Collector> {
    return this.send<Collector>(`/api/collectors/${collectorId}`, 'PUT', config);
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
