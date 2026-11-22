import { defaultRandom } from './filters';
import type { Collector, CollectorConfig, FilterRule } from './types';

/** Rules saved before these fields existed get the defaults. */
function normalizeRule(rule: FilterRule): FilterRule {
  return {
    ...rule,
    caseSensitive: rule.caseSensitive ?? false,
    dateSource: rule.dateSource ?? 'modified',
    filenamePattern: rule.filenamePattern ?? '',
    random: rule.random ?? { ...defaultRandom },
  };
}

export function normalizeConfig(config: CollectorConfig): CollectorConfig {
  return {
    ...config,
    filters: (config.filters ?? []).map((group) => ({ ...group, rules: group.rules.map(normalizeRule) })),
    dateSource: config.dateSource ?? 'modified',
    filenamePattern: config.filenamePattern ?? '',
  };
}

export function normalizeCollector(collector: Collector): Collector {
  const { schedule } = collector;
  const filled = { ...schedule, mode: schedule.mode ?? 'schedule', pollSeconds: schedule.pollSeconds ?? 60, settleSeconds: schedule.settleSeconds ?? 120, maxFiles: schedule.maxFiles ?? 50, lastChecked: schedule.lastChecked ?? null };
  return { ...collector, active: collector.active ?? true, schedule: filled, config: normalizeConfig(collector.config) };
}

export function isOutdatedBackendConfig(config: CollectorConfig): boolean {
  return config.filters === undefined;
}
