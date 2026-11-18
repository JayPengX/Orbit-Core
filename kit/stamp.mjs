// Builds the kit for GitHub Pages (run by .github/workflows/pages.yml):
// copies kit/ into <out>/kit/ minified, its files' imports of each other
// written as `#kit/…` (so a kit file reaches another at the same address
// the app's import map gives it, kit/loader.html), and writes
// <out>/kit/version.json: the kit's version and each file's content hash
// (kit/hash.mjs). The loader puts each file at its own hash, noted from
// version.json, so a kit push re-downloads only the files it changed.
//   node kit/stamp.mjs <out> <commit>
import { cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { KIT_TOOLS, kitGraph } from './preload.mjs';
import { hashFiles } from './hash.mjs';

const [out, version] = process.argv.slice(2);
if (!out || !version) throw new Error('usage: node kit/stamp.mjs <out> <version>');
const src = new URL('./', import.meta.url).pathname;
const dest = join(out, 'kit');
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
// Build and dev tools stay out of the site.
for (const tool of KIT_TOOLS) await rm(join(dest, tool), { force: true });

const texts = new Map();
for (const name of await readdir(dest)) if (/\.(m?js|css)$/.test(name)) texts.set(name, await readFile(join(dest, name), 'utf8'));
// (No stamps inside: a kit file's hash is its own served text's alone.)
const LOCAL = /((?:from|import\(|import)\s*['"])\.\/([^'"?/]+\.m?js)(['"])/g;
const { files, hashes } = await hashFiles(texts, { refs: () => [], finish: text => text.replace(LOCAL, (_, before, file, after) => `${before}#kit/${file}${after}`) });
for (const [name, text] of files) await writeFile(join(dest, name), text);
// The kit's version is its files' (k + 12 hex, never taken for one file's
// hash): a push that changed none of them (tests, the site, the Workers'
// side) is no update, and no open app reloads for it. It was the commit, and
// every push reloaded every open app.
const listed = Object.fromEntries([...hashes].sort());
const kitVersion = `k${createHash('sha256').update(JSON.stringify(listed)).digest('hex').slice(0, 12)}`;
await writeFile(join(dest, 'version.json'), JSON.stringify({ version: kitVersion, commit: version, files: listed }) + '\n');
console.log('kit', kitVersion, `(${version})`, '->', dest, `(${hashes.size} files)`);

// The family's own pages that load the kit (site/, copied into <out> before
// this runs: Orbit's window, /app/), readied as an app's deploy readies its
// page (stamp-app.mjs). Their loader ends `(…,null,null)`: the first becomes
// the kit's version and hashes, so a first visit asks for each kit file at
// the address the apps ask for it at; the second the kit modules the page
// imports (in the order it comes to them), which the loader asks for with
// the page (modulepreload). (Orbit's window asked for the kit
// at bare addresses, one import level at a time, and the app it held then
// downloaded all of it again: 182 KB of a first opening's 457 KB of kit,
// 2026-11-18.)
const BAKE = "('/Orbit-Core/kit/',null,null)";
async function pages(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) path === dest || (await pages(path, found));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}
for (const page of await pages(out)) {
  const html = await readFile(page, 'utf8');
  if (!html.includes(BAKE)) continue;
  // (And boot.js, the first script of every app the window holds: there when the app's page asks.)
  const names = [...(await kitGraph([page], src)).keys(), 'boot.js'].filter(name => listed[name]);
  await writeFile(page, html.replace(BAKE, () => `('/Orbit-Core/kit/',${JSON.stringify({ version: kitVersion, files: listed })},${JSON.stringify(names)})`));
  console.log('page', page, `(${names.length} kit modules)`);
}
