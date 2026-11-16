// Matches `from '..'`, side-effect `import '..'` and dynamic `import('..')`.
// Joins a relative specifier onto a directory, resolving '.' and '..'.
function resolve(dir: string, spec: string): string[] {
  const out = dir ? dir.split('/') : [];
  for (const seg of spec.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.') out.push(seg);
  }
  return out;
}

const RELATIVE = /(?:from\s+|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** `path` is relative to src/, e.g. "collection/a.ts". Returns one message per bad import. */
export function violations(files: { path: string; source: string }[]): string[] {
  const out: string[] = [];
  for (const { path, source } of files) {
    const own = path.split('/')[0];
    for (const m of source.matchAll(RELATIVE)) {
      const target = resolve(path.split('/').slice(0, -1).join('/'), m[1])[0];
      if (target !== own && target !== 'shared') out.push(`${path} imports ${m[1]} (${target})`);
    }
  }
  return out;
}
