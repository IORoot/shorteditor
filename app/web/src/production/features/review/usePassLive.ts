import { useEffect, useState } from 'react';
import { useLoad } from '../../../shared/hooks/useLoad';
import type { ProductionApi } from '../../lib/api';
import type { BatchCard, Pass } from '../../lib/types';

export const LIVE_MS = 1500;

export interface PassLive {
  /** The batch's name, for the middle crumb; undefined until the batch is read. */
  batchName: string | undefined;
  /** The card's pass with its stages, once the batch is read. */
  pass: Pass | undefined;
  /** The clock, ticking once a second while the pass runs. */
  now: number;
  /** Reads the batch again now, for example after a trim is saved. */
  reload: () => void;
}

/**
 * Reads the batch that holds the card and, while the card runs, reads it again every second and a half.
 * The page's stages, timeline and crumbs all come from this one read.
 */
export function usePassLive(api: Pick<ProductionApi, 'batchDetail'>, card: BatchCard | null): PassLive {
  const batchId = card?.batchId ?? null;
  const passId = card?.passId ?? null;
  const status = card?.status ?? null;
  const stagePosition = card?.stagePosition ?? null;
  const running = status === 'running';
  const now = useTicker(running);

  const detail = useLoad(
    () => (batchId === null ? Promise.resolve(null) : api.batchDetail(batchId)),
    [batchId, passId, status, stagePosition],
  );
  const { reload } = detail;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, LIVE_MS);
    return () => clearInterval(timer);
  }, [running, reload]);

  const data = detail.state.status === 'ready' ? detail.state.data : null;
  return {
    batchName: data?.batch.name,
    pass: data && passId !== null ? data.passes.find((p) => p.id === passId) : undefined,
    now,
    reload,
  };
}

/** A clock that ticks once a second while active, so timers on screen count up. */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
