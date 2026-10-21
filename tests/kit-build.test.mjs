// The deploys' addresses (kit/hash.mjs, kit/stamp.mjs, kit/stamp-app.mjs):
// a file's address changes when, and only when, it or something it imports
// changed, so a phone re-downloads only what a deploy changed; and the
// built kit's files reach each other at the import map's addresses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFiles, servedHash } from '../kit/hash.mjs';
import { stampApp } from '../kit/stamp-app.mjs';
import { KIT_TOOLS } from '../kit/preload.mjs';

const REF = /from '\.\/([a-z]+\.mjs)'/g;
const refs = text => [...text.matchAll(REF)].map(m => ({ start: m.index, end: m.index + 8 + m[1].length, target: m[1] }));
const build = files => hashFiles(new Map(Object.entries(files)), { refs, minify: false });

test('a change re-addresses that file and what leads to it, nothing else', async () => {
  const before = await build({ 'app.mjs': "import a from './a.mjs';", 'a.mjs': "import b from './b.mjs';", 'b.mjs': 'export default 1;', 'c.mjs': 'export default 2;' });
  const after = await build({ 'app.mjs': "import a from './a.mjs';", 'a.mjs': "import b from './b.mjs';", 'b.mjs': 'export default 3;', 'c.mjs': 'export default 2;' });
  for (const f of ['app.mjs', 'a.mjs', 'b.mjs']) assert.notEqual(before.hashes.get(f), after.hashes.get(f), f);
  assert.equal(before.hashes.get('c.mjs'), after.hashes.get('c.mjs'));
  assert.equal(after.files.get('a.mjs'), `import b from './b.mjs?v=${after.hashes.get('b.mjs')}';`);
});

test('files that import each other share one hash, and each points at it', async () => {
  const { files, hashes } = await build({ 'x.mjs': "import y from './y.mjs';", 'y.mjs': "import x from './x.mjs';", 'top.mjs': "import x from './x.mjs';" });
  assert.equal(hashes.get('x.mjs'), hashes.get('y.mjs'));
  assert.equal(files.get('x.mjs'), `import y from './y.mjs?v=${hashes.get('y.mjs')}';`);
  assert.equal(files.get('top.mjs'), `import x from './x.mjs?v=${hashes.get('x.mjs')}';`);
});

test("an app's deploy: every reference stamped with its file's hash, the page's version and preloads in place", async () => {
  const root = await mkdtemp(join(tmpdir(), 'stamp-app-'));
  await mkdir(join(root, 'lib'));
  await writeFile(join(root, 'index.html'), `<meta name="build-version" content="dev"><!-- /kit:head --><script>!function(){}('../Shared-Proxy/kit/',null)</script><link rel="stylesheet" href="./styles.css"><script type="module" src="./app.mjs"></script></head>`);
  await writeFile(join(root, 'app.mjs'), "import { a } from './lib/a.mjs';\nimport './lib/side.mjs';\n// a note\nconsole.log(a);\n");
  await writeFile(join(root, 'lib/a.mjs'), "import { b } from '../b.mjs';\nexport const a = b + 1;\n");
  await writeFile(join(root, 'lib/side.mjs'), 'globalThis.side = 1;\n');
  await writeFile(join(root, 'b.mjs'), 'export const b = 1;\n');
  await writeFile(join(root, 'styles.css'), 'body { color: red; }\n');
  const kit = { version: 'k1', files: { 'quadra.mjs': 'abc' } };
  await stampApp({ root, version: 'build1', kit });
  const page = await readFile(join(root, 'index.html'), 'utf8');
  const app = await readFile(join(root, 'app.mjs'), 'utf8');
  assert.match(page, /content="build1"/);
  assert.match(page, /href="\.\/styles\.css\?v=[0-9a-f]{12}"/);
  assert.match(page, /src="\.\/app\.mjs\?v=[0-9a-f]{12}"/);
  assert.match(page, /<link rel="modulepreload" href="\.\/lib\/a\.mjs\?v=[0-9a-f]{12}" \/>/);
  assert.ok(page.includes(`('../Shared-Proxy/kit/',${JSON.stringify(kit)})`), 'the kit hashes baked in');
  assert.match(app, /from"\.\/lib\/a\.mjs\?v=[0-9a-f]{12}"/);
  assert.match(app, /import"\.\/lib\/side\.mjs\?v=[0-9a-f]{12}"/);
  assert.ok(!app.includes('a note'), 'minified');
  assert.match(await readFile(join(root, 'lib/a.mjs'), 'utf8'), /from"\.\.\/b\.mjs\?v=[0-9a-f]{12}"/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'version.json'), 'utf8')), { version: 'build1' });
  // Each file's address is the hash of exactly what's served (what kit/sw.js checks).
  assert.ok(page.includes(`./app.mjs?v=${servedHash(app)}`), "app.mjs's address is its served text's hash");
});

test("the built kit: minified, its files import each other through the map, every file's hash listed", async () => {
  const out = await mkdtemp(join(tmpdir(), 'kit-build-'));
  execFileSync(process.execPath, [new URL('../kit/stamp.mjs', import.meta.url).pathname, out, 'v1'], { stdio: 'ignore' });
  const built = (await readdir(join(out, 'kit'))).sort();
  for (const tool of KIT_TOOLS) assert.ok(!built.includes(tool), `${tool} isn't served`);
  const { version, files } = JSON.parse(await readFile(join(out, 'kit/version.json'), 'utf8'));
  assert.equal(version, 'v1');
  assert.deepEqual(Object.keys(files).sort(), built.filter(f => /\.(m?js|css)$/.test(f)));
  for (const name of built.filter(f => f.endsWith('.mjs'))) {
    const text = await readFile(join(out, 'kit', name), 'utf8');
    assert.equal(files[name], servedHash(text), `${name}'s hash is its served text's`);
    assert.ok(!/(?:from|import\(|import)\s*['"]\.\//.test(text), `${name} still imports by ./`);
    for (const m of text.matchAll(/(?:from|import\(|import)\s*['"]#kit\/([^'"?]+)['"]/g)) assert.ok(built.includes(m[1]), `${name} → ${m[1]}`);
  }
  // A second build of the same kit: the same hashes.
  const again = await mkdtemp(join(tmpdir(), 'kit-build-'));
  await cp(join(out, 'kit'), join(again, 'old'), { recursive: true });
  execFileSync(process.execPath, [new URL('../kit/stamp.mjs', import.meta.url).pathname, again, 'v2'], { stdio: 'ignore' });
  assert.deepEqual(JSON.parse(await readFile(join(again, 'kit/version.json'), 'utf8')).files, files);
});
