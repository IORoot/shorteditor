import type { LogEntry, StageDetails, StageRun, StageRunStatus } from './types';

/** Clock time of day, for example 14:05:09, in the viewer's time zone. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A length of time as m:ss, or h:mm:ss once it passes an hour. */
export function span(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export interface TimelineRow {
  key: string;
  title: string;
  status: StageRunStatus | 'waiting';
  startedAt: string | null;
  finishedAt: string | null;
  details?: StageDetails | null;
}

/** Every stage of the run: the ones reached so far with their times, then the rest still waiting. */
export function timelineRows(stages: StageRun[], planned: string[]): TimelineRow[] {
  const reached: TimelineRow[] = stages.map((stage) => ({ key: stage.key, title: stage.title, status: stage.status, startedAt: stage.startedAt, finishedAt: stage.finishedAt, details: stage.details ?? null }));
  const waiting: TimelineRow[] = planned.slice(stages.length).map((title, index) => ({ key: `waiting-${index}`, title, status: 'waiting', startedAt: null, finishedAt: null }));
  return [...reached, ...waiting];
}

/** The time the last log line says a request went to the AI, when no answer has come back since. */
export function waitingSince(entries: LogEntry[]): string | null {
  const last = entries[entries.length - 1];
  return last && /^(Sending|Asking again)/.test(last.text) ? last.at : null;
}

/** Time from a start to an end, or to now while the end is not known yet. */
export function elapsed(startedAt: string, finishedAt: string | null, now: number): number {
  return (finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt);
}
