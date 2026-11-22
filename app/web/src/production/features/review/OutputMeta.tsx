import { formatMegabytes } from '../../../shared/lib/format';
import { clock, lastSegment } from '../../lib/board';
import type { VideoData } from '../../lib/types';

export function OutputMeta({ output }: { output: VideoData }) {
  const rows: [string, string][] = [
    ['FILE', lastSegment(output.path)],
    ['FOLDER', output.path.slice(0, output.path.lastIndexOf('/')) || '/'],
    ['LENGTH', clock(output.duration)],
    ['SIZE', formatMegabytes(output.sizeBytes)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map(([key, value]) => (
        <div key={key} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-label font-semibold tracking-wide text-text-3">{key}</dt>
          <dd title={value} className="truncate text-small font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
