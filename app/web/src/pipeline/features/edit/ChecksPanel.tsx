import type { UsageItem } from '../../lib/types';

export interface ChecksPanelProps {
  errors: string[];
  checking: boolean;
  usedBy: UsageItem[];
}

export function ChecksPanel({ errors, checking, usedBy }: ChecksPanelProps) {
  return (
    <aside aria-label="Checks" className="flex w-[300px] shrink-0 flex-col gap-4 rounded-[20px] bg-surface p-5">
      <section className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold">Checks</h2>
        {checking ? <p role="status" className="text-small text-text-3">Checking…</p> : null}
        {!checking && errors.length === 0 ? <p role="status" className="text-small font-semibold text-ok">The order is valid</p> : null}
        {!checking && errors.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {errors.map((error) => <li key={error} role="alert" className="break-words rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">{error}</li>)}
          </ul>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold">Used by</h2>
        {usedBy.length === 0 ? <p className="text-small text-text-3">Nothing uses this pipeline yet.</p> : (
          <ul className="flex flex-col gap-1.5">
            {usedBy.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-baseline justify-between gap-2 text-small">
                <span className="min-w-0 truncate">{item.kind === 'watch' ? 'Watch' : 'Batch'} {item.name}</span>
                {item.status ? <span className="shrink-0 text-caption text-text-3">{item.status}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
