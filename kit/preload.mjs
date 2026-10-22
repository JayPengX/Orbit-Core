// A build tool (each app's deploy, never served): the kit modules an app's
// first screen imports, listed in the page as modulepreload, so the browser
// asks for them all with the page instead of finding them one import level
// at a time (a chain five modules deep was five round trips after the app's
// own files).
//
//   import { kitPreloads } from '<kit>/preload.mjs';
//   html = html.replace('<!-- /kit:head -->', `<!-- /kit:head -->\n${await kitPreloads([entry…], kitDir)}`);
//
// Followed: static imports, `#kit/…` from the app and inside the kit, and
// the kit's own `./…` imports; and an app's own `import('#kit/…')`, which
// starts as the app loads (Transit and Weather wait for the holidays before
// their first screen), while a kit file's dynamic import stays lazy (the
// Pass sheet's pass.mjs). The links are written by the page with
// ORBIT_KIT.url (each file's hash as this device noted it, the import
// map's own address; Weather's own link to the holidays had no version, so
// on a phone they were fetched twice).
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';

// The kit's build and dev tools: in the folder, never served (stamp.mjs
// leaves them out of the site) nor in an app's import map (apps.mjs).
export const KIT_TOOLS = ['apps.mjs', 'hash.mjs', 'link.mjs', 'loader.html', 'preload.mjs', 'stamp-app.mjs', 'stamp.mjs'];

const STATIC = /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"?]+)['"]|(?:^|[\s;])import\s*['"]([^'"?]+)['"]/g;
const DYNAMIC_KIT = /\bimport\(\s*['"](#kit\/[^'"?]+)['"]\s*\)/g;

// Every kit module the entries reach: name → reached by `#kit/` (true) or only relatively (false).
export async function kitGraph(entries, kitDir) {
  const kit = resolve(kitDir);
  const found = new Map();
  const seen = new Set();
  const walk = async file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = await readFile(file, 'utf8').catch(() => '');
    const inKit = dirname(file) === kit;
    const specs = [...text.matchAll(STATIC)].map(m => m[1] || m[2]).concat(inKit ? [] : [...text.matchAll(DYNAMIC_KIT)].map(m => m[1]));
    for (const spec of specs) {
      let target = null;
      let mapped = false;
      if (spec.startsWith('#kit/')) (target = join(kit, spec.slice(5))), (mapped = true);
      else if (spec.startsWith('.')) target = resolve(dirname(file), spec);
      if (!target) continue;
      if (dirname(target) === kit) {
        const name = basename(target);
        found.set(name, found.get(name) || mapped);
      }
      await walk(target);
    }
  };
  for (const e of entries) await walk(resolve(e));
  return found;
}

// The page's <script> writing the links (after kit:head, which defines
// ORBIT_KIT and preloads orbit.mjs and brand.mjs), each at the address the
// import map gives it (ORBIT_KIT.url): the built kit's files import each
// other through the map too (kit/stamp.mjs), so every one can be preloaded.
export async function kitPreloads(entries, kitDir) {
  const found = await kitGraph(entries, kitDir);
  for (const done of ['orbit.mjs', 'brand.mjs']) found.delete(done);
  const names = [...found.keys()].sort();
  if (!names.length) return '';
  return `<script>[${names.map(n => `'${n}'`).join(',')}].forEach(function(f){document.write('<link rel="modulepreload" href="'+ORBIT_KIT.url(f)+'">')})</script>`;
}
