import type { Run } from '../../lib/types';
import type { LoadState } from '../../hooks/useLoad';
import { RunRow } from './RunRow';

export interface RunHistoryProps {
  state: LoadState<Run[]> | null;
  onUndo: (id: number) => void;
}

export function RunHistory({ state, onUndo }: RunHistoryProps) {
  return (
    <section aria-labelledby="history-title" className="flex min-h-0 flex-1 flex-col rounded-[20px] bg-surface p-6">
      <div className="flex items-baseline justify-between pb-2.5">
        <h2 id="history-title" className="text-h3 font-semibold">History</h2>
        <span className="text-caption font-medium text-text-3">Last 5 runs</span>
      </div>
      {!state || state.status === 'loading' ? <p role="status" className="py-6 text-small text-text-3">Loading history…</p> : null}
      {state?.status === 'error' ? (
        <p role="alert" className="py-6 text-small text-bad">Couldn’t load history. {state.message}</p>
      ) : null}
      {state?.status === 'ready' && state.data.length === 0 ? (
        <p className="py-6 text-small text-text-3">No runs yet. Use Run now to start one.</p>
      ) : null}
      {state?.status === 'ready' && state.data.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-label font-semibold uppercase tracking-[0.8px] text-text-3">
              <th className="py-2 pr-4 text-left font-semibold">When</th>
              <th className="py-2 pr-4 text-left font-semibold">Outcome</th>
              <th className="py-2 pr-4 text-left font-semibold">Status</th>
              <th className="py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((run) => (
              <RunRow key={run.id} run={run} onUndo={onUndo} />
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
