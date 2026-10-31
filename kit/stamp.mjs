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
import { KIT_TOOLS } from './preload.mjs';
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
