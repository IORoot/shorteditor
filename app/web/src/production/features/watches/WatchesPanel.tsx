import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useAction } from '../../../shared/hooks/useAction';
import { useWatches } from '../../hooks/useWatches';
import type { ProductionApi } from '../../lib/api';
import { checkMessage } from '../../lib/watches';
import type { WatchView } from '../../lib/types';
import { WatchRow } from './WatchRow';

export interface WatchesPanelProps {
  api: Pick<ProductionApi, 'watches' | 'setWatchEnabled' | 'checkWatch' | 'deleteWatch'>;
  onAdd: () => void;
  onEdit: (watch: WatchView) => void;
  /** Batches may have changed (a check made some, or a delete): the board should reload. */
  onChanged: () => void;
  onClose: () => void;
}

export function WatchesPanel({ api, onAdd, onEdit, onChanged, onClose }: WatchesPanelProps) {
  const { state, staleError, reload } = useWatches(api);
  const action = useAction();
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, string>>({});
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggle = async (id: number, enabled: boolean) => {
    if (await action.run(() => api.setWatchEnabled(id, enabled))) reload();
  };

  const check = async (id: number) => {
    setCheckingId(id);
    let made = 0;
    const done = await action.run(async () => {
      const result = await api.checkWatch(id);
      made = result.created.length;
      setResults((current) => ({ ...current, [id]: checkMessage(result) }));
    });
    setCheckingId(null);
    if (done) {
      reload();
      if (made > 0) onChanged();
    }
  };

  const remove = async (id: number) => {
    setConfirmingId(null);
    if (await action.run(() => api.deleteWatch(id))) {
      setResults((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      reload();
      onChanged();
    }
  };

  return (
    <dialog open aria-label="Watches" className="modal modal-open">
      <div className="modal-box flex max-h-[90vh] w-[760px] max-w-full flex-col gap-5 overflow-y-auto rounded-3xl bg-surface p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 font-semibold">Watches</h2>
            <p className="text-small text-text-2">Each new folder that matches a pattern gets its own batch.</p>
          </div>
          <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={onAdd}>Add watch</Button>
        </div>
        {staleError ? <p role="alert" className="break-words rounded-xl bg-warn-soft px-4 py-3 text-small text-warn">Showing the last list. Can’t refresh right now: {staleError}</p> : null}
        {action.error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{action.error}</p> : null}
        {state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading watches…</p> : null}
        {state.status === 'error' ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{state.message}</p> : null}
        {state.status === 'ready' && state.data.length === 0 ? <p className="text-body text-text-3">No watches yet. Add one to batch new folders automatically.</p> : null}
        {state.status === 'ready' && state.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {state.data.map((watch) => (
              <WatchRow
                key={watch.id}
                watch={watch}
                result={results[watch.id] ?? null}
                checking={checkingId === watch.id}
                confirmingDelete={confirmingId === watch.id}
                busy={action.busy}
                onToggle={(enabled) => void toggle(watch.id, enabled)}
                onCheck={() => void check(watch.id)}
                onEdit={() => onEdit(watch)}
                onAskDelete={() => setConfirmingId(watch.id)}
                onConfirmDelete={() => void remove(watch.id)}
                onCancelDelete={() => setConfirmingId(null)}
              />
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </dialog>
  );
}
