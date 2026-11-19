import { Check, Film } from 'lucide-react';
import { useState } from 'react';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { formatBytes } from '../../../shared/lib/format';
import { chipLabel, clock, lastSegment, queueCaption, stageSegments, toneOf } from '../../lib/board';
import type { BatchCard as Card } from '../../lib/types';
import { StageStrip } from './StageStrip';

/** While the board is choosing batches: whether this one is chosen, and whether it cannot be chosen now. */
export interface Picking {
  checked: boolean;
  blocked: boolean;
}

export interface BatchCardProps {
  card: Card;
  selected: boolean;
  onOpen: (card: Card) => void;
  picking?: Picking;
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

export function pickingOf(card: Card, chosen?: ReadonlySet<number>): Picking | undefined {
  if (!chosen) return undefined;
  return { checked: chosen.has(card.batchId), blocked: card.status === 'running' || card.status === 'queued' };
}

export function BatchCard({ card, selected, onOpen, picking }: BatchCardProps) {
  const label = chipLabel(card);
  const text = caption(card);
  const ring = picking?.checked ? 'ring-2 ring-primary' : selected ? 'ring-2 ring-primary' : '';
  return (
    <button
      type="button"
      aria-label={`${card.name}, ${label}`}
      aria-current={selected ? 'true' : undefined}
      aria-pressed={picking ? picking.checked : undefined}
      disabled={picking?.blocked}
      title={picking?.blocked ? 'Wait for this batch to finish before deleting it' : undefined}
      data-batch-id={card.batchId}
      onClick={() => onOpen(card)}
      className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl text-left shadow-[0_2px_12px_#0000000f] disabled:opacity-50 ${card.status === 'failed' ? 'bg-bad-soft' : 'bg-surface'} ${ring}`}
    >
      {picking ? (
        <span aria-hidden="true" className={`absolute right-3 top-3 z-10 grid size-6 place-items-center rounded-full border-2 border-surface ${picking.checked ? 'bg-primary text-on-accent' : 'bg-surface text-transparent'}`}>
          <Check size={14} />
        </span>
      ) : null}
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
