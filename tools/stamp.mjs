// Stamps a service worker for a deploy: writes the cache name, version and
// the list of files to keep into the STAMP line of a copy of kit/sw.js.
//   node tools/stamp.mjs <sw.js> --cache <name> --version <build> [--assets <dir>] [--exclude a,b]
// --assets lists every page file under <dir> (./ first; sw.js, version.json,
// source maps and anything under an --exclude prefix left out), as the paths
// the page asks for them, relative to <dir>. Run it by the deploy, after the
// ?v= versions are stamped into the pages. See tools/README.md.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEPT = /\.(html|js|mjs|css|json|webmanifest|png|svg|jpg|jpeg|webp|ico|woff2?)$/i;

// The stamped text of a service worker: only what is between its
// `stamp:begin` and `stamp:end` lines changes.
export function stampSw(text, { cache, version = '', assets = ['./'] }) {
  if (assets.some(a => /['\\\n]/.test(a))) throw new Error('a file name with a quote or backslash can\'t be listed');
  if (!/^[\w-]+$/.test(cache || '')) throw new Error('--cache is a plain name (letters, digits, - and _)');
  if (!/^[\w.-]*$/.test(version)) throw new Error('--version is letters, digits, . - and _');
  const q = x => `'${x}'`;
  const line = `const STAMP = { cache: ${q(cache)}, version: ${q(version)}, assets: [${assets.map(q).join(', ')}] };`;
  const next = text.replace(/(\/\/ stamp:begin\n)[\s\S]*?(\/\/ stamp:end)/, (_, a, b) => `${a}${line}\n${b}`);
  if (next === text && !text.includes(line)) throw new Error('no stamp:begin / stamp:end in that file');
  return next;
}

// Every file of a folder worth keeping, as './' then relative paths, sorted.
export async function listAssets(dir, { exclude = [] } = {}) {
  const out = ['./'];
  const walk = async d => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const path = join(d, e.name);
      if (e.isDirectory()) await walk(path);
      else {
        const rel = relative(dir, path).split('\\').join('/');
        if (rel === 'sw.js' || rel === 'version.json' || rel.endsWith('.map') || !KEPT.test(rel) || exclude.some(x => rel.startsWith(x))) continue;
        out.push(rel);
      }
    }
  };
  await walk(dir);
  return [out[0], ...out.slice(1).sort()];
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [file, ...rest] = process.argv.slice(2);
  const flag = name => rest[rest.indexOf(`--${name}`) + 1];
  if (!file || !flag('cache')) throw new Error('usage: node tools/stamp.mjs <sw.js> --cache <name> --version <build> [--assets <dir>] [--exclude a,b]');
  const assets = flag('assets') ? await listAssets(flag('assets'), { exclude: (flag('exclude') || '').split(',').filter(Boolean) }) : ['./'];
  await writeFile(file, stampSw(await readFile(file, 'utf8'), { cache: flag('cache'), version: flag('version') || '', assets }));
  console.log(`${file}: ${flag('cache')}${flag('version') ? `-${flag('version')}` : ''}, ${assets.length} files`);
}
