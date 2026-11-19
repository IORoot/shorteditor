import { HttpClient } from '../../shared/lib/http';

const BASE = '/api/settings';

export interface AiKeyState {
  keySet: boolean;
  keyHint: string | null;
  /** The OpenRouter model the AI stages ask. */
  model: string;
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
}

export const settingsApi = new SettingsApi();
