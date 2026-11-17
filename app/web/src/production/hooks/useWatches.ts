import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadState } from '../../shared/hooks/useLoad';
import type { ProductionApi } from '../lib/api';
import type { WatchView } from '../lib/types';

const REFRESH_MS = 15000;

/**
 * The watches, refreshed quietly on a timer while the panel is open. A refresh that fails keeps the last list
 * and says so in `staleError`; it recovers by itself when the server answers again.
 */
export function useWatches(api: Pick<ProductionApi, 'watches'>, intervalMs = REFRESH_MS) {
  const [state, setState] = useState<LoadState<WatchView[]>>({ status: 'loading' });
  const [staleError, setStaleError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const haveList = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const data = await api.watches();
        if (!active) return;
        haveList.current = true;
        setState({ status: 'ready', data });
        setStaleError(null);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Something went wrong';
        if (haveList.current) setStaleError(message);
        else setState({ status: 'error', message });
      }
      if (active) timer = setTimeout(refresh, intervalMs);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, intervalMs]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, staleError, reload };
}
