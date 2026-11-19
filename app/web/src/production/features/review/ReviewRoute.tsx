import { useEffect } from 'react';
import { useAction } from '../../../shared/hooks/useAction';
import { useLoad } from '../../../shared/hooks/useLoad';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import type { PipelineChoice } from '../../lib/types';
import { PassDetail } from './PassDetail';
import { ReviewPage } from './ReviewPage';

export interface ReviewRouteProps {
  api: Pick<ProductionApi, 'cards' | 'approve' | 'runAgain' | 'resolve' | 'outputUrl' | 'pipelines' | 'batchDetail' | 'passLog'>;
  /** The card whose review page this is. */
  cardId: number;
  /** Goes back to the batch's board; null when the card is no longer there. */
  onBack: (batchId: number | null) => void;
}

const NO_PIPELINES: PipelineChoice[] = [];

/** The review page of one card: finds it on the board, keeps it fresh and runs its actions. */
export function ReviewRoute({ api, cardId, onBack }: ReviewRouteProps) {
  const board = useBoard(api);
  const action = useAction();
  const pipelines = useLoad(() => api.pipelines(), []);
  const cards = board.state.status === 'ready' ? board.state.data : [];
  const card = cards.find((c) => c.passId === cardId) ?? null;

  // An error about an earlier state of the pass does not belong to its new state.
  useEffect(() => {
    action.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.passId, card?.status]);

  const act = async (fn: () => Promise<unknown>) => {
    if (await action.run(fn)) board.reload();
  };

  if (!card) {
    return (
      <main aria-label="Review" className="flex flex-col items-start gap-4 px-2">
        <button type="button" onClick={() => onBack(null)} className="rounded-full px-2 py-1 text-small font-medium text-text-2 hover:bg-fill-2">Back to Production</button>
        {board.state.status === 'ready' ? <p className="text-body text-text-3">This batch is no longer on the board.</p> : null}
        {board.state.status === 'loading' ? <p role="status" className="text-small text-text-3">Loading the batch…</p> : null}
        {board.state.status === 'error' ? <p role="alert" className="text-small text-bad">{board.state.message}</p> : null}
      </main>
    );
  }

  return (
    <ReviewPage
      card={card}
      outputUrl={api.outputUrl(card.passId)}
      busy={action.busy}
      error={action.error}
      pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
      onApprove={() => act(() => api.approve(card.passId))}
      onRunAgain={async (pipelineId) => {
        // a new run replaces this card, so the batch's board is the place to go next
        if (await action.run(() => api.runAgain(card.batchId, pipelineId))) onBack(card.batchId);
      }}
      onResolve={(choice, picks) => act(() => (picks ? api.resolve(card.passId, choice, picks) : api.resolve(card.passId, choice)))}
      onBack={() => onBack(card.batchId)}
      detail={<PassDetail api={api} card={card} />}
    />
  );
}
