import { ArrowDownUp, ChevronRight, Clapperboard, Film, FolderSearch, Hand, LucideIcon, Pencil, ScanEye, Scissors, ListOrdered, Circle } from 'lucide-react';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { clock, elapsed, span, timelineRows, type TimelineRow } from '../../lib/passDetail';
import { stageSummary } from '../../lib/stageSummary';
import type { BatchCard, Pass } from '../../lib/types';
import { StageDetailsView } from './StageDetails';

const CHIP: Record<TimelineRow['status'], { tone: 'ok' | 'info' | 'bad' | 'warn'; label: string }> = {
  running: { tone: 'info', label: 'Running' },
  done: { tone: 'ok', label: 'Done' },
  failed: { tone: 'bad', label: 'Failed' },
  blocked: { tone: 'warn', label: 'Waiting for you' },
  waiting: { tone: 'warn', label: 'Waiting' },
};

/** The icon of each stage, as the design shows it. A stage without one of its own gets a plain step icon. */
const ICON: Record<string, LucideIcon> = {
  scan_folder: FolderSearch,
  order_clips: ArrowDownUp,
  detect_action: ScanEye,
  limit_length: Scissors,
  apply_trims: Pencil,
  join_pieces: ListOrdered,
  render_output: Clapperboard,
  ffmpeg: Film,
  review_by_hand: Hand,
};

const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';

export interface PassFlowProps {
  card: BatchCard;
  pass: Pass | undefined;
  now: number;
}

/** The pipeline of the card as a row of stage boxes joined by chevrons, with the failure reason above it when the pass failed. */
export function PassFlow({ card, pass, now }: PassFlowProps) {
  const rows = timelineRows(pass?.stages ?? [], card.pipeline);
  const failed = pass?.stages.find((stage) => stage.status === 'failed');
  const running = card.status === 'running';
  const taken = pass?.startedAt && (pass.finishedAt || running) ? elapsed(pass.startedAt, pass.finishedAt, now) : null;
  const detailed = rows.flatMap((row) => (row.details ? [{ key: row.key, title: row.title, details: row.details }] : []));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {card.status === 'failed' ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-2xl bg-bad-soft px-4 py-3 text-small text-bad">
          <p className="font-semibold">{failed ? `Failed in "${failed.title}"` : 'Failed'}</p>
          <p className="break-words">{pass?.error ?? card.error}</p>
          <p className="text-caption">The console below has every step up to the failure.</p>
        </div>
      ) : null}

      <section aria-label="Pipeline" className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-surface px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={LABEL}>Pipeline</h2>
          {pass?.startedAt ? (
            <p className="text-caption text-text-2 tabular-nums">
              Started {clock(pass.startedAt)}
              {taken === null ? '' : ` · took ${span(taken)}`}
            </p>
          ) : null}
        </div>
        {rows.length === 0 ? <p className="text-small text-text-3">No stages have started yet.</p> : null}
        <ol aria-label="Stages" className="flex min-w-0 items-center gap-0 overflow-x-auto pb-1">
          {rows.map((row, index) => {
            const Icon = ICON[row.key] ?? Circle;
            return (
              <li key={row.key} aria-current={row.status === 'running' ? 'step' : undefined} className="flex min-w-[150px] flex-1 items-center">
                <div className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-[14px] px-3 py-2.5 ${row.status === 'running' ? 'border-2 border-accent bg-accent-soft' : 'bg-fill-2'}`}>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon size={15} aria-hidden="true" className="shrink-0" />
                      <span className="truncate text-small font-semibold">{row.title}</span>
                    </span>
                    <StatusChip tone={CHIP[row.status].tone}>{CHIP[row.status].label}</StatusChip>
                  </div>
                  <span className="text-caption text-text-2 tabular-nums">{stageSummary(row, now)}</span>
                </div>
                {index < rows.length - 1 ? (
                  <span aria-hidden="true" className="flex w-6 shrink-0 items-center justify-center">
                    <ChevronRight size={18} className="text-text-3" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {detailed.length > 0 ? (
          <details className="text-small">
            <summary className="cursor-pointer font-semibold text-text-2">Stage details</summary>
            <div className="mt-2 flex flex-col gap-3">
              {detailed.map((row) => (
                <div key={row.key} className="flex flex-col gap-1.5">
                  <p className="font-semibold">{row.title}</p>
                  <StageDetailsView details={row.details} />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
