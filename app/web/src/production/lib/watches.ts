import type { Tone } from '../../shared/lib/types';
import type { WatchView } from './types';

const LABEL: Record<WatchView['status'], string> = { watching: 'Watching', waiting: 'Waiting', paused: 'Paused', problem: 'Problem' };
const TONE: Record<WatchView['status'], Tone> = { watching: 'ok', waiting: 'warn', paused: 'info', problem: 'bad' };

export const watchLabel = (view: WatchView): string => LABEL[view.status] ?? view.status;
export const watchTone = (view: WatchView): Tone => TONE[view.status] ?? 'warn';
