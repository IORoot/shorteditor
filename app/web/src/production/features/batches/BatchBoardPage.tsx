import { ArrowLeft, Pencil, Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useAction } from '../../../shared/hooks/useAction';
import { useLoad } from '../../../shared/hooks/useLoad';
import { cardHash, goTo } from '../../../shared/lib/route';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import { subtitle } from '../../lib/board';
import { Board } from '../board/Board';

export interface BatchBoardPageProps {
  api: Pick<ProductionApi, 'cards' | 'batchDetail' | 'runAgain' | 'updateBatch'>;
  batchId: number;
  onBack: () => void;
}

/** One batch's board: its cards in Queued, Running, Review and Approved, with the batch's own actions. */
export function BatchBoardPage({ api, batchId, onBack }: BatchBoardPageProps) {
  const board = useBoard(api);
  const detail = useLoad(() => api.batchDetail(batchId), [batchId]);
  const run = useAction();
  const save = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [outputRoot, setOutputRoot] = useState('');

  const batch = detail.state.status === 'ready' ? detail.state.data.batch : null;
  const cards = (board.state.status === 'ready' ? board.state.data : []).filter((card) => card.batchId === batchId);
  const busy = cards.some((card) => card.status === 'queued' || card.status === 'running');

  const startEdit = () => {
    if (!batch) return;
    setName(batch.name);
    setOutputRoot(batch.outputRoot);
    save.clear();
    setEditing(true);
  };
  const saveEdit = async () => {
    if (await save.run(() => api.updateBatch(batchId, { name, outputRoot }))) {
      setEditing(false);
      detail.reload();
      board.reload();
    }
  };
  const runAgain = async () => {
    if (await run.run(() => api.runAgain(batchId))) {
      board.reload();
      detail.reload();
    }
  };

  if (detail.state.status === 'error') {
    return (
      <main aria-label="Batch" className="flex flex-col items-start gap-4 px-2">
        <Button icon={<ArrowLeft size={15} aria-hidden="true" />} onClick={onBack}>All batches</Button>
        <p role="alert" className="text-small text-bad">{detail.state.message}</p>
      </main>
    );
  }

  return (
    <main aria-label="Batch" className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <button type="button" onClick={onBack} className="flex w-fit items-center gap-2 rounded-full px-2 py-1 text-small font-medium text-text-2 hover:bg-fill-2">
            <ArrowLeft size={15} aria-hidden="true" />
            All batches
          </button>
          <h1 className="text-h1 font-bold tracking-[-0.6px]">{batch?.name ?? 'Batch'}</h1>
          <p className="text-small text-text-2">{board.state.status === 'ready' ? subtitle(cards) : ' '}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button icon={<Pencil size={15} aria-hidden="true" />} onClick={startEdit} disabled={!batch || busy}>Edit</Button>
          <Button variant="primary" icon={<Play size={15} aria-hidden="true" />} onClick={runAgain} disabled={run.busy || busy || cards.length === 0}>
            {run.busy ? 'Starting…' : 'Run again'}
          </Button>
        </div>
      </div>
      {run.error ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{run.error}</p> : null}
      {editing && batch ? (
        <form
          aria-label="Edit batch"
          className="flex flex-wrap items-end gap-4 rounded-2xl bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-caption font-semibold text-text-2">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-[10px] bg-fill-2 px-3 py-2 text-body font-normal text-text" />
          </label>
          <label className="flex min-w-[280px] flex-[2] flex-col gap-1.5 text-caption font-semibold text-text-2">
            Output folder
            <input value={outputRoot} onChange={(event) => setOutputRoot(event.target.value)} className="rounded-[10px] bg-fill-2 px-3 py-2 font-mono text-caption font-normal text-text" />
            <span className="font-normal text-text-3">The output folder can change only before any card has a finished video.</span>
          </label>
          {save.error ? <p role="alert" className="w-full text-small text-bad">{save.error}</p> : null}
          <div className="flex gap-2.5">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={save.busy}>Save</Button>
          </div>
        </form>
      ) : null}
      {board.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading the batch…</p> : null}
      {board.state.status === 'error' ? <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{board.state.message}</p> : null}
      {board.state.status === 'ready' && cards.length === 0 ? <p className="text-body text-text-3">This batch has no cards.</p> : null}
      {cards.length > 0 ? <Board cards={cards} selectedBatchId={null} onOpen={(card) => goTo(cardHash(card.passId))} /> : null}
    </main>
  );
}
