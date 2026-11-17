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
