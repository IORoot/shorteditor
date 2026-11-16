import { Plus, RotateCw } from 'lucide-react';
import type { Collector } from '../../lib/types';
import type { LoadState } from '../../../hooks/useLoad';
import { Button } from '../../../components/ui/Button';
import { CollectorRow } from './CollectorRow';

export interface CollectorListProps {
  state: LoadState<Collector[]>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
  onRetry: () => void;
  onNew: () => void;
}

export function CollectorList({ state, selectedId, onSelect, onToggle, onRetry, onNew }: CollectorListProps) {
  return (
    <>
      <div className="flex items-center justify-between px-3 pt-1 pb-2.5">
        <h2 className="text-label font-semibold uppercase tracking-[0.8px] text-text-2">Collectors</h2>
      </div>
      {state.status === 'loading' ? <p role="status" className="px-3 text-small text-text-3">Loading collectors…</p> : null}
      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-2 px-3">
          <p className="text-small text-bad">Couldn’t reach the backend. {state.message}</p>
          <Button icon={<RotateCw size={15} aria-hidden="true" />} onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <p className="px-3 text-small text-text-3">No collectors yet.</p>
      ) : null}
      {state.status === 'ready'
        ? state.data.map((collector) => (
            <CollectorRow
              key={collector.id}
              collector={collector}
              selected={collector.id === selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
      <Button icon={<Plus size={15} aria-hidden="true" />} onClick={onNew} className="mx-3 mt-2">
        New collector
      </Button>
    </>
  );
}
