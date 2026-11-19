import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadState } from '../../shared/hooks/useLoad';
import type { ProductionApi } from '../lib/api';
import type { BatchListItem } from '../lib/types';

const FAST_MS = 2000;
const SLOW_MS = 10000;
const ANSWER_TIMEOUT_MS = 10000;

/** A server that accepts the connection and never answers must show up as a failure, not a frozen list. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The server did not answer in time')), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Loads the batch list and keeps it fresh: every couple of seconds while a batch is queued or running, slowly otherwise.
 * A refresh never shows "Loading" again; if one fails the last list stays on screen and `staleError` says so.
 */
export function useBatchList(api: Pick<ProductionApi, 'batchList'>, fastMs = FAST_MS, slowMs = SLOW_MS, timeoutMs = ANSWER_TIMEOUT_MS) {
  const [state, setState] = useState<LoadState<BatchListItem[]>>({ status: 'loading' });
  const [staleError, setStaleError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const latest = useRef<BatchListItem[] | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const items = await withTimeout(api.batchList(), timeoutMs);
        if (!active) return;
        latest.current = items;
        setState({ status: 'ready', data: items });
        setStaleError(null);
        timer = setTimeout(refresh, items.some((item) => item.status === 'queued' || item.status === 'running') ? fastMs : slowMs);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Something went wrong';
        if (latest.current) setStaleError(message);
        else setState({ status: 'error', message });
        timer = setTimeout(refresh, slowMs);
      }
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reload = useCallback(() => {
    if (!latest.current) setState({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);

  return { state, staleError, reload };
}
