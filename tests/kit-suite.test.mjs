// Orbit's window (kit/suite.mjs): every app in one home-screen app. The hops
// between apps kept as a browser keeps its history (back, forward, a jump
// dropping what was ahead), each app opened again where it was left, and
// one-shot parts of an address never kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const S = await import('../kit/suite.mjs');

const paths = { match: '/sports/', transit: '/transit/', weather: '/weather/' };

test('the app an address is in, by its folder', () => {
  assert.equal(S.appAt('/sports/', paths), 'match');
  assert.equal(S.appAt('/transit/index.html', paths), 'transit');
  assert.equal(S.appAt('/sports', paths), 'match');
  assert.equal(S.appAt('/app/', paths), null);
  assert.equal(S.appAt('/pass/', paths), null);
});

test('hops: a jump, back, forward, and a jump from the middle drops what was ahead', () => {
  let t = S.arrive(null, 'match', '/sports/');
  assert.deepEqual(t, { list: [{ app: 'match', url: '/sports/' }], i: 0 });
  assert.equal(S.backOf(t), null);
  t = S.record(t, '/sports/#game=1', 420);
  t = S.jump(t, 'transit', '/transit/');
  t = S.arrive(t, 'transit', '/transit/');
  assert.equal(t.i, 1);
  assert.deepEqual(S.backOf(t), { app: 'match', url: '/sports/#game=1', y: 420 });
  t = S.step(t, -1);
  t = S.arrive(t, 'match', '/sports/#game=1');
  assert.equal(S.forwardOf(t).app, 'transit');
  assert.equal(S.backOf(t), null);
  t = S.jump(t, 'weather', '/weather/');
  assert.deepEqual(
    t.list.map(e => e.app),
    ['match', 'weather']
  );
  assert.equal(S.forwardOf(t), null);
});

test('an app opened another way (a link, a notice) counts as a jump; its own pages do not', () => {
  let t = S.arrive(null, 'match', '/sports/');
  t = S.arrive(t, 'match', '/sports/#tab=live');
  assert.equal(t.list.length, 1);
  assert.equal(t.list[0].url, '/sports/#tab=live');
  t = S.arrive(t, 'transit', '/transit/#plan');
  assert.equal(t.list.length, 2);
  assert.equal(S.backOf(t).app, 'match');
});

test('the trail stays short and survives a broken copy', () => {
  let t = S.arrive(null, 'match', '/sports/');
  for (let k = 0; k < 50; k++) t = S.jump(t, k % 2 ? 'match' : 'transit', '/x/');
  assert.equal(t.list.length, S.TRAIL_MAX);
  assert.equal(t.i, S.TRAIL_MAX - 1);
  assert.deepEqual(S.sane({ list: [{ app: 'nope' }], i: 4 }), { list: [], i: -1 });
  assert.deepEqual(S.sane({ list: [{ app: 'match', url: '/' }], i: 9 }).i, 0);
  assert.deepEqual(S.step(S.sane(null), -1), { list: [], i: -1 });
});

test('a handed-over sign-in or a one-time question is never kept', () => {
  assert.equal(S.keepable('/sports/#qh=abc'), '/sports/');
  assert.equal(S.keepable('/transit/#plan=1&qh=abc&ask=x'), '/transit/#plan=1');
  assert.equal(S.keepable('/law/#law=A0030055'), '/law/#law=A0030055');
});

test('an app opens where it was left, lately; else at its start', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const saved = { apps: { match: { url: '/sports/#game=9', y: 300, t: now - 60_000 }, transit: { url: '/transit/#x', y: 0, t: now - 5 * 3_600_000 } } };
  assert.deepEqual(S.resumeOf(saved, 'match', now), { url: '/sports/#game=9', y: 300 });
  assert.equal(S.resumeOf(saved, 'transit', now).url.endsWith('/'), true);
  assert.equal(S.resumeOf(saved, 'transit', now).y, 0);
  assert.equal(S.lastApp(saved), 'match');
  assert.equal(S.lastApp({}), null);
});

test('Orbit is only in its own window: the separate apps never turn into it', () => {
  const kit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  // iPhone and iPad only by the device's mark (each home-screen app its own storage); elsewhere by the window's own.
  assert.match(kit, /export function inSuite\(\)[\s\S]{0,400}sessionStorage\?\.getItem\('orbit\.suite'\) === '1'[\s\S]{0,200}isIOS\(\) && isStandalone\(\)/);
  // Its door goes on to an app only in Orbit's own window, never inside another app's.
  const door = readFileSync(new URL('../site/app/index.html', import.meta.url), 'utf8');
  assert.match(door, /ss\.getItem\('orbit\.window'\) && ss\.getItem\('orbit\.suite'\) !== '1'/);
  const manifest = JSON.parse(readFileSync(new URL('../site/app/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/app/');
  assert.equal(manifest.name, 'Orbit');
});

test('a separate app suggests Orbit at most 3 times, 14 days apart, never after 不再提醒', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(S.askable(null, now), true);
  assert.equal(S.askable({ n: 1, t: now - 86_400_000 }, now), false);
  assert.equal(S.askable({ n: 1, t: now - S.ASK_EVERY }, now), true);
  assert.equal(S.askable({ n: S.ASK_MAX, t: 0 }, now), false);
  assert.equal(S.askable({ n: 0, t: 0, never: true }, now), false);
  // Off until the owner turns it on (admin 開發), and only in a separate app on an iPhone or iPad.
  const kit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  assert.match(kit, /isIOS\(\) && isStandalone\(\) && dev\('suiteAsk'\) === true/);
});

test("back and forward go through the browser's own memory only when the neighbour is right there", () => {
  let n = 0;
  const id = () => `id${++n}`;
  // Sports opened from Orbit's door, then a jump to Transit (the kit's go).
  let t = S.landing(null, 'match', '/sports/', { len: 1, id });
  assert.equal(t.list[0].backOk, undefined);
  t = { ...S.jump(t, 'transit', '/transit/'), pending: { by: 0, app: 'transit' } };
  t = S.landing(t, 'transit', '/transit/', { len: 2, id });
  assert.equal(t.i, 1);
  assert.equal(t.list[1].backOk, 2);
  assert.equal(t.pending, undefined);
  // Back by the browser: Sports again, Transit right ahead.
  t = { ...S.step(t, -1), pending: { by: -1, app: 'match', at: t.list[0].at } };
  t = S.landing(t, 'match', '/sports/', { tag: t.list[0].at, len: 2, id });
  assert.equal(t.i, 0);
  assert.equal(t.list[0].fwdOk, 2);
  // Forward by the browser: Transit, Sports right behind.
  t = { ...S.step(t, 1), pending: { by: 1, app: 'transit', at: t.list[1].at } };
  t = S.landing(t, 'transit', '/transit/', { tag: t.list[1].at, len: 2, id });
  assert.equal(t.i, 1);
  assert.equal(t.list[1].backOk, 2);
  // A reload keeps its place; a link to Weather is a jump with Transit behind it.
  t = S.landing(t, 'transit', '/transit/#x', { tag: t.list[1].at, len: 2, id });
  assert.equal(t.i, 1);
  t = S.landing(t, 'weather', '/weather/', { len: 3, id });
  assert.deepEqual([t.i, t.list[2].app, t.list[2].backOk], [2, 'weather', 3]);
  // A back that opened the address anew (no memory): the same entry, nothing assumed behind it.
  t = S.step(t, -1);
  t = S.landing(t, 'transit', '/transit/', { len: 4, id });
  assert.equal(t.i, 1);
  assert.equal(t.list[1].backOk, 2);
});

test('the apps warmed first: back, forward, then the ones used lately here', () => {
  const now = Date.parse('2026-11-13T00:00:00Z');
  const t = { list: [{ app: 'match' }, { app: 'transit' }, { app: 'news' }], i: 1 };
  const saved = { apps: { weather: { t: now - 1000 }, money: { t: now - 20 * 86_400_000 }, law: { t: now - 5000 }, transit: { t: now } } };
  assert.deepEqual(S.warmOrder(t, saved, 'transit', now), ['match', 'news', 'weather', 'law']);
});

test("Orbit's window closes only the oldest quiet apps: never the one shown, never one playing", async () => {
  const { toClose, KEEP } = await import('../kit/suite.mjs');
  const f = (app, used, playing = false) => ({ app, used, playing });
  const list = [f('beats', 1, true), f('match', 2), f('law', 3), f('transit', 4), f('weather', 5), f('money', 6), f('news', 7)];
  assert.equal(KEEP, 3);
  // shown: news; quiet ones by recency: money, weather, transit kept; law and match closed; beats plays on.
  assert.deepEqual(toClose(list, 'news').sort(), ['law', 'match']);
  assert.deepEqual(toClose(list.slice(0, 3), 'law'), []);
  assert.deepEqual(toClose([f('beats', 1, true), f('a', 2), f('b', 3), f('c', 4), f('d', 5)], 'beats', 3), ['a']);
});

test('Orbit opens on something live, else the last app within an hour, else the list', async () => {
  const { launchTarget, liveNow, AWAY_MS } = await import('../kit/suite.mjs');
  const now = 1_800_000_000_000;
  const saved = { apps: { match: { url: '/Orbit-Sports/#g', y: 40, t: now - 10 * 60_000, home: '/Orbit-Sports/' }, law: { url: '/Orbit-Law/', y: 0, t: now - 3 * 3_600_000, home: '/Orbit-Law/' } } };
  assert.equal(AWAY_MS, 3_600_000);
  // Back within the hour: the last app, where it was left.
  assert.deepEqual(launchTarget(saved, {}, now), { app: 'match', url: '/Orbit-Sports/#g', y: 40 });
  // Away an hour or more, nothing live: the list.
  assert.equal(launchTarget(saved, {}, now + AWAY_MS), null);
  // Orbit's window said which app it showed and when it was left.
  assert.equal(launchTarget({ ...saved, last: 'law', left: now - 5 * 60_000 }, {}, now).app, 'law');
  assert.equal(launchTarget({ ...saved, last: 'match', left: now - 2 * AWAY_MS }, {}, now), null);
  // Something live wins however long away; the one started last of two; a timer that ran out is not live.
  const live = { transit: { t: now - 5 * 3_600_000, url: '/Orbit-Transit/#trip' }, orbit: { t: now - 3_600_000, until: now + 60_000 }, money: { t: now - 60_000, until: now - 1 } };
  assert.deepEqual(liveNow(live, now).map(x => x.app), ['orbit', 'transit']);
  assert.equal(launchTarget(saved, live, now + 2 * AWAY_MS).app, 'transit');
  // (At its start, as on its own: the app shows what's under way itself, never the screen it was minimized on.)
  const { pathOf } = await import('../kit/brand.mjs');
  assert.deepEqual(launchTarget(saved, { transit: live.transit }, now + 2 * AWAY_MS), { app: 'transit', url: pathOf('transit'), y: 0 });
  assert.equal(launchTarget({ apps: {} }, {}, now), null);
});

test("an app held in Orbit's window gets the phone's safe area written in (a frame is told none)", async () => {
  const { withInsets } = await import('../kit/suite.mjs');
  const ins = { top: 59, bottom: 34, left: 0, right: 0 };
  assert.equal(withInsets('--q-bar-gap: max(calc(env(safe-area-inset-bottom) - 14px), 12px);', ins), '--q-bar-gap: max(calc(34px - 14px), 12px);');
  assert.equal(withInsets('bottom: max(12px, env(safe-area-inset-bottom, 0px)); top: env( safe-area-inset-top , var(--x, 4px))', ins), 'bottom: max(12px, 34px); top: 59px');
  assert.equal(withInsets('padding: 0', ins), 'padding: 0');
});

test("a held app's page stops at its ends: a drag past either is held, never a bounce that takes its tabs along", async () => {
  const { pastEnd } = await import('../kit/suite.mjs');
  // (dy > 0: the finger going down, towards the page's top.)
  assert.equal(pastEnd(0, 2000, 800, 30), true);
  assert.equal(pastEnd(0, 2000, 800, -30), false);
  assert.equal(pastEnd(1200, 2000, 800, -30), true);
  assert.equal(pastEnd(1199.5, 2000, 800, -30), true);
  assert.equal(pastEnd(1000, 2000, 800, -30), false);
  assert.equal(pastEnd(1200, 2000, 800, 30), false);
  // (A page shorter than the screen: nowhere to go either way.)
  assert.equal(pastEnd(0, 600, 800, -30), true);
});
