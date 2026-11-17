import { useEffect, useRef, useState } from 'react';
import type { FolderPreview } from '../lib/types';

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: FolderPreview; refreshing: boolean }
  | { status: 'error'; message: string };

type Ask = (parentFolder: string, pattern: string, outputRoot?: string) => Promise<FolderPreview>;

/**
 * The folders a pattern finds inside a parent folder. It waits until typing pauses, asks once, ignores answers to
 * older questions, and keeps showing the last list (marked refreshing) while the next one loads.
 */
export function useFolderPreview(ask: Ask, parentFolder: string, pattern: string, outputRoot: string, delayMs = 400, enabled = true): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const askRef = useRef(ask);
  askRef.current = ask;
  const latest = useRef(0);

  useEffect(() => {
    const parent = parentFolder.trim();
    if (!enabled || parent === '' || pattern.trim() === '') {
      latest.current += 1;
      setState({ status: 'idle' });
      return;
    }
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      setState((current) => (current.status === 'ready' ? { ...current, refreshing: true } : { status: 'loading' }));
      askRef.current(parent, pattern, outputRoot.trim() || undefined).then(
        (data) => mine === latest.current && setState({ status: 'ready', data, refreshing: false }),
        (error: unknown) => mine === latest.current && setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' }),
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      latest.current += 1;
    };
  }, [parentFolder, pattern, outputRoot, delayMs, enabled]);

  return state;
}
