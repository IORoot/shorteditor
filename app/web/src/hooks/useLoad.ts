import { useCallback, useEffect, useState } from 'react';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

export function useLoad<T>(load: (() => Promise<T>) | null, deps: unknown[]): {
  state: LoadState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!load) return;
    let active = true;
    setState({ status: 'loading' });
    load()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Something went wrong';
        setState({ status: 'error', message });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}
