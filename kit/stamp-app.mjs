// A build tool (each app's deploy, scripts/stamp-version.mjs; never served):
// readies an app's site folder for GitHub Pages.
//
// - Every local script, module and stylesheet minified, and every reference
//   to one (import/from/src/href/new URL, './' and '../') stamped with that
//   file's own content hash (kit/hash.mjs): a deploy never mixes new files
//   with ones a browser cached from the last one (Pages caches for 10
//   minutes; one stale module can stop the page from starting), and a phone
//   downloads only the files the deploy changed. (Each file took the build's
//   version before: every deploy re-downloaded the whole app.)
// - The page's own version in index.html (meta build-version) and in
//   version.json: the page compares the two and reloads itself when a newer
//   deploy is out.
// - Every module the page imports up front listed in the page as
//   modulepreload, the app's and the kit's (kit/preload.mjs): the browser
//   asks for them all at once instead of one import level at a time.
// - The kit's current file hashes baked into the page's loader
//   (kit/loader.html's `null`): a phone's first visit asks for the kit's
//   files at the addresses the kit's own imports use.
//
//   await stampApp({ root, version, kitDir })
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { hashFiles } from './hash.mjs';
import { kitPreloads } from './preload.mjs';

const KIT_VERSION_URL = 'https://jaypengx.github.io/Shared-Proxy/kit/version.json';

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (/\.(html|js|mjs|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

// './x.js', './lib/x.mjs', '../engine.mjs', './styles.css' inside
// import/from/src/href/new URL, and a bare `import './x.mjs'`. ('../' too: a
// module imported unstamped by one file and stamped by another is two
// modules, each with its own state.)
const LOCAL = /((?:from|import\(|\bimport|src=|href=|new URL\()\s*['"])(\.{1,2}\/[^'"?]+\.(?:m?js|css))(['"])/g;
// The page's static import graph (read before minifying, as written).
const STATIC = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"?]+)['"]|(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"?]+)['"]/g;
async function graph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = await readFile(file, 'utf8').catch(() => '');
  for (const m of text.matchAll(STATIC)) await graph(join(dirname(file), m[1] || m[2]), seen);
  return seen;
}

// The kit's file hashes as Pages serves them now (null when they can't be read: the loader then works as before).
async function kitNow() {
  try {
    const res = await fetch(`${KIT_VERSION_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    const v = res.ok ? await res.json() : null;
    return v?.version && v.files ? { version: v.version, files: v.files } : null;
  } catch {
    return null;
  }
}

export async function stampApp({ root, version, kitDir, minify = true, kit = undefined }) {
  if (!version) throw new Error('stampApp: no version');
  root = resolve(root);
  const index = join(root, 'index.html');
  const indexHtml = await readFile(index, 'utf8');
  const entries = [...indexHtml.matchAll(/<script type="module" src="\.\/([^"?]+)"/g)].map(m => join(root, m[1]));
  const modules = new Set();
  for (const entry of entries) for (const f of await graph(entry)) if (!entries.includes(f)) modules.add(f);
  const kitLinks = kitDir ? await kitPreloads(entries, kitDir) : '';

  const texts = new Map();
  for (const path of await files(root)) texts.set(path, await readFile(path, 'utf8'));
  const refs = (text, path) =>
    [...text.matchAll(LOCAL)].map(m => ({ start: m.index, end: m.index + m[1].length + m[2].length, target: join(dirname(path), m[2]) }));
  // (The pages themselves aren't minified (kit/hash.mjs): only what they load.)
  const { files: stamped, hashes } = await hashFiles(texts, { refs, minify });
  for (const [path, text] of stamped) if (text !== texts.get(path)) await writeFile(path, text);

  const preloads = [...modules]
    .filter(f => hashes.has(f))
    .map(f => `<link rel="modulepreload" href="./${relative(root, f)}?v=${hashes.get(f)}" />`)
    .join('\n');
  const baked = kit === undefined ? await kitNow() : kit;
  let page = stamped.get(index).replace('content="dev"', `content="${version}"`).replace('<!-- /kit:head -->', `<!-- /kit:head -->${kitLinks ? `\n${kitLinks}` : ''}`);
  if (baked) page = page.replace("('../Shared-Proxy/kit/',null)", `('../Shared-Proxy/kit/',${JSON.stringify(baked)})`);
  if (preloads) page = page.replace('</head>', `${preloads}\n</head>`);
  await writeFile(index, page);
  await writeFile(join(root, 'version.json'), JSON.stringify({ version }) + '\n');
  return { files: hashes.size, kit: baked?.version || null };
}
