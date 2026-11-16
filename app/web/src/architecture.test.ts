import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { violations } from './architecture';

const SRC = __dirname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = ['collection', 'production', 'output', 'shared'].flatMap((stage) =>
  walk(join(SRC, stage)).map((p) => ({ path: relative(SRC, p), source: readFileSync(p, 'utf8') })),
);

describe('architecture', () => {
  it('no stage imports another stage', () => {
    expect(violations(files.filter((f) => !f.path.startsWith('shared/')))).toEqual([]);
  });

  it('shared imports no stage', () => {
    expect(violations(files.filter((f) => f.path.startsWith('shared/')))).toEqual([]);
  });

  it('flags a collection file importing production', () => {
    expect(violations([{ path: 'collection/a.ts', source: "import x from '../production/b'" }])).toHaveLength(1);
    expect(violations([{ path: 'collection/a.ts', source: "import x from '../shared/b'" }])).toHaveLength(0);
  });

  it('scans real files', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
