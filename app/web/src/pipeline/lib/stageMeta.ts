import { ArrowDownUp, Film, FolderOpen, Layers, Merge, Sparkles, Terminal, Timer, type LucideIcon } from 'lucide-react';
import { summaryOf } from './schemaForm';
import type { StageInfo, StageStep } from './types';

const ICONS: Record<string, LucideIcon> = {
  scan_folder: FolderOpen,
  order_clips: ArrowDownUp,
  limit_length: Timer,
  join_pieces: Merge,
  render_output: Film,
  detect_action: Sparkles,
  ffmpeg: Terminal,
};

/** The icon that shows a stage in the list, the header and the library. Unknown stages get a plain layers icon. */
export const iconOf = (key: string): LucideIcon => ICONS[key] ?? Layers;

const ORDER: Record<string, string> = { capture_time: 'Capture time', created: 'Created date', name: 'Name', duration: 'Duration', random: 'Random' };

const shape = (width: number, height: number): string => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height) || 1;
  return `${width / divisor}:${height / divisor}`;
};

/** The short line under a stage's name, worded as the design shows it. Stages without a line here use the settings. */
export function summaryFor(key: string, info: StageInfo | undefined, step: StageStep): string {
  const s = step.settings;
  switch (key) {
    case 'scan_folder': return 'Find clips in the input folder';
    case 'order_clips': return `${ORDER[String(s.orderBy)] ?? 'Capture time'}, ${String(s.direction ?? 'oldest_first').replace(/_/g, ' ')}`;
    case 'limit_length': return `Max ${s.maxSeconds ?? 'no limit'} s`;
    case 'join_pieces': return `${s.fit === 'blur' ? 'Blur' : 'Crop'} to ${shape(Number(s.width ?? 1080), Number(s.height ?? 1920))}`;
    case 'render_output': return `${s.maxSizeMb === null || s.maxSizeMb === undefined ? 'No size limit' : `Max ${s.maxSizeMb} MB`} · ${s.fps ?? 30} fps`;
    case 'detect_action': return `Asks ${String(s.model ?? '').split('/').pop() || 'an AI model'}`;
    case 'ffmpeg': return s.runOn === 'joined_video' ? 'On the joined video' : 'On each clip';
    default: return info ? summaryOf(info, step) : 'Stage file not found';
  }
}
