// One live copy of an app (Jay 2026-11-06: "our system that stop a session
// when you have two same app open is no longer there"). The same app open
// twice: only the one in use reads; the others go quiet, 在這裡繼續 takes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kit = await import('../kit/orbit.mjs');
const src = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
const body = (from, len = 1600) => src.slice(src.indexOf(from), src.indexOf(from) + len);

test('a quiet copy holds back reads to our Worker only, never the Pass itself', () => {
  const api = 'https://orbit-workers-proxy.pengzjay.workers.dev';
  assert.equal(kit.pausable(`${api}/sports-proxy?url=x&app=match`), true);
  assert.equal(kit.pausable(`${api}/transit/route?a=1`), true);
  assert.equal(kit.pausable(`${api}/data/sports/nba/2026.json`), true);
  assert.equal(kit.pausable('https://orbit.jaypengx.com/api/weather?lat=1'), true);
  // The Pass (claims, the heartbeat) and the speeds go on: they're how a copy gets live again.
  assert.equal(kit.pausable(`${api}/eco`), false);
  assert.equal(kit.pausable('https://orbit.jaypengx.com/api/eco?qt=1'), false);
  assert.equal(kit.pausable(`${api}/config`), false);
  // Other sites (ESPN read from the phone) and the page's own files: not ours to count.
  assert.equal(kit.pausable('https://site.api.espn.com/apis/site/v2/x'), false);
  assert.equal(kit.pausable('https://orbit.jaypengx.com/sports/app.js'), false);
});

test('live by default: nothing held while no other copy took the app', async () => {
  assert.equal(kit.quiet(), false);
  await kit.liveAgain();
});

test('the guard is wired where the reads are (fetch, kept reads, everyDev)', () => {
  // Every fetch: refused (an AbortError, never counted as no network) while quiet.
  assert.match(body('window.fetch = (input, init) =>', 400), /quietNow && pausable\(url\)\) return Promise\.reject\(pausedError\(\)\)/);
  assert.match(body('const pausedError'), /name: 'AbortError'/);
  // A kept read: the copy it has, else it waits (one per key, never lost for it).
  assert.match(body('function keptJson'), /!hit\.waiting/);
  assert.match(body('function keptJson', 3000), /quietNow && saved\) return/);
  assert.match(body('function keptJson', 3000), /await liveAgain\(\)/);
  // A beat: asleep while hidden or quiet, run the moment it's back.
  assert.match(body('export function everyDev', 700), /beatsAsleep\(\)\) return void sleepingBeats\.add/);
  assert.match(body('const beatsAsleep', 200), /quietNow \|\| .*visibilityState === 'hidden'/);
});

test('two tabs of one browser (one session) are told apart, and a screen coming back never takes it from the one in use', () => {
  assert.match(src, /new BroadcastChannel\('orbit-live'\)/);
  // A tab that claims says so; one that hears it goes quiet.
  assert.match(body('liveTabs.onmessage', 500), /tabAway = true;\s*setActive\(false, \{ app, tab: true \}\)/);
  assert.match(body('function claimed(p)', 300), /takeTab\(\)/);
  // Live for the Worker but another tab has it: still quiet.
  assert.match(body('function setActive(next', 300), /if \(next && tabAway\) return;/);
  assert.match(body('function setActive(next', 300), /setQuiet\(started && !next\)/);
  // Back on screen: asked, not claimed (only 在這裡繼續 takes it back from another device); hidden: nothing.
  const wake = body('function wake()', 400);
  assert.match(wake, /visibilityState === 'hidden'\) return/);
  assert.match(wake, /refresh\(\{ claim: false \}\)/);
  assert.doesNotMatch(wake, /claim: true/);
  // Nothing lost: a tab that gave way still saves.
  assert.match(body('get canSave()', 120), /active \|\| Boolean\(live\?\.tab\)/);
  assert.match(body('s.write = ', 200), /!s\.canSave/);
});

test("another device's live copy: a save from here is refused before it's sent", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  let reply = { token: 'tok', wallet: { entries: [] }, active: false, live: { app: 'beats', t: 1 } };
  const ops = [];
  globalThis.fetch = async (url, init = {}) => {
    ops.push(JSON.parse(init.body || '{}').op);
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const s = kit.orbitSession('beats', { heartbeat: 1e9 });
  await s.claim();
  assert.equal(s.active, false);
  assert.equal(s.canSave, false);
  await assert.rejects(s.write({ payload: '{}' }), e => e.code === 'ECO_SESSION_MOVED');
  assert.ok(!ops.includes('write'), 'refused here, never sent');
  // (Never started here: never quiet, whatever the Worker said.)
  assert.equal(kit.quiet(), false);
});
