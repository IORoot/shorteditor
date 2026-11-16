import type { Collector, CollectorConfig } from '../lib/types';

export function makeConfig(overrides: Partial<CollectorConfig> = {}): CollectorConfig {
  return {
    name: 'Coach Saturdays',
    sourceType: 'ssh',
    host: 'coach-nas',
    user: 'andy',
    keyPath: '~/.ssh/id_ed25519',
    inputFolder: '/volume1/clips',
    outputFolder: '/Volumes/Edit/Collected',
    folderTemplate: '{date:YYYY-MM-DD}_{weekday}_{suffix}',
    groupBy: 'day',
    transfer: 'move',
    suffix: 'coach',
    filters: [],
    dateSource: 'modified',
    filenamePattern: '',
    ...overrides,
  };
}

export function makeCollector(overrides: Partial<Collector> = {}): Collector {
  return {
    id: 1,
    name: 'Coach Saturdays',
    source: 'ssh://coach-nas/volume1/clips',
    transfer: 'move',
    config: makeConfig(),
    schedule: {
      enabled: true,
      kind: 'daily',
      time: '02:00',
      weekdays: [],
      dayOfMonth: 1,
      cron: '0 2 * * *',
      summary: 'Every day at 02:00',
      nextRun: 'Sun 02:00',
    },
    statusNote: null,
    ...overrides,
  };
}
