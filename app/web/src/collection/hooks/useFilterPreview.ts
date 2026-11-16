import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CollectorConfig, FilterPreviewResult } from '../lib/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLoad } from '../../hooks/useLoad';

export interface FilterPreviewState {
  result: FilterPreviewResult | null;
  error: string | null;
  pending: boolean;
  reload: () => void;
}

/** Only the settings that change which files are collected; output naming is left out so typing it doesn't re-scan. */
function relevant(config: CollectorConfig): string {
  const { inputFolder, outputFolder, sourceType, filters, dateSource, filenamePattern, groupBy, folderTemplate, suffix } = config;
  return JSON.stringify({ inputFolder, outputFolder, sourceType, filters, dateSource, filenamePattern, groupBy, folderTemplate, suffix });
}

/** Keeps the last good result while a new one loads, so rows can fade between states. */
export function useFilterPreview(config: CollectorConfig, delayMs = 300): FilterPreviewState {
  const key = relevant(config);
  const latest = useRef(config);
  latest.current = config;
  const debounced = useDebouncedValue(key, delayMs);
  const { state, reload } = useLoad(() => api.previewFilters(latest.current), [debounced]);
  const [result, setResult] = useState<FilterPreviewResult | null>(null);
  useEffect(() => {
    if (state.status === 'ready') setResult(state.data);
  }, [state]);
  return {
    result,
    error: state.status === 'error' ? state.message : null,
    pending: state.status === 'loading' || debounced !== key,
    reload,
  };
}
