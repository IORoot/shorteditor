import { describe, expect, it } from 'vitest';
import { makeCollector, makeConfig } from '../test/fixtures';
import { isOutdatedBackendConfig, normalizeCollector, normalizeConfig } from './normalize';
import type { CollectorConfig } from './types';

function oldBackendConfig(): CollectorConfig {
  const { filters, randomSelection, dateSource, filenamePattern, ...rest } = makeConfig();
  void filters; void randomSelection; void dateSource; void filenamePattern;
  return rest as CollectorConfig;
}

describe('normalizeConfig', () => {
  it('fills in the filter settings an older backend does not send', () => {
    const config = normalizeConfig(oldBackendConfig());
    expect(config.filters).toEqual([]);
    expect(config.randomSelection).toMatchObject({ enabled: false, mode: 'percent' });
    expect(config.dateSource).toBe('modified');
    expect(config.filenamePattern).toBe('');
  });

  it('leaves existing values alone', () => {
    const config = makeConfig({ filters: [{ rules: [] }], dateSource: 'filename', filenamePattern: 'X_YYYYMMDD' });
    expect(normalizeConfig(config)).toEqual(config);
  });

  it('does not share the default random selection between calls', () => {
    const a = normalizeConfig(oldBackendConfig());
    a.randomSelection.value = 99;
    expect(normalizeConfig(oldBackendConfig()).randomSelection.value).not.toBe(99);
  });
});

describe('normalizeCollector', () => {
  it('normalizes the nested config and keeps everything else', () => {
    const collector = { ...makeCollector(), config: oldBackendConfig() };
    const result = normalizeCollector(collector);
    expect(result.config.filters).toEqual([]);
    expect(result.name).toBe('Coach Saturdays');
    expect(result.schedule).toBe(collector.schedule);
  });
});

describe('isOutdatedBackendConfig', () => {
  it('detects a config without filters', () => {
    expect(isOutdatedBackendConfig(oldBackendConfig())).toBe(true);
    expect(isOutdatedBackendConfig(makeConfig())).toBe(false);
  });
});
