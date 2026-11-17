import { Check } from 'lucide-react';
import type { UsageItem } from '../../lib/types';

export interface ChecksPanelProps {
  errors: string[];
  checking: boolean;
  usedBy: UsageItem[];
}

/** Whether the order is valid as the user edits, and what depends on the pipeline. */
export function ChecksPanel({ errors, checking, usedBy }: ChecksPanelProps) {
  return (
    <aside aria-label="Checks" className="flex w-[340px] shrink-0 flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-[14px] bg-surface p-5">
        <h2 className="text-body font-semibold">Checks</h2>
        {checking ? <p role="status" className="text-small text-text-3">Checking…</p> : null}
        {!checking && errors.length === 0 ? (
          <p role="status" className="flex w-fit items-center gap-2 rounded-[10px] bg-ok-soft px-3 py-2 text-small font-semibold text-ok"><Check size={14} aria-hidden="true" />The order is valid</p>
        ) : null}
        {!checking && errors.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {errors.map((error) => <li key={error} role="alert" className="break-words rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">{error}</li>)}
          </ul>
        ) : null}
        <p className="text-caption text-text-2">Checked as you edit. Save stays off while the order has a problem.</p>
      </section>
      <section aria-label="Used by" className="flex flex-col gap-3 rounded-[14px] bg-surface p-5">
        <h2 className="text-body font-semibold">Used by</h2>
        {usedBy.length === 0 ? <p className="text-small text-text-3">Nothing uses this pipeline yet.</p> : (
          <ul className="flex flex-col gap-2.5">
            {usedBy.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-2 text-small">
                <span className="min-w-0 truncate">{item.kind === 'watch' ? 'Watch' : 'Batch'} {item.name}</span>
                {item.status ? <span className="shrink-0 text-caption text-text-3">{item.status}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-text-2">A pipeline that something uses cannot be deleted. Switch it off instead.</p>
      </section>
    </aside>
  );
}
