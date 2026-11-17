import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useLoad } from '../../../shared/hooks/useLoad';
import { useAction } from '../../../shared/hooks/useAction';
import type { PipelineApi } from '../../lib/api';
import type { PipelineSummary } from '../../lib/types';
import { PipelineRow } from './PipelineRow';

export interface PipelineListProps {
  api: Pick<PipelineApi, 'list' | 'setEnabled' | 'impact'>;
  onOpen: (id: number) => void;
  onNew: () => void;
}

interface Asking {
  pipeline: PipelineSummary;
  watches: number;
  waitingBatches: number;
}

export function PipelineList({ api, onOpen, onNew }: PipelineListProps) {
  const { state, reload } = useLoad(() => api.list(), []);
  const action = useAction();
  const [asking, setAsking] = useState<Asking | null>(null);

  const switchTo = async (pipeline: PipelineSummary, enabled: boolean) => {
    if (await action.run(() => api.setEnabled(pipeline.id, enabled))) reload();
  };

  const toggle = async (pipeline: PipelineSummary, enabled: boolean) => {
    if (enabled || pipeline.usedBy === 0) {
      await switchTo(pipeline, enabled);
      return;
    }
    let impact = { watches: 0, waitingBatches: 0 };
    if (await action.run(async () => { impact = await api.impact(pipeline.id); })) setAsking({ pipeline, ...impact });
  };

  const confirm = async () => {
    if (!asking) return;
    const { pipeline } = asking;
    setAsking(null);
    await switchTo(pipeline, false);
  };

  return (
    <main className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-[-0.6px]">Pipelines</h1>
          <p className="text-small text-text-2">What happens to the clips. Production picks one for each folder.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={onNew}>New pipeline</Button>
      </div>
      {action.error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{action.error}</p> : null}
      {asking ? (
        <div role="alertdialog" aria-label={`Switch off ${asking.pipeline.name}`} className="flex flex-col gap-3 rounded-[16px] bg-warn-soft p-4">
          <p className="text-small font-semibold text-warn">
            Switching off “{asking.pipeline.name}” stops {asking.watches === 1 ? '1 watch' : `${asking.watches} watches`} and {asking.waitingBatches === 1 ? '1 waiting batch' : `${asking.waitingBatches} waiting batches`}. A pass that is running finishes.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={action.busy} onClick={() => void confirm()}>Switch off</Button>
            <Button onClick={() => setAsking(null)}>Keep it on</Button>
          </div>
        </div>
      ) : null}
      {state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading pipelines…</p> : null}
      {state.status === 'error' ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{state.message}</p> : null}
      {state.status === 'ready' && state.data.length === 0 ? <p className="text-body text-text-3">No pipelines yet. Create one to choose what happens to the clips.</p> : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {state.data.map((pipeline) => (
            <PipelineRow key={pipeline.id} pipeline={pipeline} busy={action.busy} onToggle={(enabled) => void toggle(pipeline, enabled)} onOpen={() => onOpen(pipeline.id)} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
