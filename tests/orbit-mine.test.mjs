// Each Orbit's own setup (kit/orbit-mine.mjs): the tag its icon opens, the
// manifest the proxy serves from it, the looks' pictures, apps changed inside
// it and the Pass's copy of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { APP_ORDER, BRANDS, LOOKS, DEFAULT_LOOK, lookApp, orbitIcon, familyMark } from '../kit/brand.mjs';
import { encodeSetup, decodeSetup, cleanSetup, orbitManifest, lookFiles, startOf, mergeMine, defaultLook, newId, appsOf } from '../kit/orbit-mine.mjs';
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

test('every Orbit added has its own id, so apps changed in one never show up in another', () => {
  const a = encodeSetup({ id: newId() }), b = encodeSetup({ id: newId() });
  assert.notEqual(a, b);
  assert.deepEqual(decodeSetup(a).apps, APP_ORDER);
  assert.equal(decodeSetup(a).name, 'Orbit');
  const saved = { '': { apps: ['money'], t: 1 } };
  assert.deepEqual(appsOf(a, saved), APP_ORDER);
  assert.deepEqual(appsOf(b, { ...saved, [a]: { apps: ['news'], t: 2 } }), APP_ORDER);
  assert.notEqual(orbitManifest(a).id, orbitManifest(b).id);
  const one = encodeSetup({ apps: ['money'], id: newId() });
  assert.deepEqual(decodeSetup(one).apps, ['money']);
  assert.equal(decodeSetup(one).name, 'Money');
});

// Jay 2026-11-24: on a friend's Pixel a second Orbit said "already installed": Chrome
// on Android takes a page inside an installed app's scope for that app, and every
// Orbit's scope was '/'. Android's Orbits each have a scope of their own, apart.
test("Android: each Orbit's manifest has a scope of its own, none inside another's; an iPhone's stays as it was", async () => {
  const a = encodeSetup({ apps: [...APP_ORDER], id: newId() });
  const b = encodeSetup({ apps: [...APP_ORDER], id: newId() });
  const one = encodeSetup({ apps: [APP_ORDER[0]] });
  const [ma, mb, mo] = [a, b, one].map(t => orbitManifest(t, { android: true }));
  for (const m of [ma, mb, mo]) {
    assert.match(m.scope, /^\/app\/o\/[^/]+\/$/);
    assert.ok(m.start_url.startsWith(m.scope), 'the start inside its scope');
  }
  const scopes = [ma.scope, mb.scope, mo.scope];
  for (const x of scopes) for (const y of scopes) if (x !== y) assert.ok(!x.startsWith(y), `${x} inside ${y}`);
  assert.equal(ma.id, orbitManifest(a).id, 'the same Orbit, the same id');
  assert.equal(orbitManifest(a).scope, '/');
  assert.equal(orbitManifest(a).start_url, startOf(a));
  const got = await handleOrbitManifest(new Request(`https://api.example/orbit-manifest?o=${b}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile' } }), {});
  assert.equal((await got.json()).scope, mb.scope);
  assert.match(got.headers.get('Vary') || '', /User-Agent/);
});

// Jay 2026-11-24: a one-app Orbit's Pass sheet (its App list, 今天, 說明's 打開) led into every other app.
test("in an Orbit the Pass sheet shows every app but opens only its own, the way to another Orbit under them", async () => {
  const { passApps } = await import('../kit/pass.mjs');
  const src = await readFile(new URL('../kit/pass.mjs', import.meta.url), 'utf8');
  assert.deepEqual(passApps([...APP_ORDER], [APP_ORDER[0]]), [APP_ORDER[0]]);
  assert.deepEqual(passApps([...APP_ORDER], null), [...APP_ORDER]);
  // Every app listed (Jay 11-24: "still show all of it so they know"), one outside the Orbit not opened.
  assert.match(src, /const ids = Object\.keys\(APPS\);/);
  assert.match(src, /const out = !here && !passApps\(\[id\], mine\)\.length;/);
  assert.match(src, /disabled: here \|\| out/);
  assert.match(src, /m\.newOrbitCard/);
  // 說明: every guide; 打開 only for this Orbit's own.
  assert.match(src, /const order = HELP_ORDER;/);
  assert.match(src, /APPS\[at\] && reachable\(at\)/);
});

// Jay 11-26: in an Orbit of several apps, one not in it is added from the Pass sheet as from its own page;
// only an Orbit of one app is locked.
test('the Pass sheet adds an app to an Orbit of several, never to one of a single app', async () => {
  const { canAddHere } = await import('../kit/pass.mjs');
  assert.equal(canAddHere({ apps: ['class', 'news', 'law'] }, true), true);
  assert.equal(canAddHere({ apps: ['class'] }, true), false);
  assert.equal(canAddHere({ apps: ['class', 'news'] }, false), false, 'a separate app’s window: every app opens anyway');
});
