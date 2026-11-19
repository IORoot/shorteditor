import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { chipLabel, queueCaption, toneOf } from '../../lib/board';
import type { BatchCard, PipelineChoice } from '../../lib/types';
import { BlockedChoices } from './BlockedChoices';
import { OutputMeta } from './OutputMeta';
import { RunAgain } from './RunAgain';
import { VideoPlayer } from './VideoPlayer';

export interface ReviewPageProps {
  card: BatchCard;
  outputUrl: string;
  busy: boolean;
  error: string | null;
  pipelines: PipelineChoice[];
  onApprove: () => void;
  onRunAgain: (pipelineId: number) => void;
  onResolve: (choice: string, picks?: number[]) => void;
  onBack: () => void;
  /** What the pass is doing: stages, timer and log. Shown beside the video and the choices. */
  detail?: ReactNode;
}

function progress(card: BatchCard): string {
  if (card.status === 'queued') return queueCaption(card) || 'Waiting in the queue';
  return card.stageTitle ? `${card.stageTitle} · stage ${card.stagePosition} of ${card.stageCount}` : 'Starting';
}

export function ReviewPage({ card, outputUrl, busy, error, pipelines, onApprove, onRunAgain, onResolve, onBack, detail }: ReviewPageProps) {
  const finished = card.status === 'review' || card.status === 'approved';
  return (
    <main aria-label="Review" className="flex min-w-0 flex-1 flex-col gap-6 px-2">
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-2 rounded-full px-2 py-1 text-small font-medium text-text-2 hover:bg-fill-2">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to Production
      </button>
      <div className={`grid min-w-0 gap-8 ${detail ? 'lg:grid-cols-[440px_minmax(0,1fr)]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 title={card.name} className="break-words text-h1 font-bold leading-tight tracking-[-0.6px]">{card.name}</h1>
            <p className="break-words text-small text-text-2">Pass {card.passNumber} · {card.inputFolder}</p>
            <div className="pt-1"><StatusChip tone={toneOf(card)}>{chipLabel(card)}</StatusChip></div>
          </div>
          {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
          {finished && card.output ? (
            <>
              <VideoPlayer src={outputUrl} />
              <OutputMeta output={card.output} />
            </>
          ) : null}
          {card.status === 'blocked' ? (
            <>
              <p className="break-words text-small text-text-2">{card.blockedReason}</p>
              {card.blockedChoices.length > 0 ? (
                <BlockedChoices choices={card.blockedChoices} items={card.blockedItems} busy={busy} onChoose={onResolve} />
              ) : (
                <p className="text-small text-text-3">No choices were offered for this block.</p>
              )}
            </>
          ) : null}
          {card.status === 'failed' && !detail ? <p className="break-words text-small text-bad">{card.error}</p> : null}
          {card.status === 'running' || card.status === 'queued' ? <p className="text-small text-text-2">{progress(card)}</p> : null}
          {card.status === 'review' ? (
            <div className="flex flex-col gap-4 pt-2">
              {card.output ? <Button variant="primary" disabled={busy} onClick={onApprove}>Approve</Button> : null}
              <RunAgain currentPipelineId={card.pipelineId} pipelines={pipelines} busy={busy} onRunAgain={onRunAgain} />
            </div>
          ) : null}
          {card.status === 'failed' || card.status === 'approved' ? (
            <div className="pt-2">
              <RunAgain currentPipelineId={card.pipelineId} pipelines={pipelines} busy={busy} onRunAgain={onRunAgain} />
            </div>
          ) : null}
        </div>
        {detail ? <div className="min-w-0">{detail}</div> : null}
      </div>
    </main>
  );
}
