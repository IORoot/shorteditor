import { describe, expect, it } from 'vitest';
import { PATTERN_PRESETS, batchesNow, createCount, defaultManyForm, formFromWatch, manyIsValid, toBulkRequest, toWatchRequest, watchNameOf, wholeHint, type ManyForm } from './presets';
import type { WatchView } from './types';

const many = (over: Partial<ManyForm> = {}): ManyForm => ({ ...defaultManyForm(), parentFolder: '/Volumes/Edit/Collected', pipelineId: 1, ...over });

describe('the batch name and subfolders', () => {
  it('sends the typed batch name, or the parent folder name when it is blank', { tags: ['full'] }, () => {
    expect(toBulkRequest(many({ batchName: '  Coach Saturdays ' })).name).toBe('Coach Saturdays');
    expect(toBulkRequest(many({ batchName: '  ' })).name).toBe('Collected');
  });

  it('sends the ignore flag only when subfolders are ignored, and needs no pattern then', { tags: ['full'] }, () => {
    expect('ignoreSubfolders' in toBulkRequest(many())).toBe(false);
    expect(toBulkRequest(many({ ignoreSubfolders: true, pattern: '' })).ignoreSubfolders).toBe(true);
    expect(manyIsValid(many({ pattern: '' }))).toBe(false);
    expect(manyIsValid(many({ ignoreSubfolders: true, pattern: '' }))).toBe(true);
  });
});

describe('pattern presets', () => {
  it('offers a date-first pattern, any folder, and a custom one', { tags: ['full'] }, () => {
    expect(PATTERN_PRESETS.map((p) => p.id)).toEqual(['date', 'any', 'custom']);
    const date = new RegExp(PATTERN_PRESETS[0].pattern);
    expect(date.test('2026-11-07_Sat_coach')).toBe(true);
    expect(date.test('notes')).toBe(false);
    expect(new RegExp(PATTERN_PRESETS[1].pattern).test('anything at all')).toBe(true);
    expect(PATTERN_PRESETS[2].pattern).toBe('');
  });
});

describe('defaultManyForm', () => {
  it('starts on the date preset with no pipeline and the usual run settings', { tags: ['full'] }, () => {
    expect(defaultManyForm()).toEqual({
      parentFolder: '', presetId: 'date', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', batchName: '', ignoreSubfolders: false,
      outputRoot: '', folderTemplate: '{{name}}-{{id}}', runOn: 'any', pipelineId: null, autoRun: false,
      watching: false, watchName: '', watchExisting: false, intervalMinutes: '5', settleMinutes: '10', maxPerCheck: '20',
    });
  });
});

describe('watch fields', () => {
  it('accepts whole numbers inside the limits and explains the rest', { tags: ['full'] }, () => {
    expect(wholeHint('5', 1, 1440)).toBeNull();
    expect(wholeHint('0', 1, 1440)).toBe('Use a whole number from 1 to 1440');
    expect(wholeHint('2.5', 1, 100)).toBe('Use a whole number from 1 to 100');
    expect(wholeHint(' 7 ', 1, 100)).toBeNull();
  });

  it('names the watch after its folder when no name is typed', { tags: ['full'] }, () => {
    expect(watchNameOf(many({ watchName: '  Coach  ' }))).toBe('Coach');
    expect(watchNameOf(many({ parentFolder: '/Volumes/Edit/Collected/' }))).toBe('Collected');
  });

  it('needs valid watch numbers only while watching, and a pipeline always', () => {
    expect(manyIsValid(many({ intervalMinutes: '0' }))).toBe(true);
    expect(manyIsValid(many({ watching: true, intervalMinutes: '0' }))).toBe(false);
    expect(manyIsValid(many({ watching: true, maxPerCheck: '101' }))).toBe(false);
    expect(manyIsValid(many({ pipelineId: null }))).toBe(false);
  });

  it('sends a watch with its pipeline, pattern and settings, and keeps the output folder optional', { tags: ['full'] }, () => {
    const request = toWatchRequest(many({ watching: true, watchName: ' Coach ', maxPerCheck: '15', runOn: 'studio' }), true, false);
    expect(request).toEqual({
      name: 'Coach', parentFolder: '/Volumes/Edit/Collected', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', pipelineId: 1, runOn: 'studio',
      intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 15, includeExisting: true, enabled: false,
    });
    expect(toWatchRequest(many({ outputRoot: '/out' }), false).outputRoot).toBe('/out');
    expect('outputRoot' in toWatchRequest(many({ outputRoot: ' ' }), false)).toBe(false);
  });

  it('reads a saved watch back into the form, including its pipeline', { tags: ['full'] }, () => {
    const watch = {
      id: 3, name: 'Coach', parentFolder: '/c', pattern: '^.+$', nameTemplate: '{1} reel', pipelineId: 4, pipelineName: 'Short', runOn: 'studio', outputRoot: '/out',
      steps: [], intervalMinutes: 7, settleMinutes: 3, maxPerCheck: 9, enabled: false, createdAt: 'x', lastCheckedAt: null, lastError: null, waiting: [], createdTotal: 0,
      status: 'paused', statusLine: '',
    } as WatchView;
    expect(formFromWatch(watch)).toMatchObject({
      parentFolder: '/c', presetId: 'any', pattern: '^.+$', nameTemplate: '{1} reel', pipelineId: 4, runOn: 'studio', outputRoot: '/out', watching: true,
      watchName: 'Coach', intervalMinutes: '7', settleMinutes: '3', maxPerCheck: '9', watchExisting: false,
    });
  });
});

describe('batchesNow', () => {
  const preview = { matches: [
    { name: 'new1', path: '/p/new1', clipCount: 2, status: 'will_create' },
    { name: 'new2', path: '/p/new2', clipCount: 2, status: 'will_create' },
    { name: 'old', path: '/p/old', clipCount: 2, status: 'already_batched' },
  ] as never, notMatching: 0, truncated: false };

  it('counts the batches created now: one for a one-off run, or the existing folders when watching includes them', { tags: ['full'] }, () => {
    expect(batchesNow(many(), preview)).toBe(1);
    expect(batchesNow(many({ watching: true }), preview)).toBe(0);
    expect(batchesNow(many({ watching: true, watchExisting: true }), preview)).toBe(2);
  });
});

describe('toBulkRequest', () => {
  it('sends the parent folder, pattern, name, pipeline and run setting for one batch', { tags: ['full'] }, () => {
    expect(toBulkRequest(many({ nameTemplate: '{name} coach', runOn: 'studio' }))).toEqual({
      parentFolder: '/Volumes/Edit/Collected', pattern: PATTERN_PRESETS[0].pattern, name: 'Collected', nameTemplate: '{name} coach', runOn: 'studio', pipelineId: 1, autoRun: false,
    });
    expect(toBulkRequest(many({ outputRoot: ' /out ' })).outputRoot).toBe('/out');
  });
});

describe('createCount', () => {
  const preview = (statuses: string[]) => ({ matches: statuses.map((status, i) => ({ name: `f${i}`, path: `/p/f${i}`, clipCount: 1, status })) as never, notMatching: 0, truncated: false });
  it('is one batch when any folder will be created, and none when every folder is already batched or empty', { tags: ['full'] }, () => {
    expect(createCount(preview(['will_create', 'will_create', 'already_batched', 'no_videos', 'unreadable']))).toBe(1);
    expect(createCount(preview(['already_batched', 'no_videos']))).toBe(0);
  });
});
