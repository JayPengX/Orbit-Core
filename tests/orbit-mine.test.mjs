// Each Orbit's own setup (kit/orbit-mine.mjs): the tag its icon opens, the
// manifest the proxy serves from it, the looks' pictures, apps changed inside
// it and the Pass's copy of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { APP_ORDER, BRANDS, LOOKS, DEFAULT_LOOK, lookApp, orbitIcon, familyMark } from '../kit/brand.mjs';
import { encodeSetup, decodeSetup, cleanSetup, orbitManifest, lookFiles, startOf, mergeMine, defaultLook } from '../kit/orbit-mine.mjs';
import { handleOrbitManifest } from '../orbit-manifest.js';

test('the plain Orbit has no tag; any other setup round-trips through its tag', () => {
  assert.equal(encodeSetup({}), '');
  assert.equal(encodeSetup({ apps: APP_ORDER, name: 'Orbit', look: DEFAULT_LOOK }), '');
  const s = { name: '上學', apps: ['orbit', 'vocab', 'weather'], look: 'aurora-white' };
  const tag = encodeSetup(s);
  assert.match(tag, /^[A-Za-z0-9_-]+$/);
  // (In the family's order, whatever order they were picked in.)
  assert.deepEqual(decodeSetup(tag), { name: '上學', apps: ['weather', 'orbit', 'vocab'], look: 'aurora-white' });
});

test('a one-app Orbit is named and dressed as its app unless told otherwise', () => {
  assert.deepEqual(cleanSetup({ apps: ['money'] }), { name: 'Money', apps: ['money'], look: 'app-money' });
  assert.equal(defaultLook(['money', 'news']), DEFAULT_LOOK);
});

test('a tag that is not one reads as nothing', () => {
  for (const bad of ['', '!!', 'abc', 'x'.repeat(500), encodeSetup({ apps: ['nope'] }) === '' ? 'eyJhIjoibm9wZSJ9' : 'q']) assert.equal(decodeSetup(bad), null, bad);
});

test('a name is kept short and plain', () => {
  const s = decodeSetup(encodeSetup({ name: '  <b>"a"</b>   very long name indeed here  ', apps: ['news'] }));
  assert.ok(!/[<>"]/.test(s.name));
  assert.ok(s.name.length <= 20);
});

test("each tag's manifest: its own id and start (so a phone keeps Orbits apart), its name and icons", () => {
  const tag = encodeSetup({ name: '通勤', apps: ['transit', 'weather'], look: 'ocean' });
  const m = orbitManifest(tag);
  assert.equal(m.id, `/app/?o=${tag}`);
  assert.equal(m.start_url, startOf(tag));
  assert.equal(m.scope, '/');
  assert.equal(m.name, '通勤');
  assert.deepEqual(m.icons.map(i => i.src), ['/app/looks/ocean/icon.png', '/app/looks/ocean/maskable.png']);
  assert.notEqual(orbitManifest(encodeSetup({ apps: ['transit'] })).id, m.id);
  assert.equal(orbitManifest('nope'), null);
});

test('the proxy answers a tag with its manifest and anything else with 404', async () => {
  const tag = encodeSetup({ apps: ['beats'] });
  const ok = handleOrbitManifest(new Request(`https://x/orbit-manifest?o=${tag}`), {});
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('Content-Type'), /manifest\+json/);
  assert.equal((await ok.json()).name, 'Beats');
  assert.equal(handleOrbitManifest(new Request('https://x/orbit-manifest?o=zz'), {}).status, 404);
});

test("every look draws, and its home-screen pictures are on the site (an app's are its own)", async () => {
  assert.equal(new Set(LOOKS).size, LOOKS.length);
  for (const look of LOOKS) {
    assert.match(orbitIcon(look), /^<svg/);
    const f = lookFiles(look);
    if (lookApp(look)) {
      assert.equal(f.apple, `/${BRANDS[lookApp(look)].slug}/icons/apple-touch-icon.png`);
      continue;
    }
    for (const file of ['apple.png', 'icon.png', 'maskable.png']) await access(new URL(`../site/app/looks/${look}/${file}`, import.meta.url));
  }
  assert.equal(familyMark(), orbitIcon(DEFAULT_LOOK));
});

test("Orbit's page reads an app look's icon by the app's slug, as kit/brand.mjs has them", async () => {
  const page = await readFile(new URL('../site/app/index.html', import.meta.url), 'utf8');
  const map = JSON.parse(/var slug = (\{[^}]*\})/.exec(page)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  for (const id of APP_ORDER) assert.equal(map[id] || id, BRANDS[id].slug, id);
});

test("apps changed in an Orbit: the newer of the phone's and the Pass's wins, per Orbit", () => {
  const local = { a: { apps: ['money'], t: 10 }, b: { apps: ['news'], t: 5 } };
  const held = { a: { apps: ['news'], t: 8 }, b: { apps: ['beats'], t: 9 }, c: { apps: ['law', 'nope'], t: 3 } };
  const r = mergeMine(local, held);
  assert.deepEqual(r.local.a.apps, ['money']);
  assert.deepEqual(r.local.b.apps, ['beats']);
  assert.deepEqual(r.local.c.apps, ['law']);
  assert.ok(r.changed);
  assert.ok(r.up.a);
  assert.equal(mergeMine({ a: { apps: ['money'], t: 1 } }, { a: { apps: ['money'], t: 1 } }).up, null);
});
