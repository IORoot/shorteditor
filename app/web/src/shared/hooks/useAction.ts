import { useCallback, useRef, useState } from 'react';

/** Runs one action at a time. A second call while one is running is ignored, so a double click sends one request. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Something went wrong');
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => setError(null), []);
  return { run, busy, error, clear };
}
