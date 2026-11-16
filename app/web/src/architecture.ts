import { posix } from 'node:path';

// Matches `from '..'`, side-effect `import '..'` and dynamic `import('..')`.
const RELATIVE = /(?:from\s+|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** `path` is relative to src/, e.g. "collection/a.ts". Returns one message per bad import. */
export function violations(files: { path: string; source: string }[]): string[] {
  const out: string[] = [];
  for (const { path, source } of files) {
    const own = path.split('/')[0];
    for (const m of source.matchAll(RELATIVE)) {
      const target = posix.join(posix.dirname(path), m[1]).split('/')[0];
      if (target !== own && target !== 'shared') out.push(`${path} imports ${m[1]} (${target})`);
    }
  }
  return out;
}
