import type { StageDetails } from '../../lib/types';
import { span } from '../../lib/passDetail';
import { formatMegabytes } from '../../../shared/lib/format';

const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';

const CHOICE: Record<string, string> = { drop_shortest: 'drop the shortest clips', keep_first: 'keep the first clips and trim the last' };

/** The clips a stage found or kept, or the video it wrote: shown under the stage on the card's detail page. */
export function StageDetailsView({ details }: { details: StageDetails }) {
  if (details.kind === 'video') {
    const target = details.target;
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-surface px-3 py-2 text-caption sm:grid-cols-4">
        <div><dt className={LABEL}>Length</dt><dd className="font-semibold tabular-nums">{span(details.duration * 1000)}</dd></div>
        <div><dt className={LABEL}>Size</dt><dd className="font-semibold tabular-nums">{formatMegabytes(details.sizeBytes)}</dd></div>
        <div><dt className={LABEL}>Picture</dt><dd className="font-semibold tabular-nums">{details.width && details.height ? `${details.width} × ${details.height}` : '—'}</dd></div>
        <div><dt className={LABEL}>Frame rate</dt><dd className="font-semibold tabular-nums">{details.fps ? `${details.fps} fps` : '—'}</dd></div>
        {details.attempts ? <div><dt className={LABEL}>Encodes</dt><dd className="font-semibold tabular-nums">{details.attempts}</dd></div> : null}
        {target ? <p className="col-span-full text-text-3">Shaped to {target.width} × {target.height} at {target.fps} fps</p> : null}
      </dl>
    );
  }
  const limit = details.limit;
  const summary = limit === undefined
    ? `${details.clips.length} ${details.clips.length === 1 ? 'clip' : 'clips'} · ${span(details.total * 1000)} in total`
    : details.before !== null && details.before !== undefined && details.before > limit
      ? `${span(details.before * 1000)} before, cut to ${span(details.total * 1000)} against a ${span(limit * 1000)} limit${details.choice ? ` by ${CHOICE[details.choice] ?? details.choice}` : ''}`
      : `${span(details.total * 1000)} is within the ${span(limit * 1000)} limit, so nothing is cut`;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption font-semibold text-text-2">{summary}</p>
      {details.clips.length > 0 ? (
        <ol aria-label="Clips" className="max-h-[240px] overflow-auto rounded-lg bg-surface text-caption">
          {details.clips.map((clip, index) => (
            <li key={`${clip.name}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-fill-2 px-3 py-1.5 last:border-b-0">
              <span className="text-text-3 tabular-nums">{index + 1}</span>
              <span className="truncate">{clip.name}</span>
              <span className="tabular-nums text-text-2">{span(clip.length * 1000)} · from {span(clip.start * 1000)} to {span(clip.end * 1000)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
