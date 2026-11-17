import { HttpClient } from '../../shared/lib/http';

const BASE = '/api/settings';

export interface AiKeyState {
  keySet: boolean;
  keyHint: string | null;
}

export class SettingsApi extends HttpClient {
  aiKey(): Promise<AiKeyState> {
    return this.request<AiKeyState>(`${BASE}/ai`);
  }

  /** null leaves the key alone; an empty string removes it. */
  saveAiKey(key: string | null): Promise<AiKeyState> {
    return this.send<AiKeyState>(`${BASE}/ai`, 'PUT', { key });
  }
}

export const settingsApi = new SettingsApi();
