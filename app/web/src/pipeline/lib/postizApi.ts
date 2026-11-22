import { HttpClient } from '../../shared/lib/http';

/** What the stage form asks Postiz for, through the server. Kept here so Pipeline imports nothing from Settings. */
export interface LiveChannel {
  id: string;
  name: string;
  /** The platform, for example instagram. */
  identifier: string;
}

export interface LivePipeline {
  id: string;
  name: string;
  /** The channels this pipeline posts to. */
  channels: LiveChannel[];
}

export interface LiveFolder {
  id: string;
  name: string;
}

export class PostizLookup extends HttpClient {
  channels(): Promise<LiveChannel[]> {
    return this.request<LiveChannel[]>('/api/settings/postiz/channels');
  }

  pipelines(): Promise<LivePipeline[]> {
    return this.request<LivePipeline[]>('/api/settings/postiz/pipelines');
  }

  folders(): Promise<LiveFolder[]> {
    return this.request<LiveFolder[]>('/api/settings/postiz/folders');
  }
}

export type PostizLookupApi = Pick<PostizLookup, 'channels' | 'folders' | 'pipelines'>;

export const postizLookup = new PostizLookup();
