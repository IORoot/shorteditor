import { describe, expect, it } from 'vitest';
import { PATTERN_PRESETS, batchesNow, createCount, defaultForm, defaultManyForm, formFromWatch, isValid, manyIsValid, toBulkRequest, toRequest, toWatchRequest, watchNameOf, wholeHint, type ManyForm, type NewBatchForm } from './presets';
import type { WatchView } from './types';

const form = (over: Partial<NewBatchForm> = {}): NewBatchForm => ({ ...defaultForm(), name: 'Coach Saturdays', inputFolder: '/clips/coach', pipelineId: 1, ...over });
const many = (over: Partial<ManyForm> = {}): ManyForm => ({ ...defaultManyForm(), parentFolder: '/Volumes/Edit/Collected', pipelineId: 1, ...over });

describe('defaultForm', () => {
  it('starts with no pipeline chosen and no output folder of its own', { tags: ['full'] }, () => {
    expect(defaultForm()).toEqual({ name: '', inputFolder: '', outputRoot: '', runOn: 'any', pipelineId: null });
  });
});

describe('isValid', () => {
  it('needs a name, a folder and a pipeline', { tags: ['full'] }, () => {
    expect(isValid(form())).toBe(true);
    expect(isValid(form({ name: '   ' }))).toBe(false);
    expect(isValid(form({ inputFolder: '' }))).toBe(false);
    expect(isValid(form({ pipelineId: null }))).toBe(false);
  });
});

describe('toRequest', () => {
  it('sends trimmed text, the pipeline and where it runs', () => {
    expect(toRequest(form({ name: '  Coach Saturdays ', runOn: 'studio' }))).toEqual({ name: 'Coach Saturdays', inputFolder: '/clips/coach', pipelineId: 1, runOn: 'studio' });
  });

  it('leaves the output folder out when it is empty so the server default applies, and sends it when set', { tags: ['full'] }, () => {
    expect('outputRoot' in toRequest(form({ outputRoot: '  ' }))).toBe(false);
    expect(toRequest(form({ outputRoot: '/Volumes/Edit/Reels' })).outputRoot).toBe('/Volumes/Edit/Reels');
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
      parentFolder: '', presetId: 'date', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', include: [],
      outputRoot: '', runOn: 'any', pipelineId: null,
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

  it('counts the batches created now: the one-off ones, or the existing folders when watching includes them', { tags: ['full'] }, () => {
    expect(batchesNow(many({ include: ['old'] }), preview)).toBe(3);
    expect(batchesNow(many({ watching: true, include: ['old'] }), preview)).toBe(0);
    expect(batchesNow(many({ watching: true, watchExisting: true, include: ['old'] }), preview)).toBe(2);
  });
});

describe('toBulkRequest', () => {
  it('sends the pattern, template, pipeline and the folders to include again', { tags: ['full'] }, () => {
    expect(toBulkRequest(many({ nameTemplate: '{1} coach', include: ['2026-11-07_a'], runOn: 'studio' }))).toEqual({
      parentFolder: '/Volumes/Edit/Collected', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{1} coach', runOn: 'studio',
      include: ['2026-11-07_a'], pipelineId: 1,
    });
    expect(toBulkRequest(many({ outputRoot: ' /out ' })).outputRoot).toBe('/out');
  });
});

describe('createCount', () => {
  const preview = (statuses: string[]) => ({ matches: statuses.map((status, i) => ({ name: `f${i}`, path: `/p/f${i}`, clipCount: 1, status })) as never, notMatching: 0, truncated: false });
  it('counts what will be created plus the already-batched folders ticked to include', { tags: ['full'] }, () => {
    const p = preview(['will_create', 'will_create', 'already_batched', 'already_batched', 'no_videos', 'unreadable']);
    expect(createCount(p, [])).toBe(2);
    expect(createCount(p, ['f2'])).toBe(3);
    expect(createCount(p, ['f2', 'f3', 'f4', 'f5', 'nope'])).toBe(4);
  });
});
