import { Film } from 'lucide-react';
import { useState } from 'react';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { formatBytes } from '../../../shared/lib/format';
import { chipLabel, clock, lastSegment, queueCaption, stageSegments, toneOf } from '../../lib/board';
import type { BatchCard as Card } from '../../lib/types';
import { StageStrip } from './StageStrip';

export interface BatchCardProps {
  card: Card;
  selected: boolean;
  onOpen: (card: Card) => void;
}

function caption(card: Card): string {
  switch (card.status) {
    case 'running':
      return card.stageTitle;
    case 'queued':
      return queueCaption(card);
    case 'blocked':
      return card.blockedReason ?? '';
    case 'failed':
      return card.error ?? '';
    default:
      return card.output ? `${formatBytes(card.output.sizeBytes)} · ${clock(card.output.duration)}` : '';
  }
}

/** A still from the batch's first clip; the film icon stays when there is no picture. */
function Picture({ batchId }: { batchId: number }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="flex h-24 items-center justify-center overflow-hidden bg-fill-2 text-text-3">
      {missing ? <Film size={22} aria-hidden="true" /> : <img src={`/api/production/batches/${batchId}/thumbnail`} alt="" onError={() => setMissing(true)} className="h-full w-full object-cover" />}
    </span>
  );
}

export function BatchCard({ card, selected, onOpen }: BatchCardProps) {
  const label = chipLabel(card);
  const text = caption(card);
  return (
    <button
      type="button"
      aria-label={`${card.name}, ${label}`}
      aria-current={selected ? 'true' : undefined}
      data-batch-id={card.batchId}
      onClick={() => onOpen(card)}
      className={`flex w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-[0_2px_12px_#0000000f] ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <Picture batchId={card.batchId} />
      <span className="flex min-w-0 flex-col gap-2 p-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span title={card.name} className="truncate text-body font-semibold">{card.name}</span>
          <span className="truncate text-caption text-text-2">{lastSegment(card.inputFolder)} · {card.pipelineName ?? 'Own steps'} · {card.pipeline.length} {card.pipeline.length === 1 ? 'stage' : 'stages'}</span>
        </span>
        <StageStrip segments={stageSegments(card)} />
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span title={text} className="truncate text-caption text-text-2">{text}</span>
          <span className="shrink-0"><StatusChip tone={toneOf(card)}>{label}</StatusChip></span>
        </span>
      </span>
    </button>
  );
}
