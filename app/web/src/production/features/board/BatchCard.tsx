import { Film } from 'lucide-react';
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
      <span className="flex h-24 items-center justify-center bg-fill-2 text-text-3">
        <Film size={22} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-2 p-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span title={card.name} className="truncate text-body font-semibold">{card.name}</span>
          <span className="truncate text-caption text-text-2">{lastSegment(card.inputFolder)} · {card.pipeline.length} {card.pipeline.length === 1 ? 'stage' : 'stages'}</span>
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
