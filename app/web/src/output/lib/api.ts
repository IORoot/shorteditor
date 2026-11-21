import { HttpClient } from '../../shared/lib/http';

export type ExportStatus = 'uploading' | 'uploaded' | 'queued' | 'unclear' | 'checked' | 'failed';

/** One try at sending a card's finished video to Postiz. */
export interface ExportRecord {
  id: number;
  /** null once the card is gone (Run again or delete): the record stays. */
  cardId: number | null;
  sha256: string;
  status: ExportStatus;
  mediaId: string | null;
  queueId: string | null;
  pipelineId: string | null;
  folder: string | null;
  postType: string | null;
  caption: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  batchName: string;
  cardNumber: number;
}

export class OutputApi extends HttpClient {
  exports(): Promise<ExportRecord[]> {
    return this.request<ExportRecord[]>('/api/production/exports');
  }
}

export const outputApi = new OutputApi();
