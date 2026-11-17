export type Tone = 'ok' | 'warn' | 'bad' | 'info';

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}
