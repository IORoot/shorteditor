import { useEffect, useRef, useState } from 'react';
import { useLoad } from '../../../shared/hooks/useLoad';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import type { ProductionApi } from '../../lib/api';
import { elapsed, clock, span, timelineRows, waitingSince, type TimelineRow } from '../../lib/passDetail';
import { StageDetailsView } from './StageDetails';
import type { BatchCard, LogEntry, Pass } from '../../lib/types';

const LIVE_MS = 1500;
const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';

export interface PassDetailProps {
  api: Pick<ProductionApi, 'batchDetail' | 'passLog'>;
  card: BatchCard;
}

/** Ticks once a second while the pass runs, so the timer and the wait for the AI count up on screen. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const CHIP: Record<TimelineRow['status'], { tone: 'ok' | 'info' | 'bad' | 'warn'; label: string }> = {
  running: { tone: 'info', label: 'Running' },
  done: { tone: 'ok', label: 'Done' },
  failed: { tone: 'bad', label: 'Failed' },
  blocked: { tone: 'warn', label: 'Waiting for you' },
  waiting: { tone: 'warn', label: 'Waiting' },
};

const NOW_TEXT: Record<BatchCard['status'], string> = {
  queued: 'Waiting in the queue',
  running: 'Running',
  review: 'Finished, ready to review',
  approved: 'Done',
  blocked: 'Waiting for your choice',
  paused: 'Paused, waiting to be resumed',
  held: 'Waiting to be started',
  stopped: 'Stopped',
  failed: 'Failed',
};

export function PassDetail({ api, card }: PassDetailProps) {
  const running = card.status === 'running';
  const now = useNow(running);
  const [kind, setKind] = useState<'pipeline' | 'ffmpeg'>('pipeline');
  const detail = useLoad(() => api.batchDetail(card.batchId), [card.batchId, card.passId]);
  const log = useLoad(() => api.passLog(card.passId, kind), [card.passId, kind]);
  const { reload: reloadDetail } = detail;
  const { reload: reloadLog } = log;

  // While the pass runs, the stages and the log are read again every second and a half; once it stops, one last read.
  useEffect(() => {
    reloadDetail();
    reloadLog();
  }, [card.status, reloadDetail, reloadLog]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      reloadDetail();
      reloadLog();
    }, LIVE_MS);
    return () => clearInterval(timer);
  }, [running, reloadDetail, reloadLog]);

  const pass: Pass | undefined = detail.state.status === 'ready' ? detail.state.data.passes.find((p) => p.id === card.passId) : undefined;
  const entries: LogEntry[] = log.state.status === 'ready' ? log.state.data.entries : [];
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (running && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries.length, running]);

  const rows = timelineRows(pass?.stages ?? [], card.pipeline);
  const failed = pass?.stages.find((stage) => stage.status === 'failed');
  const current = rows.find((row) => row.status === 'running');
  const taken = pass?.startedAt && (pass.finishedAt || running) ? elapsed(pass.startedAt, pass.finishedAt, now) : null;
  const waiting = kind === 'pipeline' ? waitingSince(entries) : null;

  return (
    <section aria-label="Pass details" className="flex min-w-0 flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-fill-2 p-4 text-small">
        <div><dt className={LABEL}>Pass</dt><dd className="font-semibold">{card.passNumber}</dd></div>
        <div><dt className={LABEL}>Now</dt><dd className="font-semibold">{running ? current?.title ?? 'Starting' : NOW_TEXT[card.status]}</dd></div>
        <div><dt className={LABEL}>Started</dt><dd className="font-semibold">{pass?.startedAt ? clock(pass.startedAt) : '—'}</dd></div>
        <div><dt className={LABEL}>Ended</dt><dd className="font-semibold">{pass?.finishedAt ? clock(pass.finishedAt) : '—'}</dd></div>
        <div className="col-span-2"><dt className={LABEL}>Time taken</dt><dd className="font-semibold tabular-nums">{taken === null ? '—' : span(taken)}</dd></div>
      </dl>

      {card.status === 'failed' ? (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-bad-soft p-4 text-small text-bad">
          <p className="font-semibold">{failed ? `Failed in "${failed.title}"` : 'Failed'}</p>
          <p className="break-words">{pass?.error ?? card.error}</p>
          <p className="text-caption">The log below has every step up to the failure.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className={LABEL}>Stages</h3>
        {rows.length === 0 ? <p className="text-small text-text-3">No stages have started yet.</p> : null}
        <ol aria-label="Stages" className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.key} aria-current={row.status === 'running' ? 'step' : undefined} className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 ${row.status === 'running' ? 'bg-accent-soft' : 'bg-fill-2'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-small font-semibold">{index + 1}. {row.title}</span>
                <StatusChip tone={CHIP[row.status].tone}>{CHIP[row.status].label}</StatusChip>
              </div>
              {row.startedAt ? (
                <span className="text-caption text-text-2 tabular-nums">
                  Started {clock(row.startedAt)}
                  {row.finishedAt ? ` · ended ${clock(row.finishedAt)} · took ${span(elapsed(row.startedAt, row.finishedAt, now))}` : ` · ${span(elapsed(row.startedAt, null, now))} so far`}
                </span>
              ) : null}
              {row.details ? <StageDetailsView details={row.details} /> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className={LABEL}>Log</h3>
          <SegmentedControl<'pipeline' | 'ffmpeg'>
            label="Log"
            options={[{ value: 'pipeline', label: 'Stages and AI' }, { value: 'ffmpeg', label: 'FFmpeg' }]}
            value={kind}
            onChange={setKind}
          />
        </div>
        {waiting ? (
          <p role="status" className="text-small font-semibold text-primary tabular-nums">
            Waiting for the AI since {clock(waiting)} · {span(now - Date.parse(waiting))}
          </p>
        ) : null}
        {log.state.status === 'error' ? <p role="alert" className="text-small text-bad">{log.state.message}</p> : null}
        {entries.length === 0 && log.state.status === 'ready' ? <p className="text-small text-text-3">Nothing logged yet.</p> : null}
        <ol ref={listRef} aria-label="Log lines" className="max-h-[420px] min-h-[120px] overflow-auto rounded-xl bg-fill-2 p-3 font-mono text-caption">
          {entries.map((entry, index) => (
            <li key={index} className="flex min-w-0 gap-3">
              <span className="shrink-0 text-text-3 tabular-nums">{clock(entry.at)}</span>
              <span className="min-w-0 break-words">{entry.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
