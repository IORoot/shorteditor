import { batchStatus, whenOf, type Tone } from '../../lib/format';
import type { UsageItem } from '../../lib/types';

const CHIP: Record<Tone, string> = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-accent-soft text-primary' };

/** The newest batches that ran this pipeline, with their state. */
export function RecentBatches({ batches }: { batches: UsageItem[] }) {
  return (
    <section aria-label="Recent batches" className="flex flex-col gap-1 rounded-[14px] bg-surface p-5">
      <h2 className="text-body font-semibold">Recent batches</h2>
      <p className="text-caption text-text-2">Batches that used this pipeline</p>
      {batches.length === 0 ? <p className="pt-3 text-small text-text-3">No batch has used this pipeline yet.</p> : (
        <ul className="flex flex-col">
          {batches.map((item) => {
            const status = batchStatus(item.status);
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 border-t border-line py-3.5">
                <span className="min-w-0 truncate font-mono text-small">{item.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  {item.status ? <span className={`rounded-full px-2.5 py-1 text-caption font-medium ${CHIP[status.tone]}`}>{status.label}</span> : null}
                  <span className="text-caption text-text-2">{whenOf(item.at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
