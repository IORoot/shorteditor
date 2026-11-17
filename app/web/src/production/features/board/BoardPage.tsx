import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { useAction } from '../../hooks/useAction';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import { subtitle } from '../../lib/board';
import { ReviewDrawer } from '../review/ReviewDrawer';
import { Board } from './Board';

export interface BoardPageProps {
  api: Pick<ProductionApi, 'cards' | 'approve' | 'runAgain' | 'resolve' | 'outputUrl'>;
  onNew?: () => void;
}

export function BoardPage({ api, onNew }: BoardPageProps) {
  const board = useBoard(api);
  const action = useAction();
  const [openId, setOpenId] = useState<number | null>(null);
  const cards = board.state.status === 'ready' ? board.state.data : [];
  const opened = cards.find((card) => card.batchId === openId) ?? null;

  useEffect(() => {
    // the batch is gone from the list (for example after a restart with a different database)
    if (openId !== null && board.state.status === 'ready' && !opened) setOpenId(null);
  }, [openId, opened, board.state.status]);

  const returnFocusTo = useRef<number | null>(null);

  // Give focus back to the card the drawer was opened from, found again by id because a refresh may have moved it.
  useEffect(() => {
    if (openId === null && returnFocusTo.current !== null) {
      document.querySelector<HTMLElement>(`[data-batch-id="${returnFocusTo.current}"]`)?.focus();
      returnFocusTo.current = null;
    }
  }, [openId]);

  // An error about an earlier state of the batch does not belong to its new state.
  useEffect(() => {
    action.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened?.passId, opened?.status]);

  const open = (id: number | null) => {
    action.clear();
    if (id !== null) returnFocusTo.current = id;
    setOpenId(id);
  };
  const act = async (fn: () => Promise<unknown>) => {
    if (await action.run(fn)) board.reload();
  };

  return (
    <main className="flex flex-1 flex-col gap-5 px-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-[-0.6px]">Production</h1>
          <p className="text-small text-text-2">{board.state.status === 'ready' ? subtitle(cards) : ' '}</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={onNew}>
          New batch
        </Button>
      </div>
      {board.staleError ? (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-small text-warn">
          Showing the last list. Can’t refresh right now: {board.staleError}
        </p>
      ) : null}
      {board.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading batches…</p> : null}
      {board.state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{board.state.message}</p>
          <Button onClick={board.reload}>Retry</Button>
        </div>
      ) : null}
      {board.state.status === 'ready' && cards.length === 0 ? <p className="text-body text-text-3">No batches yet. Create one to start.</p> : null}
      {cards.length > 0 ? <Board cards={cards} selectedBatchId={opened?.batchId ?? null} onOpen={(card) => open(card.batchId)} /> : null}
      {opened ? (
        <ReviewDrawer
          key={opened.batchId}
          card={opened}
          outputUrl={api.outputUrl(opened.passId)}
          busy={action.busy}
          error={action.error}
          onApprove={() => act(() => api.approve(opened.passId))}
          onRunAgain={() => act(() => api.runAgain(opened.batchId))}
          onResolve={(choice) => act(() => api.resolve(opened.passId, choice))}
          onClose={() => open(null)}
        />
      ) : null}
    </main>
  );
}
