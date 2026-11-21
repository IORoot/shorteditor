import { useEffect, useState } from 'react';
import { useAction } from '../../../shared/hooks/useAction';
import { useLoad } from '../../../shared/hooks/useLoad';
import { useBoard } from '../../hooks/useBoard';
import type { ProductionApi } from '../../lib/api';
import { lastSegment } from '../../lib/board';
import { clipRows } from '../../lib/clips';
import type { ActionName, PipelineChoice } from '../../lib/types';
import { ClipEditor } from './ClipEditor';
import { ClipLibrary } from './ClipLibrary';
import { PassConsole } from './PassConsole';
import { PassFlow } from './PassFlow';
import { RenderTimeline } from './RenderTimeline';
import { ReviewPage } from './ReviewPage';
import { usePassLive } from './usePassLive';

export interface ReviewRouteProps {
  api: Pick<ProductionApi, 'cards' | 'approve' | 'runAgain' | 'resolve' | 'outputUrl' | 'pipelines' | 'batchDetail' | 'passLog' | 'cardActions' | 'saveTrims' | 'resetTrims' | 'clipUrl'>;
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
  // the batch gives the middle crumb, and the pass gives the stages, the timeline and the clips
  const live = usePassLive(api, card);
  // the clip open in the sidebar's editor, by file name
  const [openClip, setOpenClip] = useState<string | null>(null);
  const stages = live.pass?.stages ?? [];
  const scanned = stages.find((stage) => stage.key === 'scan_folder')?.details;
  const clipCount = scanned?.kind === 'clips' ? scanned.clips.length : undefined;
  const editing = openClip === null || !live.pass ? null : (clipRows(stages, live.pass.overrides).find((row) => row.name === openClip) ?? null);

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

  // Pause, resume, stop, run this card again or delete it. Deleting leaves the card, so the batch's board is next.
  const onCardAction = async (name: ActionName) => {
    const done = await action.run(async () => {
      const result = (await api.cardActions([card.passId], name)).results[0];
      if (!result?.ok) throw new Error(result?.message ?? 'Could not do that');
    });
    if (!done) return;
    if (name === 'delete') onBack(card.batchId);
    else board.reload();
  };

  return (
    <ReviewPage
      card={card}
      onCardAction={onCardAction}
      outputUrl={api.outputUrl(card.passId)}
      busy={action.busy}
      error={action.error}
      pipelines={pipelines.state.status === 'ready' ? pipelines.state.data : NO_PIPELINES}
      onApprove={() => act(() => api.approve(card.passId))}
      onRunAgain={async (pipelineId) => {
        // a new run replaces this card, so the batch's board is the place to go next
        if (await action.run(() => api.runAgain(card.batchId, pipelineId))) onBack(card.batchId);
      }}
      onResolve={(choice, picks, caption) => act(() => (caption !== undefined ? api.resolve(card.passId, choice, picks, caption) : picks ? api.resolve(card.passId, choice, picks) : api.resolve(card.passId, choice)))}
      onBack={() => onBack(card.batchId)}
      crumbs={[
        { label: 'Production', onOpen: () => onBack(null) },
        { label: live.batchName ?? 'Batch', onOpen: () => onBack(card.batchId) },
        { label: lastSegment(card.folder) },
      ]}
      clipCount={clipCount}
      flow={<PassFlow card={card} pass={live.pass} now={live.now} />}
      timeline={<RenderTimeline passId={card.passId} stages={stages} />}
      clips={<ClipLibrary passId={card.passId} stages={stages} overrides={live.pass?.overrides ?? {}} selected={openClip} onSelect={setOpenClip} />}
      editor={editing ? (
        <ClipEditor api={api} passId={card.passId} row={editing} running={card.status === 'running'} onSaved={live.reload} onClose={() => setOpenClip(null)} />
      ) : undefined}
      console={<PassConsole api={api} card={card} now={live.now} />}
    />
  );
}
