// Builds the kit for GitHub Pages (run by .github/workflows/pages.yml):
// copies kit/ into <out>/kit/ minified, its files' imports of each other
// written as `#kit/…` (so a kit file reaches another at the same address
// the app's import map gives it, kit/loader.html), and writes
// <out>/kit/version.json: the kit's version and each file's content hash
// (kit/hash.mjs). The loader puts each file at its own hash, noted from
// version.json, so a kit push re-downloads only the files it changed.
//   node kit/stamp.mjs <out> <version>
import { cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
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
// (No stamps inside: a kit file's hash is its own text's alone.)
const LOCAL = /((?:from|import\(|import)\s*['"])\.\/([^'"?/]+\.m?js)(['"])/g;
const { files, hashes } = await hashFiles(texts, { refs: () => [] });
for (const [name, text] of files) await writeFile(join(dest, name), text.replace(LOCAL, (_, before, file, after) => `${before}#kit/${file}${after}`));
await writeFile(join(dest, 'version.json'), JSON.stringify({ version, files: Object.fromEntries([...hashes].sort()) }) + '\n');
console.log('kit', version, '->', dest, `(${hashes.size} files)`);
