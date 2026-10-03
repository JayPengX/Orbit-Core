// Builds the kit for GitHub Pages (run by .github/workflows/pages.yml):
// copies kit/ into <out>/kit/, adds ?v=<version> to the kit-only modules a
// kit file imports by relative path (pass.mjs, help.mjs, truth.mjs), and
// writes <out>/kit/version.json. The apps' modules reach the kit's entry
// modules through the page's import map (loader.html), which carries the
// same version, so one page load always runs one version of the kit.
//   node kit/stamp.mjs <out> <version>
import { cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const [out, version] = process.argv.slice(2);
if (!out || !version) throw new Error('usage: node kit/stamp.mjs <out> <version>');
const src = new URL('./', import.meta.url).pathname;
const dest = join(out, 'kit');
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
// Build and dev tools stay out of the site.
for (const tool of ['stamp.mjs', 'link.mjs', 'loader.html', 'apps.mjs']) await rm(join(dest, tool), { force: true });

const LOCAL = /((?:from|import\(|import)\s*['"])(\.\/[^'"?]+\.m?js)(['"])/g;
for (const name of await readdir(dest)) {
  if (!/\.(m?js)$/.test(name)) continue;
  const path = join(dest, name);
  const text = await readFile(path, 'utf8');
  const stamped = text.replace(LOCAL, (_, before, file, after) => `${before}${file}?v=${version}${after}`);
  if (stamped !== text) await writeFile(path, stamped);
}
await writeFile(join(dest, 'version.json'), JSON.stringify({ version }) + '\n');
console.log('kit', version, '->', dest);
