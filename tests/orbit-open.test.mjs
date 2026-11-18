// /app/?open=<address> opens only this site's own pages (2026-11-17). It took any address as it came: a link
// to orbit.jaypengx.com/app/?open=javascript:… ran a script as Orbit on a computer or in the installed Orbit
// (the signed-in Pass and everything it keeps, read by whoever made the link), and ?open=https://another.site/sports/
// showed that site's page in Orbit's window, full screen, under Orbit's address, with the camera and
// location Orbit's frames are allowed. Both proven on the live site, and so was the home page's forward
// (/?open=… in an Orbit window goes on to /app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { ownPage, sitePage } from '../kit/suite.mjs';

const door = readFileSync(new URL('../site/app/index.html', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../kit/suite.mjs', import.meta.url), 'utf8');

// The page's own first lines (the script that reads ?open=), run as written in a computer's window at `search`.
function firstOf(search) {
  const code = [...door.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes('ORBIT_FIRST'));
  assert.ok(code, 'the script that reads ?open=');
  const store = () => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: k => void m.delete(k) };
  };
  const window = {};
  const location = { search, origin: 'https://orbit.jaypengx.com', pathname: '/app/', href: `https://orbit.jaypengx.com/app/${search}` };
  vm.runInNewContext(code, { window, location, URL, sessionStorage: store(), localStorage: store(), navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }), Date, JSON, decodeURIComponent });
  return window.ORBIT_FIRST ? JSON.parse(JSON.stringify(window.ORBIT_FIRST)) : null;
}
const q = url => `?open=${encodeURIComponent(url)}`;

test('?open= takes a page of this site, by its path', () => {
  assert.deepEqual(firstOf(q('/sports/#game=nba/1')), { url: '/sports/#game=nba/1', y: 0 });
  assert.deepEqual(firstOf(`?o=tagA&open=${encodeURIComponent('/transit/?x=1#pin=2')}`), { url: '/transit/?x=1#pin=2', y: 0 });
  assert.deepEqual(firstOf(q('https://orbit.jaypengx.com/admin/#health')), { url: '/admin/#health', y: 0 });
  assert.equal(firstOf(''), null);
});

test('?open= never takes a script or another site’s page', () => {
  for (const bad of [
    'javascript:alert(document.domain)',
    'javascript:/sports/;alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://example.com/sports/',
    '//example.com/sports/',
    '/\\example.com/sports/',
    '/\t/example.com/sports/',
    'https://orbit.jaypengx.com.example.com/sports/',
    'https://orbit.jaypengx.com@example.com/sports/'
  ])
    assert.equal(firstOf(q(bad)), null, bad);
  // (An address that can't be read at all: nothing, and the page goes on.)
  assert.equal(firstOf('?open=%E0%A4%A'), null);
});

test('Orbit’s window holds only this site’s own app pages (ownPage)', () => {
  const base = 'https://orbit.jaypengx.com/app/';
  const paths = { match: '/sports/', transit: '/transit/' };
  assert.deepEqual(ownPage('/sports/#game=1', base, paths), { app: 'match', url: '/sports/#game=1' });
  assert.deepEqual(ownPage('https://orbit.jaypengx.com/transit/?a=1#b', base, paths), { app: 'transit', url: '/transit/?a=1#b' });
  for (const bad of ['javascript:/sports/;alert(1)', 'https://example.com/sports/', '//example.com/sports/', 'data:text/html,x', '/admin/', '/app/', '', null]) assert.equal(ownPage(bad, base, paths), null, String(bad));
  // The host shows an address only as that app's own page, and a notice's the same way.
  assert.match(suite, /const show = \(id, url = null, y = 0\) => \{\s+if \(!BRANDS\[id\]\) return;\s+[^\n]*\n\s+url = \(url && sitePage\(url\)\?\.url\) \|\| null;/);
  assert.equal(sitePage('/money/?a=1#b', base).url, '/money/?a=1#b');
  for (const bad of ['javascript:/sports/;alert(1)', 'https://example.com/sports/', '//example.com/x', '/\\example.com/x', 'data:text/html,x', 'blob:https://orbit.jaypengx.com/1']) assert.equal(sitePage(bad, base), null, bad);
  assert.match(suite, /open\(url\) \{\s+const to = ownPage\(url\);\s+if \(to\) api\.go\(to\.app, to\.url\);/);
  // The page: another site's address is refused before anything is opened with it.
  const hold = door.slice(door.indexOf('const hold = first =>'), door.indexOf('// The list of apps'));
  assert.ok(hold.indexOf("if (to.origin !== location.origin) return void (showList(), addressOf(null));") > 0);
  assert.ok(hold.indexOf('to.origin !== location.origin') < hold.indexOf('location.assign('));
  assert.doesNotMatch(hold, /location\.assign\(first\.url\)/);
});

// Orbit's window took in the whole kit (orbit.mjs and ui.mjs, 97 KB on the wire and most of its script time)
// before it asked for the app to show: the app's page was asked for 2.1 s into a first opening on slow 4G, and
// 0.7 s into every later one (2026-11-18). It starts on the small files that hold an app; the rest comes behind.
test("Orbit's window asks for the app before the rest of the kit: its first files are the small ones, and stay small", async () => {
  const module = /<script type="module">([\s\S]*?)<\/script>/.exec(door)[1];
  const first = /await Promise\.all\(\[([^\n]*)\]\)/.exec(module)[1];
  const asked = [...first.matchAll(/import\('#kit\/([^']+)'\)/g)].map(m => m[1]).sort();
  assert.deepEqual(asked, ['brand.mjs', 'domain.mjs', 'orbit-mine.mjs', 'suite.mjs'], 'what the window waits for first');
  // orbit.mjs and ui.mjs: asked for in one place, after the app (or by whatever needs them).
  for (const big of ['orbit.mjs', 'ui.mjs']) {
    const at = [...module.matchAll(new RegExp(`import\\('#kit/${big.replace('.', '\\.')}'\\)`, 'g'))].map(m => m.index);
    assert.equal(at.length, 1, big);
    assert.ok(at[0] > module.indexOf('const kit = () =>') && at[0] < module.indexOf('const hold = '), `${big} is the rest of the kit`);
  }
  // (And none of the first files brings the big ones with it.)
  const { kitGraph } = await import('../kit/preload.mjs');
  const kitDir = new URL('../kit/', import.meta.url).pathname;
  const reached = await kitGraph(asked.map(f => kitDir + f), kitDir);
  for (const big of ['orbit.mjs', 'ui.mjs']) assert.ok(!reached.has(big), `${big} is imported by one of ${asked.join(', ')}`);
  // The head says whose window this is before any of the kit is in: a phone's browser (the add page) never, Orbit's own always.
  const head = [...door.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes('ORBIT_FIRST'));
  const mark = (ua, standalone) => {
    const store = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const window = {};
    vm.runInNewContext(head, { window, location: { search: '', origin: 'https://orbit.jaypengx.com', pathname: '/app/' }, URL, sessionStorage: store(), localStorage: store(), navigator: { userAgent: ua, maxTouchPoints: 0, standalone }, matchMedia: () => ({ matches: false }), Date, JSON, decodeURIComponent });
    return window.ORBIT_WINDOW === 1;
  };
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)';
  assert.equal(mark(iphone, false), false, 'a phone’s browser: the add page, decided by the kit');
  assert.equal(mark(iphone, true), true, 'the installed Orbit');
  assert.equal(mark('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', undefined), true, 'a computer');
});

// The window holds an app before orbit.mjs is in, and keeps its fit for the keys at __orbitFit (suite.mjs host).
// orbit.mjs marked its own name-fitting watch as started under that same name: coming in second, it took the
// watch for started and never ran it in the window (the list's and the sheets' long names never fitted).
test("the kit coming in behind an app still starts its own watches: nothing of the host's is its mark", () => {
  const orbit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  assert.match(suite, /globalThis\.__orbitFit = fit;/, "the host's fit for the keys");
  assert.doesNotMatch(orbit, /globalThis\.__orbitFit/, 'orbit.mjs marks its watches with names of its own');
});
