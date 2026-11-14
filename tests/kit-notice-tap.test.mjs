// A notice's tap opens what it is about (Jay 2026-11-06: "for sport it open
// that game"): kit sw.js hands the address to an open page (orbit.mjs
// goNotice), which goes there in place even when it is on that address; a
// page that doesn't answer is navigated; none open, a window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const swSource = readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://orbit.test/sports/';

function tap(url, clients) {
  const handlers = {};
  const did = [];
  const self = {
    ORBIT_SW: { cache: 'orbit-test-v1' },
    location: { origin: 'https://orbit.test' },
    registration: { scope: SCOPE },
    addEventListener: (t, f) => (handlers[t] = f),
    navigator: { onLine: true },
    clients: { matchAll: async () => clients, openWindow: async u => did.push(['open', u]) }
  };
  for (const c of clients) {
    c.focus = async () => c;
    c.navigate = async u => did.push(['navigate', u]);
    c.postMessage = (data, [port]) => {
      did.push(['told', data.url]);
      // (Another app's page answers only in Orbit's window: kit suite.mjs.)
      if (c.answers && (!data.other || c.suite)) port.postMessage('ok');
    };
  }
  vm.runInNewContext(swSource, { self, caches: {}, fetch: async () => new Response(''), Response, Request, Headers, URL, AbortController, MessageChannel, setTimeout, clearTimeout, crypto, console, Promise, Date });
  let done;
  handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: p => (done = p) });
  return done.then(() => did);
}

test('an open app is told where the notice points, in place', async () => {
  const did = await tap(`${SCOPE}#game=nba/1/2026-11-06`, [{ url: `${SCOPE}#game=nba/1/2026-11-06`, answers: true }]);
  assert.deepEqual(did, [['told', `${SCOPE}#game=nba/1/2026-11-06`]]);
});
test('a page that does not answer is navigated there', async () => {
  const did = await tap(`${SCOPE}#game=nba/1`, [{ url: SCOPE, answers: false }]);
  assert.deepEqual(did, [['told', `${SCOPE}#game=nba/1`], ['navigate', `${SCOPE}#game=nba/1`]]);
});
test('none open: a window at the address; another app open is left alone', async () => {
  const did = await tap(`${SCOPE}#game=nba/1`, [{ url: 'https://orbit.test/weather/', answers: true }]);
  assert.deepEqual(did, [
    ['told', `${SCOPE}#game=nba/1`],
    ['open', `${SCOPE}#game=nba/1`]
  ]);
});

test("Orbit's window on another app's page: that page goes there itself, no second window", async () => {
  const did = await tap(`${SCOPE}#game=nba/1`, [{ url: 'https://orbit.test/weather/', answers: true, suite: true }]);
  assert.deepEqual(did, [['told', `${SCOPE}#game=nba/1`]]);
});
