import type { Tone } from '../../shared/lib/types';
import type { CheckResult, WatchView } from './types';

const LABEL: Record<WatchView['status'], string> = { watching: 'Watching', waiting: 'Waiting', paused: 'Paused', problem: 'Problem' };
const TONE: Record<WatchView['status'], Tone> = { watching: 'ok', waiting: 'warn', paused: 'info', problem: 'bad' };

export const watchLabel = (view: WatchView): string => LABEL[view.status] ?? view.status;
export const watchTone = (view: WatchView): Tone => TONE[view.status] ?? 'warn';

/** The one line a "Check now" leaves behind: the error, what was made, what is still settling, or nothing new. */
export function checkMessage(result: CheckResult): string {
  if (result.error) return result.error;
  if (result.created.length > 0) return `Created ${result.created.length} ${result.created.length === 1 ? 'batch' : 'batches'}`;
  if (result.waiting.length > 0) return `Waiting for ${result.waiting.join(', ')} to settle`;
  return 'Nothing new';
}
