import { HttpClient } from '../../shared/lib/http';

const BASE = '/api/settings';

export interface AiKeyState {
  keySet: boolean;
  keyHint: string | null;
  /** The OpenRouter model the AI stages ask. */
  model: string;
}

export interface PostizState {
  /** The saved address, in full form (https://host/api), or null. */
  url: string | null;
  keySet: boolean;
  keyHint: string | null;
}

export interface PostizChannel {
  id: string;
  name: string;
  /** The platform, for example instagram. */
  identifier: string;
}

export interface PostizFolder {
  id: string;
  name: string;
}

export interface PostizTest {
  channels: PostizChannel[];
  folders: number;
}

export class SettingsApi extends HttpClient {
  aiKey(): Promise<AiKeyState> {
    return this.request<AiKeyState>(`${BASE}/ai`);
  }

  /** null leaves the key alone; an empty string removes it. */
  saveAiKey(key: string | null): Promise<AiKeyState> {
    return this.send<AiKeyState>(`${BASE}/ai`, 'PUT', { key });
  }

  /** null leaves the model alone; an empty string goes back to the default model. */
  saveAiModel(model: string | null): Promise<AiKeyState> {
    return this.send<AiKeyState>(`${BASE}/ai`, 'PUT', { model });
  }

  postiz(): Promise<PostizState> {
    return this.request<PostizState>(`${BASE}/postiz`);
  }

  /** A missing field is left alone; an empty string removes it. */
  savePostiz(update: { url?: string; key?: string }): Promise<PostizState> {
    return this.send<PostizState>(`${BASE}/postiz`, 'PUT', update);
  }

  testPostiz(): Promise<PostizTest> {
    return this.send<PostizTest>(`${BASE}/postiz/test`, 'POST', {});
  }

  postizChannels(): Promise<PostizChannel[]> {
    return this.request<PostizChannel[]>(`${BASE}/postiz/channels`);
  }

  postizFolders(): Promise<PostizFolder[]> {
    return this.request<PostizFolder[]>(`${BASE}/postiz/folders`);
  }
}

export const settingsApi = new SettingsApi();