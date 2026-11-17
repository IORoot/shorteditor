import { describe, expect, it } from 'vitest';
import { violations } from './architecture';

const raw = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const files = Object.entries(raw)
  .map(([key, source]) => ({ path: key.replace('/src/', ''), source }))
  .filter((f) => /^(collection|pipeline|production|output|shared)\//.test(f.path));

describe('architecture', () => {
  it('no stage imports another stage', () => {
    expect(violations(files.filter((f) => !f.path.startsWith('shared/')))).toEqual([]);
  });

  it('shared imports no stage', () => {
    expect(violations(files.filter((f) => f.path.startsWith('shared/')))).toEqual([]);
  });

  it('flags a collection file importing production', { tags: ['full'] }, () => {
    expect(violations([{ path: 'collection/a.ts', source: "import x from '../production/b'" }])).toHaveLength(1);
    expect(violations([{ path: 'collection/a.ts', source: "import x from '../shared/b'" }])).toHaveLength(0);
  });

  it('scans real files', { tags: ['full'] }, () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => f.path.startsWith('shared/')).length).toBeGreaterThan(5);
  });
});
