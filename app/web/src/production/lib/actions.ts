import type { ActionName, ActionResult, PassStatus } from './types';

/** The order the actions are shown in. */
export const ACTIONS: ActionName[] = ['pause', 'resume', 'stop', 'rerun', 'delete'];

export const ACTION_LABEL: Record<ActionName, string> = { pause: 'Pause', resume: 'Resume', stop: 'Stop', rerun: 'Run again', delete: 'Delete' };

/** Which actions apply to a card in this status. It mirrors the server's rules; the server still decides. */
export function cardCan(status: PassStatus, action: ActionName): boolean {
  switch (action) {
    case 'pause': return status === 'queued' || status === 'running';
    case 'resume': return status === 'paused' || status === 'stopped' || status === 'held';
    case 'stop': return status === 'queued' || status === 'running' || status === 'paused' || status === 'blocked' || status === 'held';
    case 'rerun': return status !== 'queued' && status !== 'running';
    case 'delete': return status !== 'running';
  }
}

/** Which actions apply to a batch, given the statuses of its cards. */
export function batchCan(statuses: PassStatus[], action: ActionName): boolean {
  return statuses.some((status) => cardCan(status, action));
}

export interface Outcome {
  done: number;
  problems: string[];
}

/** Counts the results of a bulk action, keeping each refusal's reason. */
export function outcome(results: ActionResult[]): Outcome {
  return {
    done: results.filter((r) => r.ok).length,
    problems: results.filter((r) => !r.ok).map((r) => r.message),
  };
}
