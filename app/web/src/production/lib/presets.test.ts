import { describe, expect, it } from 'vitest';
import { PATTERN_PRESETS, buildSteps, createCount, defaultForm, defaultManyForm, isValid, manyIsValid, secondsHint, sizeHint, toBulkRequest, toRequest, type ManyForm, type NewBatchForm } from './presets';

const form = (over: Partial<NewBatchForm> = {}): NewBatchForm => ({ ...defaultForm(), name: 'Coach Saturdays', inputFolder: '/clips/coach', ...over });

describe('defaultForm', () => {
  it('starts with the usual social-media settings and no output folder of its own', () => {
    expect(defaultForm()).toEqual({
      name: '', inputFolder: '', outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '60', maxSizeMb: '50', fit: 'crop',
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
      outputRoot: '', runOn: 'any', orderBy: 'capture_time', maxSeconds: '60', maxSizeMb: '50', fit: 'crop',
    });
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
