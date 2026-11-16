import { defaultRandom } from './filters';
import type { Collector, CollectorConfig } from './types';

export function normalizeConfig(config: CollectorConfig): CollectorConfig {
  return {
    ...config,
    filters: config.filters ?? [],
    randomSelection: config.randomSelection ?? { ...defaultRandom },
    dateSources: config.dateSources ?? ['mtime'],
    filenamePattern: config.filenamePattern ?? '',
  };
}

export function normalizeCollector(collector: Collector): Collector {
  return { ...collector, config: normalizeConfig(collector.config) };
}

export function isOutdatedBackendConfig(config: CollectorConfig): boolean {
  return config.filters === undefined;
}
