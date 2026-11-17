import { describe, expect, it } from 'vitest';
import { makeCollector, makeConfig } from '../test/fixtures';
import { newRule } from './filters';
import { isOutdatedBackendConfig, normalizeCollector, normalizeConfig } from './normalize';
import type { CollectorConfig } from './types';

function oldBackendConfig(): CollectorConfig {
  const { filters, dateSource, filenamePattern, ...rest } = makeConfig();
  void filters; void dateSource; void filenamePattern;
  return rest as CollectorConfig;
}

describe('normalizeConfig', () => {
  it('fills in the filter settings an older backend does not send', () => {
    const config = normalizeConfig(oldBackendConfig());
    expect(config.filters).toEqual([]);
    expect(config.dateSource).toBe('modified');
    expect(config.filenamePattern).toBe('');
  });

  it('leaves existing values alone', () => {
    const config = makeConfig({ filters: [{ rules: [] }], dateSource: 'filename', filenamePattern: 'X_YYYYMMDD' });
    expect(normalizeConfig(config)).toEqual(config);
  });

  it('gives old filter rules a default random setting and the other defaults', () => {
    const config = normalizeConfig(makeConfig({ filters: [{ rules: [{ ...newRule('name'), random: undefined as never }] }] }));
    expect(config.filters[0].rules[0]).toMatchObject({ caseSensitive: false, dateSource: 'modified', random: { enabled: true, value: 10 } });
  });

  it('does not share the default random setting between rules', () => {
    const a = normalizeConfig(oldBackendConfig());
    a.filters = [{ rules: [{ ...newRule('random') }] }];
    const b = normalizeConfig(oldBackendConfig());
    b.filters = [{ rules: [{ ...newRule('random') }] }];
    a.filters[0].rules[0].random.value = 99;
    expect(b.filters[0].rules[0].random.value).not.toBe(99);
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
