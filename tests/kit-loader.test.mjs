// The kit as the apps load it: the loader's import map lists every module
// that's served (an app importing one it lacks fails to load at all), every
// import inside the kit resolves, and the build tools stay out of the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { KIT_TOOLS, kitGraph } from '../kit/preload.mjs';

const KIT = new URL('../kit/', import.meta.url);
const files = (await readdir(KIT)).sort();
const modules = files.filter(f => f.endsWith('.mjs'));
const served = modules.filter(f => !KIT_TOOLS.includes(f));

test("the loader's import map lists every module the kit serves, and no tool", async () => {
  const loader = await readFile(new URL('loader.html', KIT), 'utf8');
  const listed = /f=\[([^\]]*)\]/.exec(loader)[1].split(',').map(s => s.replace(/'/g, ''));
  assert.deepEqual(listed, served, 'node kit/apps.mjs writes this list into every app; keep the template the same');
  for (const tool of KIT_TOOLS) assert.ok(files.includes(tool), `${tool} is a tool that exists`);
});

test('every import inside the kit resolves to a kit module, by #kit/ or ./', async () => {
  const IMPORT = /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"?]+)['"]|import\(\s*['"]([^'"?]+)['"]\s*\)/g;
  for (const name of [...served, 'boot.js', 'sw-images.js']) {
    const text = await readFile(new URL(name, KIT), 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('node:')) assert.fail(`${name} imports ${spec}: a served module can't use Node`);
      const target = spec.startsWith('#kit/') ? spec.slice(5) : spec.startsWith('./') ? spec.slice(2) : null;
      if (!target) continue;
      await access(new URL(target, KIT)).catch(() => assert.fail(`${name} imports ${spec}, which isn't in the kit`));
      assert.ok(!KIT_TOOLS.includes(target), `${name} imports the tool ${target}, which isn't served`);
    }
  }
});

test('every served module loads in Node on its own (the Worker and the tests import them so)', async () => {
  // (quadra.mjs and the modules with a page wait for a document only when used.)
  for (const name of served) await import(new URL(name, KIT));
});

test("the preload graph follows the kit's own imports (Play's chain to the odds)", async () => {
  const found = await kitGraph([new URL('play-sources.mjs', KIT).pathname], new URL('.', KIT).pathname);
  for (const name of ['play-kambi.mjs', 'play-house.mjs', 'settle.mjs', 'play-odds.mjs', 'play-rules.mjs']) assert.ok(found.has(name), name);
});
