export function formatLength(seconds: number | null): string {
  if (seconds === null) return '–';
  if (seconds < 60) return `${seconds} s`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

export const formatSize = (mb: number | null): string => (mb === null ? '–' : `${mb} MB`);

export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info';

const BATCH_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  review: { label: 'Ready to review', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' },
  approved: { label: 'Approved', tone: 'ok' },
};

export const batchStatus = (status: string | null): { label: string; tone: Tone } => BATCH_STATUS[status ?? ''] ?? { label: status ?? '', tone: 'info' };

export function whenOf(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}
