import { ArrowLeft, Film } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { ACTION_LABEL, cardCan } from '../../lib/actions';
import { chipLabel, lastSegment, queueCaption, toneOf } from '../../lib/board';
import type { ActionName, BatchCard, PipelineChoice } from '../../lib/types';
import { ConfirmDialog } from '../actions/ActionBar';
import { Breadcrumbs, type Crumb } from '../shared/Breadcrumbs';
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
  onResolve: (choice: string, picks?: number[], caption?: string) => void;
  onBack: () => void;
  /** The path to this card: Production › batch › card. When given, it replaces the back button. */
  crumbs?: Crumb[];
  /** How many clips the card scanned, once known. */
  clipCount?: number;
  /** The pipeline of the card as stages, under the header. */
  flow?: ReactNode;
  /** The render timeline, full width under the pipeline. */
  timeline?: ReactNode;
  /** The card's clips, on the left under the timeline. */
  clips?: ReactNode;
  /** The editor of the clip open in the sidebar. When given, it replaces the output panel there. */
  editor?: ReactNode;
  /** The two logs of the pass, along the bottom. */
  console?: ReactNode;
  /** Pause, resume, stop, run this card again or delete it. Hidden when the page cannot act. */
  onCardAction?: (action: ActionName) => void;
}

/** The actions this card can take, as buttons. Delete asks first. */
function CardActions({ card, busy, onAct }: { card: BatchCard; busy: boolean; onAct: (action: ActionName) => void }) {
  const [confirming, setConfirming] = useState(false);
  const actions: ActionName[] = (['pause', 'resume', 'stop', 'rerun'] as ActionName[]).filter((action) => cardCan(card.status, action));
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {actions.map((action) => (
        <Button key={action} disabled={busy} onClick={() => onAct(action)}>
          {action === 'rerun' ? 'Run this card again' : action === 'resume' && card.status === 'held' ? 'Start' : ACTION_LABEL[action]}
        </Button>
      ))}
      {cardCan(card.status, 'delete') ? <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>{ACTION_LABEL.delete}</Button> : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete this card?"
          body="The card leaves the board with its logs. Its output video on disk is kept. This can’t be undone."
          confirmLabel="Delete card"
          busy={busy}
          error={null}
          onConfirm={() => {
            setConfirming(false);
            onAct('delete');
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

/** The card's first clip, as a still; the film icon stays when there is no picture. */
function Thumbnail({ passId }: { passId: number }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fill-2 text-text-3">
      {missing ? <Film size={22} aria-hidden="true" /> : <img src={`/api/production/passes/${passId}/thumbnail`} alt="" onError={() => setMissing(true)} className="h-full w-full object-cover" />}
    </div>
  );
}

function progress(card: BatchCard): string {
  if (card.status === 'queued') return queueCaption(card) || 'Waiting in the queue';
  return card.stageTitle ? `${card.stageTitle} · stage ${card.stagePosition} of ${card.stageCount}` : 'Starting';
}

export function ReviewPage({ card, outputUrl, busy, error, pipelines, onApprove, onRunAgain, onResolve, onBack, crumbs, clipCount, flow, timeline, clips, editor, console: logs, onCardAction }: ReviewPageProps) {
  const finished = card.status === 'review' || card.status === 'approved';
  const subtitle = [card.folder, clipCount !== undefined ? `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}` : null, `${card.pipeline.length} stages`, card.runOn, `Pass ${card.passNumber}`]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <main aria-label="Review" className="flex min-w-0 flex-1 flex-col gap-3.5 px-2 pt-2">
      {crumbs ? (
        <Breadcrumbs crumbs={crumbs} />
      ) : (
        <button type="button" onClick={onBack} className="flex w-fit items-center gap-2 rounded-full px-2 py-1 text-small font-medium text-text-2 hover:bg-fill-2">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to Production
        </button>
      )}

      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Thumbnail passId={card.passId} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 title={card.folder} className="break-words text-h1 font-bold leading-tight tracking-[-0.6px]">{lastSegment(card.folder)}</h1>
            <p className="break-words text-small text-text-2">{subtitle}</p>
          </div>
          <StatusChip tone={toneOf(card)}>{chipLabel(card)}</StatusChip>
        </div>
        {onCardAction ? <CardActions card={card} busy={busy} onAct={onCardAction} /> : null}
      </header>

      {error ? <p role="alert" className="break-words rounded-xl bg-bad-soft px-4 py-3 text-small text-bad">{error}</p> : null}
      {flow}
      {timeline ? <div className="min-w-0">{timeline}</div> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0">{clips}</div>
        <aside aria-label={editor ? 'Clip' : 'Output'} className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-surface px-6 py-5">
          {editor ? editor : (
            <>
          {card.status === 'running' || card.status === 'queued' ? <p className="text-small text-text-2">{progress(card)}</p> : null}
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
          {card.status === 'failed' && !flow ? <p className="break-words text-small text-bad">{card.error}</p> : null}
          {card.status === 'review' ? (
            <div className="flex flex-col gap-4">
              {card.output ? <Button variant="primary" disabled={busy} onClick={onApprove}>Approve</Button> : null}
              <RunAgain currentPipelineId={card.pipelineId} pipelines={pipelines} busy={busy} onRunAgain={onRunAgain} />
            </div>
          ) : null}
          {card.status === 'failed' || card.status === 'approved' ? (
            <div>
              <RunAgain currentPipelineId={card.pipelineId} pipelines={pipelines} busy={busy} onRunAgain={onRunAgain} />
            </div>
          ) : null}
            </>
          )}
        </aside>
      </div>

      {logs ? <div className="min-w-0">{logs}</div> : null}
    </main>
  );
}
