// Points every app checked out next to this repo at the kit served from
// Shared-Proxy's GitHub Pages (kit/loader.html), instead of a copy in each
// app. Safe to run again: it only rewrites what still needs it, and it puts
// the latest loader.html between each page's kit:head / kit:boot markers
// (the one thing an app keeps of the kit, changed very rarely).
//   node kit/apps.mjs
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// (Every kit module in the loader's import map, at the version noted: listed from the folder, the build tools left out.)
import { KIT_TOOLS } from './preload.mjs';
import { withApp } from './brand.mjs';
const kitMods = (await (await import('node:fs/promises')).readdir(new URL('./', import.meta.url))).filter(f => f.endsWith('.mjs') && !KIT_TOOLS.includes(f)).sort();
const loader = (await readFile(new URL('./loader.html', import.meta.url), 'utf8')).replace(/f=\[[^\]]*\]/, `f=[${kitMods.map(f => `'${f}'`).join(',')}]`);
const block = name => loader.slice(loader.indexOf(`<!-- kit:${name}`), loader.indexOf(`<!-- /kit:${name} -->`) + `<!-- /kit:${name} -->`.length);
export const HEAD = block('head');
export const BOOT = block('boot');

// Each app: its id (kit/brand.mjs; the page's <html data-app>), its site folder, and the kit modules it uses (by the name the app
// imports them as).
const APPS = {
  'Orbit-Securities': { id: 'stock', site: 'public', mods: ['orbit'] },
  'Orbit-Sports': { id: 'match', site: 'public', mods: ['orbit', 'logos', 'names', 'photos', 'catalog'] },
  'Orbit-Words': { id: 'vocab', site: 'public', mods: ['orbit'] },
  'Orbit-Weather': { id: 'weather', site: 'public', mods: ['orbit'] },
  'Orbit-Transit': { id: 'transit', site: 'public', mods: ['orbit'] },
  'Orbit-Class': { id: 'orbit', site: '.', mods: ['orbit'] },
  'Orbit-Beats': { id: 'beats', site: 'public', mods: ['orbit'] },
  'Orbit-Law': { id: 'law', site: 'public', mods: ['orbit'] },
  'Orbit-Money': { id: 'money', site: 'public', mods: ['orbit'] }
};
const CHECKOUT = `      - name: The shared kit (Shared-Proxy/kit), for the tests
        uses: actions/checkout@v4
        with:
          repository: JayPengX/Shared-Proxy
          path: .shared
          sparse-checkout: kit
      - run: ln -sfn .shared/kit .kit
`;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function edit(path, fn) {
  if (!(await exists(path))) return;
  const text = await readFile(path, 'utf8');
  const next = fn(text);
  if (next !== text) await writeFile(path, next);
}
async function walk(dir, out = []) {
  const { readdir } = await import('node:fs/promises');
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.kit', '.shared', 'data'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(m?js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// The page: the kit's stylesheet and boot script become the loader.
function page(html, app) {
  const swap = (name, snippet) => {
    const marked = new RegExp(`<!-- kit:${name}[\\s\\S]*?<!-- /kit:${name} -->`);
    if (!marked.test(html)) throw new Error(`${app}: no place for kit:${name}`);
    html = html.replace(marked, snippet);
  };
  swap('head', HEAD);
  swap('boot', BOOT);
  return withApp(html, APPS[app].id);
}

for (const [app, cfg] of Object.entries(APPS)) {
  const dir = join(root, app);
  if (!(await exists(dir))) {
    console.log('skip', app, '(not checked out)');
    continue;
  }
  const site = join(dir, cfg.site);
  await edit(join(dir, cfg.site === '.' ? 'index.html' : `${cfg.site}/index.html`), html => page(html, app));
  // Modules: the kit's by its specifier, wherever the importing file is.
  const mods = cfg.mods.join('|');
  const spec = new RegExp(`(['"])(?:\\.{1,2}\\/)+(?:public\\/|src\\/)?(?:lib\\/)?(${mods})\\.mjs\\1`, 'g');
  for (const file of await walk(dir)) await edit(file, text => text.replace(spec, (_, q, m) => `${q}#kit/${m}.mjs${q}`));
  // The service worker's pictures from other sites.
  await edit(join(site, 'sw.js'), text => text.replace("importScripts('./sw-images.js')", "importScripts('../Shared-Proxy/kit/sw-images.js')"));
  // Tests import the kit as the page does (#kit/…): package.json's imports,
  // through .kit (a link to ../Shared-Proxy/kit here, a checkout in CI).
  await edit(join(dir, 'package.json'), text => {
    const p = JSON.parse(text);
    p.imports = { ...(p.imports || {}), '#kit/*': './.kit/*' };
    p.scripts ||= {};
    p.scripts.pretest = 'test -e .kit || ln -s ../Shared-Proxy/kit .kit';
    return JSON.stringify(p, null, 2) + '\n';
  });
  if (await exists(join(dir, '.gitignore'))) await edit(join(dir, '.gitignore'), t => (/^\.kit$/m.test(t) ? t : `${t.trimEnd()}\n.kit\n.shared\n`));
  else await writeFile(join(dir, '.gitignore'), '.kit\n.shared\nnode_modules/\n');
  const { readdir } = await import('node:fs/promises');
  for (const wf of await readdir(join(dir, '.github/workflows')).catch(() => [])) {
    await edit(join(dir, '.github/workflows', wf), y => (y.includes('repository: JayPengX/Shared-Proxy') ? y : y.replace(/( {6}- name: (?:Run tests|Install dependencies)\n)/, `${CHECKOUT}$1`)));
  }
  console.log('kit from Pages:', app);
}
