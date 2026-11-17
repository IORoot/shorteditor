import { describe, expect, it } from 'vitest';
import { formatBytes, plural, suffixAdded } from './format';

describe('formatBytes', () => {
  it('formats bytes, KB, MB and GB', { tags: ['full'] }, () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(18.4 * 1024 ** 3)).toBe('18.4 GB');
    expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB');
  });

  it('caps at TB', { tags: ['full'] }, () => {
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB');
    expect(formatBytes(2048 * 1024 ** 4)).toBe('2048 TB');
  });
});

describe('suffixAdded', () => {
  it('describes the numbered suffix', { tags: ['full'] }, () => {
    expect(suffixAdded('2026-11-14_Sat_coach-2')).toBe('-2 added');
    expect(suffixAdded('2026-11-14_Sat_coach-13')).toBe('-13 added');
  });

  it('falls back when there is no number', { tags: ['full'] }, () => {
    expect(suffixAdded('plain')).toBe('Renamed');
  });
});

describe('plural', () => {
  it('adds an s except for one', { tags: ['full'] }, () => {
    expect(plural(1, 'clip')).toBe('1 clip');
    expect(plural(0, 'clip')).toBe('0 clips');
    expect(plural(5, 'folder')).toBe('5 folders');
  });
});
