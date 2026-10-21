// A build tool (the kit's and every app's deploy, never served): each file's
// address carries its own content's hash (`./ui.mjs?v=3f9a1c20b7`), not the
// deploy's, so a phone downloads only the files a deploy changed. Before,
// every file of an app took the build's version and every kit file the
// kit's: each push re-downloaded the whole app or the whole kit (300 KB+)
// on every phone, and on a slow connection that was the opening.
//
// A file's hash covers what it says about its imports (their hashes are in
// its text), so a change reaches every file that leads to it and nothing
// else. Files that import each other (a cycle) share one hash.
//
// A file on its own is addressed by the hash of exactly what is served (12
// hex digits), so a phone can tell a file from the wrong one under its
// address: GitHub Pages' CDN ignores the ?v= part, and for a while after a
// deploy it can answer a new address with the old file (kit/sw.js checks
// each one). A cycle's shared hash (10 digits) can't be checked that way.
//
// The files are also minified first (whitespace and syntax; names kept, so
// an error still says where it was): a third less to download.
//
//   const { files, hashes } = await hashFiles(texts, { refs, minify })
//   texts:  Map<path, text> of every file that can be referred to
//   refs:   (text, path) → [{ start, end, target }] the references in a text
//           (end: just after the path; the ?v= goes there) to other paths
//   finish: (text, path) → text, the served text from the stamped one (the kit's #kit/ imports)
//   →       files: Map<path, text> stamped; hashes: Map<path, hash>
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const hashOf = (text, n = 10) => createHash('sha256').update(text).digest('hex').slice(0, n);
// The address of a file served as `text` (what kit/sw.js checks it against).
export const servedHash = text => hashOf(text, 12);

const ESBUILD = '0.24.0';
let esbuild = null;
// esbuild, installed once into the machine's temp folder (CI: each run).
async function loadEsbuild() {
  if (esbuild) return esbuild;
  const dir = join(tmpdir(), `quadra-esbuild-${ESBUILD}`);
  const main = join(dir, 'node_modules/esbuild/lib/main.js');
  if (!existsSync(main)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['install', '--prefix', dir, '--no-save', '--no-audit', '--no-fund', '--silent', `esbuild@${ESBUILD}`], { stdio: 'inherit' });
  }
  esbuild = (await import(pathToFileURL(main).href)).default;
  return esbuild;
}

// One file's text, minified (.js / .mjs / .css; anything else as it is).
export async function minify(text, path) {
  const loader = /\.m?js$/.test(path) ? 'js' : /\.css$/.test(path) ? 'css' : null;
  if (!loader) return text;
  const { transformSync } = await loadEsbuild();
  // (No target: the syntax stays as written. `format` unset: a module stays a module, a classic script a script.)
  return transformSync(text, { loader, minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8' }).code;
}

export async function hashFiles(texts, { refs, minify: shrink = true, finish = text => text }) {
  const paths = [...texts.keys()];
  const src = new Map();
  for (const p of paths) src.set(p, shrink ? await minify(texts.get(p), p) : texts.get(p));
  const out = new Map(src);
  const edges = new Map(paths.map(p => [p, refs(src.get(p), p).filter(r => texts.has(r.target))]));
  // Tarjan's strongly connected components: each comes out after every one it imports.
  const order = [];
  const index = new Map();
  const low = new Map();
  const stack = [];
  const on = new Set();
  let n = 0;
  const visit = v => {
    index.set(v, n);
    low.set(v, n++);
    stack.push(v);
    on.add(v);
    for (const { target: w } of edges.get(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const group = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        group.push(w);
      } while (w !== v);
      order.push(group.sort());
    }
  };
  for (const p of paths) if (!index.has(p)) visit(p);
  const hashes = new Map();
  // A text with its references to hashed files stamped (the rest left for later).
  const stamp = p => {
    const text = src.get(p);
    let next = '';
    let at = 0;
    for (const r of [...edges.get(p)].sort((a, b) => a.start - b.start)) {
      const h = hashes.get(r.target);
      if (!h) continue;
      next += `${text.slice(at, r.end)}?v=${h}`;
      at = r.end;
    }
    return finish(next + text.slice(at), p);
  };
  for (const group of order) {
    // On its own: the hash of what's served. A cycle: one hash for all of them, of their texts with everything outside it stamped.
    const h = group.length === 1 ? servedHash(stamp(group[0])) : hashOf(group.map(p => `${p}\n${stamp(p)}`).join('\n\0'));
    for (const p of group) hashes.set(p, h);
    for (const p of group) out.set(p, stamp(p));
  }
  return { files: out, hashes };
}
