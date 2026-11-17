import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../../shared/components/ui/Button';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { chipLabel, queueCaption, toneOf } from '../../lib/board';
import type { BatchCard } from '../../lib/types';
import { BlockedChoices } from './BlockedChoices';
import { OutputMeta } from './OutputMeta';
import { VideoPlayer } from './VideoPlayer';

export interface ReviewDrawerProps {
  card: BatchCard;
  outputUrl: string;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onRunAgain: () => void;
  onResolve: (choice: string) => void;
  onClose: () => void;
}

function progress(card: BatchCard): string {
  if (card.status === 'queued') return queueCaption(card) || 'Waiting in the queue';
  return card.stageTitle ? `${card.stageTitle} · stage ${card.stagePosition} of ${card.stageCount}` : 'Starting';
}

export function ReviewDrawer({ card, outputUrl, busy, error, onApprove, onRunAgain, onResolve, onClose }: ReviewDrawerProps) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The button the user pressed can disappear when the status changes; keep focus inside the drawer.
  useEffect(() => {
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
  }, [card.status, card.passId]);

  const finished = card.status === 'review' || card.status === 'approved';
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="Review"
      className="fixed bottom-4 right-4 top-[84px] z-20 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[20px] bg-surface p-6 shadow-[-8px_8px_40px_#00000033] focus:outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold">Review</h2>
        <button ref={closeButton} type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-text-2 hover:bg-fill-2">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p title={card.name} className="break-words text-[22px] font-bold leading-tight tracking-[-0.4px]">{card.name}</p>
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
            <BlockedChoices choices={card.blockedChoices} busy={busy} onChoose={onResolve} />
          ) : (
            <p className="text-small text-text-3">No choices were offered for this block.</p>
          )}
        </>
      ) : null}
      {card.status === 'failed' ? <p className="break-words text-small text-bad">{card.error}</p> : null}
      {card.status === 'running' || card.status === 'queued' ? <p className="text-small text-text-2">{progress(card)}</p> : null}
      {card.status === 'review' ? (
        <div className="mt-auto flex gap-2.5 pt-2">
          {card.output ? <Button variant="primary" disabled={busy} onClick={onApprove}>Approve</Button> : null}
          <Button disabled={busy} onClick={onRunAgain}>Run again</Button>
        </div>
      ) : null}
      {card.status === 'failed' || card.status === 'approved' ? (
        <div className="mt-auto flex gap-2.5 pt-2">
          <Button disabled={busy} onClick={onRunAgain}>Run again</Button>
        </div>
      ) : null}
    </aside>
  );
}
