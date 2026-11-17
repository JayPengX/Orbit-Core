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
