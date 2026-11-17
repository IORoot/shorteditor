import { HttpClient } from './http';
import type { BrowseResult } from './types';

/** Lists folders on the server, for any stage that needs a folder picker. */
export class FsApi extends HttpClient {
  async browse(path?: string): Promise<BrowseResult> {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request<BrowseResult>(`/api/fs/browse${query}`);
  }
}

export const fsApi = new FsApi();
