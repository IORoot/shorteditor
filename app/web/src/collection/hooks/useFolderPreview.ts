import { api } from '../lib/api';
import type { CollectorConfig, FolderPreview } from '../lib/types';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { useLoad, type LoadState } from '../../shared/hooks/useLoad';

export function useFolderPreview(config: CollectorConfig, sampleDate: string, delayMs = 250): LoadState<FolderPreview> {
  const key = JSON.stringify({
    folderTemplate: config.folderTemplate,
    outputFolder: config.outputFolder,
    groupBy: config.groupBy,
    suffix: config.suffix,
    sampleDate,
  });
  const debounced = useDebouncedValue(key, delayMs);
  const { state } = useLoad(() => api.previewFolder(JSON.parse(debounced)), [debounced]);
  return state;
}
