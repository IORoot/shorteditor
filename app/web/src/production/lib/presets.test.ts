import { describe, expect, it } from 'vitest';
import { PATTERN_PRESETS, batchesNow, buildSteps, createCount, defaultForm, defaultManyForm, formFromWatch, isValid, manyIsValid, secondsHint, settingsFromSteps, sizeHint, toBulkRequest, toRequest, toWatchRequest, watchNameOf, wholeHint, type ManyForm, type NewBatchForm } from './presets';
import type { WatchView } from './types';

const form = (over: Partial<NewBatchForm> = {}): NewBatchForm => ({ ...defaultForm(), name: 'Coach Saturdays', inputFolder: '/clips/coach', ...over });

describe('defaultForm', () => {
  it('starts with the usual social-media settings and no output folder of its own', () => {
    expect(defaultForm()).toEqual({
      name: '', inputFolder: '', outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '900', maxSizeMb: '150', fit: 'crop',
    });
  });
});

describe('buildSteps', () => {
  it('makes the Join clips pipeline in order with the chosen settings', () => {
    const steps = buildSteps(form({ orderBy: 'name', maxSeconds: '45', maxSizeMb: '25', fit: 'blur' }));
    expect(steps).toEqual([
      { key: 'scan_folder', settings: {}, enabled: true },
      { key: 'order_clips', settings: { orderBy: 'name' }, enabled: true },
      { key: 'limit_length', settings: { maxSeconds: 45 }, enabled: true },
      { key: 'join_pieces', settings: { fit: 'blur' }, enabled: true },
      { key: 'render_output', settings: { maxSizeMb: 25 }, enabled: true },
    ]);
  });
});

describe('isValid', () => {
  it('needs a name, a folder and positive numbers', () => {
    expect(isValid(form())).toBe(true);
    expect(isValid(form({ name: '   ' }))).toBe(false);
    expect(isValid(form({ inputFolder: '' }))).toBe(false);
    expect(isValid(form({ maxSeconds: '' }))).toBe(false);
    expect(isValid(form({ maxSeconds: '0' }))).toBe(false);
    expect(isValid(form({ maxSizeMb: '-5' }))).toBe(false);
    expect(isValid(form({ maxSizeMb: 'abc' }))).toBe(false);
    expect(isValid(form({ maxSeconds: 'Infinity' }))).toBe(false);
  });
});

describe('limits the server enforces', () => {
  it('needs at least one second and a size above 0 up to 100000 MB', () => {
    expect(isValid(form({ maxSeconds: '0.5' }))).toBe(false);
    expect(isValid(form({ maxSeconds: '1' }))).toBe(true);
    expect(isValid(form({ maxSizeMb: '100000' }))).toBe(true);
    expect(isValid(form({ maxSizeMb: '100001' }))).toBe(false);
    expect(isValid(form({ maxSizeMb: '0.1' }))).toBe(true);
  });

  it('accepts plain numbers only, with a trimmed surrounding space', () => {
    expect(isValid(form({ maxSeconds: '  60 ' }))).toBe(true);
    for (const odd of ['1e3', '1,5', '0x10', '+5', '.5', '5.', '1 000']) expect(isValid(form({ maxSeconds: odd }))).toBe(false);
  });

  it('explains what is wrong, and says nothing for an empty or fine value', () => {
    expect(secondsHint('')).toBeNull();
    expect(secondsHint('45')).toBeNull();
    expect(secondsHint('1,5')).toBe('Use a number like 45 or 30.5');
    expect(secondsHint('0.5')).toBe('At least 1 second');
    expect(sizeHint('abc')).toBe('Use a number like 45 or 30.5');
    expect(sizeHint('100001')).toBe('At most 100000 MB');
    expect(sizeHint('0')).toBe('More than 0 MB');
  });
});

describe('toRequest', () => {
  it('sends trimmed text and real numbers', () => {
    const request = toRequest(form({ name: '  Coach Saturdays ', maxSeconds: '30.5' }));
    expect(request.name).toBe('Coach Saturdays');
    expect(request.steps[2].settings).toEqual({ maxSeconds: 30.5 });
    expect(request.runOn).toBe('any');
  });

  it('leaves the output folder out when it is empty so the server default applies, and sends it when set', () => {
    expect('outputRoot' in toRequest(form({ outputRoot: '  ' }))).toBe(false);
    expect(toRequest(form({ outputRoot: '/Volumes/Edit/Reels' })).outputRoot).toBe('/Volumes/Edit/Reels');
  });
});


const many = (over: Partial<ManyForm> = {}): ManyForm => ({ ...defaultManyForm(), parentFolder: '/Volumes/Edit/Collected', ...over });

describe('pattern presets', () => {
  it('offers a date-first pattern, any folder, and a custom one', () => {
    expect(PATTERN_PRESETS.map((p) => p.id)).toEqual(['date', 'any', 'custom']);
    const date = new RegExp(PATTERN_PRESETS[0].pattern);
    expect(date.test('2026-11-07_Sat_coach')).toBe(true);
    expect(date.test('notes')).toBe(false);
    expect(new RegExp(PATTERN_PRESETS[1].pattern).test('anything at all')).toBe(true);
    expect(PATTERN_PRESETS[2].pattern).toBe('');
  });
});

describe('defaultManyForm', () => {
  it('starts on the date preset with the usual settings', () => {
    expect(defaultManyForm()).toEqual({
      parentFolder: '', presetId: 'date', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', include: [],
      outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '900', maxSizeMb: '150', fit: 'crop',
      watching: false, watchName: '', watchExisting: false, intervalMinutes: '5', settleMinutes: '10', maxPerCheck: '20',
    });
  });
});

describe('watch fields', () => {
  it('accepts whole numbers inside the limits and explains the rest', () => {
    expect(wholeHint('5', 1, 1440)).toBeNull();
    expect(wholeHint('1440', 1, 1440)).toBeNull();
    expect(wholeHint('0', 1, 1440)).toBe('Use a whole number from 1 to 1440');
    expect(wholeHint('1441', 1, 1440)).toBe('Use a whole number from 1 to 1440');
    expect(wholeHint('', 0, 1440)).toBe('Use a whole number from 0 to 1440');
    expect(wholeHint('2.5', 1, 100)).toBe('Use a whole number from 1 to 100');
    expect(wholeHint(' 7 ', 1, 100)).toBeNull();
  });

  it('names the watch after its folder when no name is typed', () => {
    expect(watchNameOf(many({ watchName: '  Coach  ' }))).toBe('Coach');
    expect(watchNameOf(many({ parentFolder: '/Volumes/Edit/Collected/' }))).toBe('Collected');
    expect(watchNameOf(many({ parentFolder: 'C:\\Clips\\Coach' }))).toBe('Coach');
  });

  it('needs valid watch numbers only while watching', () => {
    expect(manyIsValid(many({ intervalMinutes: '0' }))).toBe(true);
    expect(manyIsValid(many({ watching: true, intervalMinutes: '0' }))).toBe(false);
    expect(manyIsValid(many({ watching: true, settleMinutes: '-1' }))).toBe(false);
    expect(manyIsValid(many({ watching: true, maxPerCheck: '101' }))).toBe(false);
    expect(manyIsValid(many({ watching: true, watchName: 'x'.repeat(121) }))).toBe(false);
    expect(manyIsValid(many({ watching: true, settleMinutes: '0' }))).toBe(true);
  });

  it('sends a watch with its settings, pattern and steps, and keeps the output folder optional', () => {
    const request = toWatchRequest(many({ watching: true, watchName: ' Coach ', maxPerCheck: '15', runOn: 'studio' }), true, false);
    expect(request).toEqual({
      name: 'Coach', parentFolder: '/Volumes/Edit/Collected', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{name}', runOn: 'studio',
      steps: buildSteps(many()), intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 15, includeExisting: true, enabled: false,
    });
    expect(toWatchRequest(many({ outputRoot: '/out' }), false).outputRoot).toBe('/out');
    expect('outputRoot' in toWatchRequest(many({ outputRoot: ' ' }), false)).toBe(false);
  });

  it('reads a saved watch back into the form, including its settings', () => {
    const watch = {
      id: 3, name: 'Coach', parentFolder: '/c', pattern: '^.+$', nameTemplate: '{1} reel', runOn: 'studio', outputRoot: '/out',
      steps: buildSteps({ ...defaultManyForm(), orderBy: 'name', maxSeconds: '45', maxSizeMb: '25', fit: 'blur' }),
      intervalMinutes: 7, settleMinutes: 3, maxPerCheck: 9, enabled: false, createdAt: 'x', lastCheckedAt: null, lastError: null, waiting: [], createdTotal: 0,
      status: 'paused', statusLine: '',
    } as WatchView;
    const form = formFromWatch(watch);
    expect(form).toMatchObject({
      parentFolder: '/c', presetId: 'any', pattern: '^.+$', nameTemplate: '{1} reel', runOn: 'studio', outputRoot: '/out', watching: true,
      watchName: 'Coach', intervalMinutes: '7', settleMinutes: '3', maxPerCheck: '9', orderBy: 'name', maxSeconds: '45', maxSizeMb: '25', fit: 'blur', watchExisting: false,
    });
  });

  it('falls back to the custom preset and the usual settings for a watch with unknown steps', () => {
    const form = formFromWatch({ id: 1, name: 'x', parentFolder: '/c', pattern: 'cam-\\d+', nameTemplate: '{name}', runOn: 'any', outputRoot: null, steps: [], intervalMinutes: 5, settleMinutes: 10, maxPerCheck: 20, enabled: true, createdAt: 'x', lastCheckedAt: null, lastError: null, waiting: [], createdTotal: 0, status: 'watching', statusLine: '' } as WatchView);
    expect(form).toMatchObject({ presetId: 'custom', pattern: 'cam-\\d+', orderBy: 'capture_time', maxSeconds: '900', maxSizeMb: '150', fit: 'crop', outputRoot: '' });
    expect(settingsFromSteps([{ key: 'order_clips', settings: { orderBy: 'bogus' }, enabled: true }]).orderBy).toBe('capture_time');
  });
});

describe('batchesNow', () => {
  const preview = { matches: [
    { name: 'new1', path: '/p/new1', clipCount: 2, status: 'will_create' },
    { name: 'new2', path: '/p/new2', clipCount: 2, status: 'will_create' },
    { name: 'old', path: '/p/old', clipCount: 2, status: 'already_batched' },
  ] as never, notMatching: 0, truncated: false };

  it('counts the batches created now: the one-off ones, or the existing folders when watching includes them', () => {
    expect(batchesNow(many({ include: ['old'] }), preview)).toBe(3);
    expect(batchesNow(many({ watching: true, include: ['old'] }), preview)).toBe(0);
    expect(batchesNow(many({ watching: true, watchExisting: true, include: ['old'] }), preview)).toBe(2);
  });
});

describe('manyIsValid', () => {
  it('needs a parent folder, a pattern and valid limits', () => {
    expect(manyIsValid(many())).toBe(true);
    expect(manyIsValid(many({ parentFolder: ' ' }))).toBe(false);
    expect(manyIsValid(many({ pattern: '' }))).toBe(false);
    expect(manyIsValid(many({ maxSeconds: '0.5' }))).toBe(false);
    expect(manyIsValid(many({ maxSizeMb: '100001' }))).toBe(false);
  });
});

describe('toBulkRequest', () => {
  it('sends the pattern, template, shared steps and the folders to include again', () => {
    const request = toBulkRequest(many({ nameTemplate: '{1} coach', include: ['2026-11-07_a'], runOn: 'studio', maxSeconds: '45' }));
    expect(request).toEqual({
      parentFolder: '/Volumes/Edit/Collected', pattern: PATTERN_PRESETS[0].pattern, nameTemplate: '{1} coach', runOn: 'studio',
      include: ['2026-11-07_a'], steps: buildSteps(many({ maxSeconds: '45' })),
    });
    expect('outputRoot' in request).toBe(false);
    expect(toBulkRequest(many({ outputRoot: ' /out ' })).outputRoot).toBe('/out');
  });
});

describe('createCount', () => {
  const preview = (statuses: string[]) => ({ matches: statuses.map((status, i) => ({ name: `f${i}`, path: `/p/f${i}`, clipCount: 1, status })) as never, notMatching: 0, truncated: false });
  it('counts what will be created plus the already-batched folders ticked to include', () => {
    const p = preview(['will_create', 'will_create', 'already_batched', 'already_batched', 'no_videos', 'unreadable']);
    expect(createCount(p, [])).toBe(2);
    expect(createCount(p, ['f2'])).toBe(3);
    expect(createCount(p, ['f2', 'f3', 'f4', 'f5', 'nope'])).toBe(4);
  });
});
