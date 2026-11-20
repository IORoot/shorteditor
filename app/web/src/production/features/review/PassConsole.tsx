import { useEffect, useRef, type ReactNode } from 'react';
import { Clapperboard, Terminal } from 'lucide-react';
import { useLoad } from '../../../shared/hooks/useLoad';
import type { ProductionApi } from '../../lib/api';
import { clock, span, waitingSince } from '../../lib/passDetail';
import type { BatchCard, LogEntry } from '../../lib/types';
import { LIVE_MS } from './usePassLive';

const LABEL = 'text-label font-semibold uppercase tracking-[0.8px] text-text-3';

export interface PassConsoleProps {
  api: Pick<ProductionApi, 'passLog'>;
  card: BatchCard;
  now: number;
}

/** The two logs of the pass side by side: the stages and the AI, and FFmpeg. Both are read again while the pass runs. */
export function PassConsole({ api, card, now }: PassConsoleProps) {
  return (
    <section aria-label="Console" className="grid min-w-0 gap-4 lg:grid-cols-2">
      <LogPanel api={api} card={card} kind="pipeline" title="Pipeline log" icon={<Terminal size={14} aria-hidden="true" />} now={now} />
      <LogPanel api={api} card={card} kind="ffmpeg" title="FFmpeg log" icon={<Clapperboard size={14} aria-hidden="true" />} now={now} />
    </section>
  );
}

interface LogPanelProps extends PassConsoleProps {
  kind: 'pipeline' | 'ffmpeg';
  title: string;
  icon: ReactNode;
}

function LogPanel({ api, card, kind, title, icon, now }: LogPanelProps) {
  const running = card.status === 'running';
  const log = useLoad(() => api.passLog(card.passId, kind), [card.passId, kind]);
  const { reload } = log;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, LIVE_MS);
    return () => clearInterval(timer);
  }, [running, reload]);

  const entries: LogEntry[] = log.state.status === 'ready' ? log.state.data.entries : [];
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (running && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries.length, running]);

  const waiting = kind === 'pipeline' ? waitingSince(entries) : null;

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-[20px] bg-surface px-5 py-3.5">
      <div className="flex items-center gap-2 text-text-2">
        {icon}
        <h2 className={LABEL}>{title}</h2>
      </div>
      {waiting ? (
        <p role="status" className="text-small font-semibold text-primary tabular-nums">
          Waiting for the AI since {clock(waiting)} · {span(now - Date.parse(waiting))}
        </p>
      ) : null}
      {log.state.status === 'error' ? <p role="alert" className="text-small text-bad">{log.state.message}</p> : null}
      {entries.length === 0 && log.state.status === 'ready' ? <p className="text-small text-text-3">Nothing logged yet.</p> : null}
      <ol ref={listRef} aria-label={`${title} lines`} className="max-h-[320px] min-h-[120px] overflow-auto rounded-xl bg-fill-2 p-3 font-mono text-caption">
        {entries.map((entry, index) => (
          <li key={index} className="flex min-w-0 gap-3">
            <span className="shrink-0 text-text-3 tabular-nums">{clock(entry.at)}</span>
            <span className="min-w-0 break-words">{entry.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
