import { formatBytes } from '../../../shared/lib/format';
import { clock, lastSegment } from '../../lib/board';
import type { VideoData } from '../../lib/types';

export function OutputMeta({ output }: { output: VideoData }) {
  const rows: [string, string][] = [
    ['FILE', lastSegment(output.path)],
    ['LENGTH', clock(output.duration)],
    ['SIZE', formatBytes(output.sizeBytes)],
  ];
  return (
    <dl className="grid grid-cols-3 gap-3">
      {rows.map(([key, value]) => (
        <div key={key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-label font-semibold tracking-wide text-text-3">{key}</dt>
          <dd title={value} className="truncate text-small font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
