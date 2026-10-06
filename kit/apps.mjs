// Points every app checked out next to this repo at the kit served from
// Shared-Proxy's GitHub Pages (kit/loader.html), instead of a copy in each
// app. Safe to run again: it only rewrites what still needs it, and it puts
// the latest loader.html between each page's kit:head / kit:boot markers
// (the one thing an app keeps of the kit, changed very rarely).
//   node kit/apps.mjs
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const loader = await readFile(new URL('./loader.html', import.meta.url), 'utf8');
const block = name => loader.slice(loader.indexOf(`<!-- kit:${name}`), loader.indexOf(`<!-- /kit:${name} -->`) + `<!-- /kit:${name} -->`.length);
export const HEAD = block('head');
export const BOOT = block('boot');

// Each app: its site folder, the kit modules it uses (by the name the app
// imports them as), and the copies the old sync left in it.
const APPS = {
  'Quadra-Securities': { site: 'public', mods: ['quadra'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js', 'sw-images.js'] },
  'Quadra-Play': { site: 'public', mods: ['quadra', 'logos', 'names', 'photos', 'catalog'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js', 'sw-images.js', 'lib/logos.mjs', 'lib/names.mjs', 'lib/photos.mjs', 'lib/catalog.mjs'] },
  'Orbit-Sports': { site: 'public', mods: ['quadra', 'logos', 'names', 'photos', 'catalog'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js', 'sw-images.js', 'lib/logos.mjs', 'lib/names.mjs', 'lib/photos.mjs', 'lib/catalog.mjs'] },
  'Orbit-Words': { site: 'public', mods: ['quadra'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js', 'sw-images.js'] },
  'Orbit-Weather': { site: 'public', mods: ['quadra'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js'] },
  'Orbit-Transit': { site: 'public', mods: ['quadra'], copies: ['lib/quadra.mjs', 'quadra.css', 'boot.js'] },
  'Orbit-Class': { site: '.', mods: ['quadra'], copies: ['src/quadra.mjs', 'css/quadra.css'] }
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
  const swap = (name, snippet, ...olds) => {
    const marked = new RegExp(`<!-- kit:${name}[\\s\\S]*?<!-- /kit:${name} -->`);
    if (marked.test(html)) return (html = html.replace(marked, snippet));
    for (const old of olds) if (old.test(html)) return (html = html.replace(old, snippet));
    throw new Error(`${app}: no place for kit:${name}`);
  };
  swap('head', HEAD, /<link rel="stylesheet" href="(?:\.\/)?(?:css\/)?quadra\.css[^"]*" ?\/?>/);
  swap('boot', BOOT, /<script src="\.\/boot\.js"><\/script>/);
  return html;
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
  for (const copy of cfg.copies) await rm(join(cfg.site === '.' ? dir : site, copy), { force: true });
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
