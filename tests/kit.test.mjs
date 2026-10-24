// The shared kit's pure parts: the pool, Plus, looks and the recommender.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const store = new Map();
const tabStore = new Map();
globalThis.localStorage = storage(store);
globalThis.sessionStorage = storage(tabStore);
const kit = await import('../kit/orbit.mjs');

test('the pool is every entry and every app figure', () => {
  const w = { entries: [{ id: 'a', amount: 100, app: 'stock' }, { id: 'b', amount: -40, app: 'eco' }], snap: { stock: { cash: 1000, t: 1 } } };
  assert.equal(kit.poolBalance(w), 1060);
});

test('recommendations follow affinity, stay diverse, and learn from dismissals', () => {
  store.clear();
  const now = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 5; i++) kit.recordAffinity('match', ['team:mlb:LAD', 'league:mlb'], 1, now);
  kit.recordAffinity('match', ['league:epl'], 1, now);
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `lad${i}`, keys: ['team:mlb:LAD', 'league:mlb'], quality: 0.5, group: 'LAD' })),
    { id: 'epl', keys: ['league:epl'], quality: 0.5, group: 'epl' },
    { id: 'nba', keys: ['league:nba'], quality: 0.5, group: 'nba' }
  ];
  const top = kit.rank(items, { n: 4, now });
  assert.equal(top[0].group, 'LAD');
  assert.equal(top[0].why, 'team:mlb:LAD');
  // Not all four from the same team.
  assert.ok(new Set(top.map(t => t.group)).size >= 2);
  kit.dismiss(top[0].id);
  assert.notEqual(kit.rank(items, { n: 1, now })[0].id, top[0].id);
});

test('affinity decays: last month counts for less than today', () => {
  store.clear();
  const now = Date.UTC(2026, 9, 1);
  kit.recordAffinity('stock', ['sym:OLD'], 5, now - 60 * 86_400_000);
  kit.recordAffinity('stock', ['sym:NEW'], 2, now);
  const a = kit.affinity(null, now);
  assert.ok(a['sym:NEW'] > a['sym:OLD']);
  // The wallet copy carries the strongest keys.
  const patch = kit.affinityPatch('stock', now).settings['aff:stock'].value;
  assert.ok(patch['sym:NEW']);
});

test('pass codes', () => {
  assert.equal(kit.cleanCode('abcde-23456'), 'ABCDE23456');
  assert.equal(kit.formatPass('ABCDE23456'), 'ABCDE-23456');
});

test('proxyJson batches requests made together and remembers answers', async () => {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.searchParams.has('batch')) {
      const r = u.searchParams.getAll('u').map(x => ({ s: 200, b: { echo: x } }));
      return new Response(JSON.stringify({ r }), { status: 200 });
    }
    return new Response(JSON.stringify({ echo: u.searchParams.get('url') }), { status: 200 });
  };
  const [a, b, c] = await Promise.all([kit.proxyJson('https://x.test/a', { persist: false }), kit.proxyJson('https://x.test/b', { persist: false }), kit.proxyJson('https://x.test/c', { trim: 'kambi-events', persist: false })]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('batch=1'));
  assert.equal(a.echo, 'https://x.test/a');
  assert.equal(b.echo, 'https://x.test/b');
  assert.equal(c.echo, 'kambi-events!https://x.test/c');
  // Asked again within its time: from memory.
  await kit.proxyJson('https://x.test/a', { persist: false });
  assert.equal(calls.length, 1);
  // Alone: a plain request.
  const d = await kit.proxyJson('https://x.test/d', { persist: false });
  assert.equal(d.echo, 'https://x.test/d');
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].includes('batch=1'));
  // `alone`: its own request even when others are asked with it (a batch answers only when its slowest is in).
  calls.length = 0;
  const [e] = await Promise.all([kit.proxyJson('https://x.test/e', { persist: false, alone: true }), kit.proxyJson('https://x.test/f', { persist: false }), kit.proxyJson('https://x.test/g', { persist: false })]);
  assert.equal(e.echo, 'https://x.test/e');
  assert.equal(calls.length, 2);
  assert.ok(calls.some(u => u.includes('batch=1') && !u.includes('x.test%2Fe')));
  assert.ok(calls.some(u => !u.includes('batch=1') && u.includes('x.test%2Fe') && !u.includes('mirror=0')));
});

test('a batch is taken a line at a time: each item the moment the proxy writes it, one with no line asked alone', async () => {
  const calls = [];
  let finish;
  const last = new Promise(r => (finish = r));
  globalThis.fetch = async url => {
    calls.push(String(url));
    const u = new URL(url);
    if (!u.searchParams.has('batch')) return new Response(JSON.stringify({ alone: u.searchParams.get('url') }), { status: 200 });
    assert.ok(u.searchParams.has('lines'));
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(c) {
        // The second item first, cut mid-line; the first once the test lets it; the third never.
        c.enqueue(enc.encode('{"i":1,"s":200,"b":{"n'));
        c.enqueue(enc.encode('":2}}\n'));
        await last;
        c.enqueue(enc.encode('{"i":0,"s":200,"b":{"n":1}}\n'));
        c.close();
      }
    });
    return new Response(body, { status: 200 });
  };
  const [a, b, c] = ['https://x.test/l1', 'https://x.test/l2', 'https://x.test/l3'].map(x => kit.proxyJson(x, { persist: false }));
  assert.deepEqual(await b, { n: 2 });
  let aIn = false;
  a.then(() => (aIn = true));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(aIn, false);
  finish();
  assert.deepEqual(await a, { n: 1 });
  assert.deepEqual(await c, { alone: 'https://x.test/l3' });
  assert.equal(calls.length, 2);
});

test("a failed read answers the copy the device has, of any age (a league never turns into 'no data' for a refused minute)", async () => {
  const kept = new Map();
  const had = globalThis.caches;
  globalThis.caches = { open: async () => ({ match: async k => kept.get(k)?.clone() || null, put: async (k, r) => void kept.set(k, r), keys: async () => [], delete: async () => true }) };
  let up = true;
  globalThis.fetch = async url => (up ? new Response(JSON.stringify({ n: 1, url: String(url) }), { status: 200 }) : new Response('{}', { status: 502 }));
  const u = 'https://x.test/kept';
  assert.equal((await kit.proxyJson(u, { ttl: 1 })).n, 1);
  await new Promise(r => setTimeout(r, 20));
  up = false;
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await kit.proxyJson(u, { ttl: 1 })).n, 1, 'the old copy');
  await assert.rejects(kit.proxyJson('https://x.test/never', { ttl: 1 }), 'nothing kept: a failure');
  globalThis.caches = had;
});

test("a live read (asked every few seconds) reads the device's copy once and writes it once a minute, the last answer in memory its fallback", async () => {
  const kept = new Map();
  let reads = 0;
  let writes = 0;
  const had = globalThis.caches;
  globalThis.caches = { open: async () => ({ match: async k => (reads++, kept.get(k)?.clone() || null), put: async (k, r) => (writes++, void kept.set(k, r)), keys: async () => [], delete: async () => true }) };
  let n = 0;
  let up = true;
  globalThis.fetch = async () => (up ? new Response(JSON.stringify({ n: ++n }), { status: 200 }) : new Response('{}', { status: 502 }));
  const u = 'https://x.test/live-poll';
  for (let i = 1; i <= 4; i++) {
    assert.equal((await kit.proxyJson(u, { ttl: 1, mirror: false })).n, i);
    await new Promise(r => setTimeout(r, 5));
  }
  assert.equal(reads, 1, "the device's copy read for the first read only");
  assert.equal(writes, 1, 'written once in the minute');
  up = false;
  assert.equal((await kit.proxyJson(u, { ttl: 1, mirror: false })).n, 4, 'a failure: the last answer this page had');
  globalThis.caches = had;
});

test('packJson reads a pack from the family\'s data (/data/, R2), not the data proxy; a pack not there is a failure', async () => {
  const asked = [];
  globalThis.fetch = async url => (asked.push(String(url)), String(url).endsWith('nba/2026.json') ? new Response('{"events":[1,2]}', { status: 200 }) : new Response('nope', { status: 404 }));
  assert.deepEqual((await kit.packJson('sports/nba/2026.json')).events, [1, 2]);
  assert.equal(asked[0], 'https://orbit-workers-proxy.pengzjay.workers.dev/data/sports/nba/2026.json');
  await assert.rejects(kit.packJson('sports/nope/2026.json'), e => e.status === 404);
});

test("every read goes to the proxy in the batch (the proxy answers a held read from the nightly mirror); one the app knows is behind asks the source on its own (mirror=0)", async () => {
  const asked = [];
  globalThis.fetch = async url => {
    asked.push(String(url));
    const u = new URL(String(url));
    if (u.searchParams.has('batch')) return new Response(JSON.stringify({ r: u.searchParams.getAll('u').map(() => ({ s: 200, b: { from: 'batch' } })) }), { status: 200 });
    return new Response(JSON.stringify({ from: 'one' }), { status: 200 });
  };
  const roster = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/21/roster';
  const day = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261006&limit=200';
  const [a, b] = await Promise.all([kit.proxyJson(roster, { persist: false }), kit.proxyJson(day, { persist: false })]);
  assert.deepEqual([a.from, b.from], ['batch', 'batch']);
  assert.ok(!asked.some(u => u.startsWith(kit.PACKS_URL)), 'no copy fetched by the phone');
  assert.equal(asked.filter(u => u.includes('batch=1')).length, 1, 'one request for both');
  const fresh = await kit.proxyJson(`${day}&x=1`, { persist: false, mirror: false });
  assert.equal(fresh.from, 'one');
  assert.ok(asked.at(-1).includes('&mirror=0'));
});

test('a device keeps its sign-in and the account id, never the pass', () => {
  store.clear();
  assert.equal(kit.storedAccount(), '');
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  assert.equal(kit.storedAccount(), 'abcdef0123456789');
  store.delete('orbit.refresh');
  assert.equal(kit.storedAccount(), '', 'no sign-in, no account');
  assert.equal(kit.formatPass('ABCDE23456'), 'ABCDE-23456');
  assert.equal(kit.formatPass('ABCD2345'), 'ABCD-2345');
  assert.ok(kit.DEVICE_CODE_PATTERN.test('ABCD2345'));
});

test('the pay: fixed, whatever the account holds', () => {
  assert.equal(kit.paydayFor({ entries: [] }), 10_000);
  assert.equal(kit.paydayFor({ entries: [{ id: 'a', amount: 60_000, app: 'eco' }] }), 10_000);
  assert.equal(kit.paydayFor({ entries: [], snap: { stock: { cash: 50_000, holdings: 500_000, t: 1 } } }), 10_000);
  // Wednesday 21 Oct (Taipei): next Monday the 26th, 00:00 Taipei.
  assert.equal(kit.nextPayday(Date.UTC(2026, 9, 21, 4)), Date.UTC(2026, 9, 25, 16));
});

test('token requests made together share one sign-in call to the Worker', async () => {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(JSON.parse(init.body || '{}').op);
    await new Promise(r => setTimeout(r, 20));
    return new Response(JSON.stringify({ token: 'tok', wallet: { entries: [] }, active: true }), { status: 200 });
  };
  const s = kit.orbitSession('stock', { heartbeat: 1e9 });
  const [a, b, c] = await Promise.all([s.ensureToken(), s.ensureToken(), s.ensureToken()]);
  assert.deepEqual([a, b, c], ['tok', 'tok', 'tok']);
  assert.deepEqual(calls, ['refresh']);
  // Fresh: no call at all.
  await s.ensureToken();
  assert.equal(calls.length, 1);
});

test("every claim says it ended ('claim'), also one that left this app live as it was; 'active' only on a change", async () => {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  let reply = { token: 'tok', wallet: { entries: [] }, active: true };
  globalThis.fetch = async () => (reply ? new Response(JSON.stringify(reply), { status: 200 }) : Promise.reject(new TypeError('offline')));
  const s = kit.orbitSession('words', { heartbeat: 1e9 });
  const seen = [];
  s.on('active', live => seen.push(['active', live]));
  s.on('claim', c => seen.push(['claim', c]));
  await s.claim();
  await s.claim();
  reply = { token: 'tok', wallet: { entries: [] }, active: false, live: { app: 'words', device: 'other' } };
  await s.claim();
  reply = null;
  await s.claim().catch(() => {});
  // Not a claim: no event.
  reply = { token: 'tok2', wallet: { entries: [] } };
  await s.ensureToken({ renew: true });
  assert.deepEqual(seen, [
    ['active', true],
    ['claim', { ok: true, active: true, live: null, changed: true }],
    ['claim', { ok: true, active: true, live: null, changed: false }],
    ['active', false],
    ['claim', { ok: true, active: false, live: { app: 'words', device: 'other' }, changed: true }],
    ['claim', { ok: false, active: false, live: { app: 'words', device: 'other' }, changed: false }]
  ]);
});

test("a cold start uses its app's own kept token while it's young and the account's, without waiting on the sign-in", async () => {
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(JSON.parse(init.body || '{}').op);
    await new Promise(r => setTimeout(r, 30));
    return new Response(JSON.stringify({ token: 'new', wallet: { entries: [] }, active: true }), { status: 200 });
  };
  const fresh = (app, kept) => {
    store.clear();
    store.set('orbit.refresh', `${claims}.sig`);
    store.set('orbit.account', 'abcdef0123456789');
    if (kept) store.set(`orbit.token:${kept.app || app}`, JSON.stringify({ t: 'kept', at: Date.now() - (kept.ago || 0), account: kept.account || 'abcdef0123456789' }));
    calls.length = 0;
    return kit.orbitSession(app, { heartbeat: 1e9 });
  };
  // Young, this account's: used at once, no call to the Worker; a new one, once made, kept in its place.
  let s = fresh('vocab', { ago: 5 * 60_000 });
  assert.equal(await s.ensureToken(), 'kept');
  assert.deepEqual(calls, []);
  assert.equal(await s.ensureToken({ renew: true }), 'new');
  assert.equal(JSON.parse(store.get('orbit.token:vocab')).t, 'new', 'the new one kept');
  // Another account's, too old, or another app's: a sign-in first.
  for (const [app, kept] of [['weather', { account: 'ffffffffffffffff' }], ['transit', { ago: 13 * 60_000 }], ['orbit', { app: 'stock' }]]) {
    s = fresh(app, kept);
    assert.equal(await s.ensureToken(), 'new', app);
    assert.equal(calls[0], 'refresh', app);
  }
});

test('the data proxy turning a token away (its secret changed) gets a new one at once, and the ask again', async () => {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  let n = 0;
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') return new Response(JSON.stringify({ token: `tok${++n}`, wallet: { entries: [] }, active: true }), { status: 200 });
    asked.push(new URL(url).searchParams.get('qt'));
    // The first token it sees was signed before the secret changed.
    return asked.length === 1 ? new Response('{}', { status: 401 }) : new Response('{"ok":1}', { status: 200 });
  };
  kit.orbitSession('match', { heartbeat: 1e9 });
  assert.equal((await kit.proxyJson('https://x.test/renew', { persist: false })).ok, 1);
  assert.equal(asked.length, 2);
  assert.notEqual(asked[0], asked[1], 'asked again with a new token');
});

test('notice switches follow the pass: newest wins', async () => {
  store.clear();
  // Nothing set on this device: every kind wanted.
  assert.deepEqual(kit.notifyPrefs(), { off: [], t: 0 });
  kit.setKind('stock', 'alert', false);
  assert.equal(kit.kindOn('stock', 'alert'), false);
  assert.equal(kit.kindOn('stock', 'fill'), true);
  store.set('orbit.notify.prefs', JSON.stringify({ on: true, off: ['stock:alert'], t: 1 }));
  // The pass's copy is newer: taken.
  assert.equal(kit.adoptNotifyPrefs({ settings: { notify: { value: { on: false, off: ['match:end'] }, t: 5 } } }), true);
  assert.equal(kit.kindOn('stock', 'alert'), true);
  assert.equal(kit.kindOn('match', 'end'), false);
  assert.equal(kit.notifyPrefs().on, false);
  // Changed here: newer than the pass's, sent up by the live app.
  const writes = [];
  const wallet = { settings: { notify: { value: { on: false, off: ['match:end'] }, t: 5 } } };
  const s = { app: 'stock', active: true, wallet, write: async body => void writes.push(body), ensureToken: async () => '' };
  kit.setKind('stock', 'margin', false);
  await kit.syncPrefs(s);
  assert.deepEqual(writes[0].wallet.settings.notify.value, { on: false, off: ['match:end', 'stock:margin'] });
  // An older copy from the pass doesn't undo it.
  assert.equal(kit.adoptNotifyPrefs(wallet), false);
  assert.equal(kit.kindOn('stock', 'margin'), false);
  // Not the live app: nothing written (it goes up once live).
  kit.setKind('stock', 'margin', true);
  await kit.syncPrefs({ ...s, active: false });
  assert.equal(writes.length, 1);
});

test('a notice the Worker already sent as a phone notice is not shown again when the app opens later', async () => {
  store.clear();
  const saved = { fetch: globalThis.fetch, Notification: globalThis.Notification, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), document: globalThis.document };
  const shown = [];
  globalThis.Notification = { permission: 'granted' };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      language: 'zh-TW',
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/1', options: {}, toJSON: () => ({}) }) } }),
        getRegistration: async () => ({ showNotification: async title => void shown.push(title) })
      }
    }
  });
  globalThis.document = { visibilityState: 'hidden' };
  globalThis.fetch = async url => ({ ok: true, json: async () => (String(url).endsWith('/key') ? { key: 'AAAA' } : { ok: true }) });
  try {
    kit.setNotifyOn(true);
    const s = { app: 'orbit', lang: 'zh', ensureToken: async () => 'token' };
    const now = Date.now();
    // 10:00: the 10:10 class's notice is on the Worker's list.
    await kit.schedulePush(s, [{ at: now - 60_000, title: '社會 10 分鐘後上課', tag: 'class:a', kind: 'class' }, { at: now + 3_600_000, title: '民主', tag: 'class:b', kind: 'class' }]);
    // Ten minutes on: a new list without it (its time has passed)…
    await kit.schedulePush(s, [{ at: now + 3_600_000, title: '民主', tag: 'class:b', kind: 'class' }]);
    // …and the app, opened in that break, would announce it: the phone already did.
    await kit.notify(s, { title: '社會 5 分鐘後上課', tag: 'class:a', kind: 'class' });
    // One on the list still to come: the Worker sends it.
    await kit.notify(s, { title: '民主', tag: 'class:b', kind: 'class' });
    assert.deepEqual(shown, []);
    // One the Worker never had: shown here.
    await kit.notify(s, { title: '別的', tag: 'class:c', kind: 'class' });
    assert.deepEqual(shown, ['別的']);
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.Notification = saved.Notification;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    globalThis.document = saved.document;
  }
});

test('CPBL: a game the proxy still has as to come, hours after its start, takes its score from TheSportsDB', async () => {
  const { asiaMonth } = await import('../kit/catalog.mjs');
  const now = Date.parse('2026-10-18T04:00:00Z');
  const asked = [];
  const fetchJson = async url => (asked.push(url), { events: [{ idEvent: '2618128', strTimestamp: '2026-10-17T09:05:00', strHomeTeam: 'Wei Chuan Dragons', strAwayTeam: 'CTBC Brothers', intHomeScore: '3', intAwayScore: '0', strStatus: 'FT', intRound: '0' }] });
  const g = (start, state) => ({ id: start, start, home: { en: 'Wei Chuan Dragons' }, away: { en: 'CTBC Brothers' }, homeScore: null, awayScore: null, state });
  const games = await asiaMonth(async () => ({ games: [g('2026-10-17T09:05:00.000Z', 'pre'), g('2026-10-18T09:05:00.000Z', 'pre')] }), 'cpbl', '2026-10', { now, fetchJson });
  assert.deepEqual(games.map(x => [x.state, x.homeScore, x.awayScore]), [['post', 3, 0], ['pre', null, null]]);
  assert.deepEqual(asked.map(u => u.match(/d=([\d-]+)/)[1]), ['2026-10-17']);
});

test('CPBL: a month the proxy can\'t read comes from TheSportsDB\'s day lists on the device', async () => {
  const { asiaMonth, tsdbDays } = await import('../kit/catalog.mjs');
  const now = Date.parse('2026-09-30T04:00:00Z');
  assert.equal(tsdbDays('2026-10', now).length, 14);
  assert.equal(tsdbDays('2026-08', now).length, 0);
  const asked = [];
  const fetchJson = async url => {
    asked.push(url);
    return url.includes('d=2026-10-02') ? { events: [{ idEvent: '1', strTimestamp: '2026-10-02T10:35:00', strHomeTeam: 'Fubon Guardians', strAwayTeam: 'Wei Chuan Dragons', strStatus: 'NS' }] } : { events: null };
  };
  const refused = async () => {
    throw new Error('502');
  };
  const games = await asiaMonth(refused, 'cpbl', '2026-10', { now, fetchJson });
  assert.equal(asked.length, 14);
  assert.deepEqual(games.map(g => [g.start, g.home.zh, g.away.en, g.state]), [['2026-10-02T10:35:00.000Z', '富邦悍將', 'Wei Chuan Dragons', 'pre']]);
  // An empty month the proxy read is the month (no game days asked on the device); other leagues never fall back.
  asked.length = 0;
  assert.equal((await asiaMonth(async () => ({ games: [] }), 'cpbl', '2026-11', { now, fetchJson })).length, 0);
  assert.equal(asked.length, 0);
  await assert.rejects(asiaMonth(refused, 'npb', '2026-10', { now, fetchJson }), /502/);
  // Both down (the proxy, every day on the device): an error, not 沒有比賽.
  await assert.rejects(asiaMonth(refused, 'cpbl', '2026-10', { now, fetchJson: refused }), /502/);
  await assert.rejects(asiaMonth(refused, 'cpbl', '2026-08', { now, fetchJson }), /502/);
  // The proxy's own list when it has one.
  assert.equal((await asiaMonth(async () => ({ games: [{ id: 'x' }] }), 'cpbl', '2026-10', { now, fetchJson })).length, 1);
});

test('no Plus in the kit', () => {
  assert.equal(kit.PLUS, undefined);
  assert.equal(kit.openPlus, undefined);
});

test('no VIP in the kit (gone 2026-10-22)', () => {
  assert.equal(kit.VIP, undefined);
  assert.equal(kit.vipStatus, undefined);
});

test('pictures: national sides get flags, names in either order', async () => {
  const L = await import('../kit/logos.mjs');
  assert.equal(L.countryCode('England'), 'GB-ENG');
  assert.equal(L.countryFlag('Wales'), '🇬🇧');
  assert.match(L.teamBadge('kleague', 'Ulsan HD'), /thesportsdb/);
  assert.equal(L.teamLogo('nba', 'Boston Celtics'), 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg');
  assert.equal(L.teamLogo('nba', 'Boston Celtics', true), 'https://cdn.nba.com/logos/nba/1610612738/primary/D/logo.svg');
  assert.match(L.teamLogo('nba', 'London Lions'), /London_Lions_logo/, 'a preseason guest: its own (NBA_GUESTS)');
  assert.equal(L.teamLogo('nba', 'Somebody Else'), null);
  L.rememberLogo('mls', 'Miami Inter', 'https://a.espncdn.com/i/teamlogos/soccer/500/20232.png');
  assert.match(L.teamLogo('mls', 'Inter Miami'), /20232\.png$/);
  for (const key of ['kleague', 'euroleague', 'npb', 'cpbl']) assert.ok(L.leagueLogo(key), key);
});

test('the kit and the Worker agree on the pay and the levels', async () => {
  const eco = await import('../eco.js');
  assert.equal(kit.ECONOMY.weekly, eco.PAY.week);
  assert.equal(kit.ECONOMY.start, eco.PAY.start);
  assert.deepEqual(kit.WEALTH_RANKS.map(r => [r.id, r.min, r.reward]), eco.RANKS.map(r => [r.id, r.min, r.reward]));
  assert.ok(kit.WEALTH_RANKS[1].min > kit.ECONOMY.start, 'the opening money alone reaches no level');
  assert.match(kit.describeEntry({ app: 'eco', kind: 'rank', note: 'welloff', amount: 10_000 }), /百萬身價/);
});

test('looks: an avatar and a frame for everyone, from the lists only', () => {
  const now = Date.UTC(2026, 9, 10);
  const w = { entries: [], settings: { avatar: { value: { id: 'mint-ring' }, t: now }, frame: { value: { id: 'gold' }, t: now } } };
  assert.equal(kit.avatarOf(w).id, 'mint-ring');
  assert.equal(kit.frameOf(w).id, 'gold');
  // The emoji ones are gone: an old pick shows the person.
  assert.equal(kit.avatarOf({ ...w, settings: { avatar: { value: { id: 'panda' }, t: now } } }), null);
  // Drawn, never emoji, and named in both languages.
  for (const a of kit.AVATARS) {
    assert.match(kit.avatarSrc(a.id), /^data:image\/svg\+xml,/);
    assert.ok(a.zh && a.en && !/\p{Extended_Pictographic}/u.test(decodeURIComponent(kit.avatarSrc(a.id))));
  }
  // Every id once, and more of them than Plus had.
  for (const list of [kit.AVATARS, kit.FRAMES]) assert.equal(new Set(list.map(x => x.id)).size, list.length);
  assert.ok(kit.AVATARS.length >= 90 && kit.FRAMES.length >= 25);
  assert.ok([...kit.AVATARS, ...kit.FRAMES].every(x => !x.streak));
});

test('milestones: reached once, kept for good, and only then worn', async () => {
  const now = Date.UTC(2026, 9, 23);
  const set = (k, v) => ({ [k]: { value: v, t: now } });
  const base = { entries: [], apps: {}, settings: {} };
  const of = (w, id) => kit.milestoneOf(w, kit.MILESTONES.find(m => m.id === id));
  // One per app and one for the family, each with its drawn avatar and a frame.
  assert.deepEqual(kit.MILESTONES.map(m => m.id).sort(), ['pass', ...Object.keys(kit.APPS)].sort());
  const css = await import('node:fs').then(fs => fs.readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8'));
  for (const m of kit.MILESTONES) {
    assert.ok(css.includes(`.q-frame-ms-${m.id} {`), m.id);
    assert.ok(!/\p{Extended_Pictographic}/u.test(decodeURIComponent(kit.avatarSrc(`ms-${m.id}`))));
  }
  // A locked one isn't worn, an earned one is.
  const wearing = { ...base, settings: { ...set('avatar', { id: 'ms-vocab' }), ...set('frame', { id: 'ms-vocab' }) } };
  assert.equal(kit.avatarOf(wearing), null);
  assert.equal(kit.frameOf(wearing), null);
  const got = { ...wearing, settings: { ...wearing.settings, ...set('ms.vocab', { n: 500, done: true }) } };
  assert.equal(kit.avatarOf(got).id, 'ms-vocab');
  assert.equal(kit.frameOf(got).id, 'ms-vocab');
  // The family's from the apps opened; never past the goal.
  const all = Object.fromEntries(Object.keys(kit.APPS).map(a => [a, { first: now, last: now }]));
  assert.equal(of({ ...base, apps: { law: { first: now, last: now } } }, 'pass').n, 1);
  assert.equal(of({ ...base, apps: all }, 'pass').done, true);
  // A count kept on the pass; once done, done even if it fell back.
  assert.deepEqual(of({ ...base, settings: set('ms.match', { n: 12, d: '2026-10-23' }) }, 'match'), { n: 12, goal: 30, done: false });
  assert.equal(of({ ...base, settings: set('ms.stock', { done: true }) }, 'stock').done, true);
  // An app's count goes to the pass a tenth of the way at a time.
  const writes = [];
  const s = { wallet: { ...base, settings: set('ms.vocab', { n: 100 }) }, write: p => (writes.push(p), Promise.resolve()) };
  kit.milestone(s, 'vocab', 120);
  assert.equal(writes.length, 0);
  kit.milestone(s, 'vocab', 150);
  assert.equal(writes[0].wallet.settings['ms.vocab'].value.n, 150);
  await new Promise(r => setTimeout(r, 0));
  // One added: written each time.
  kit.milestone({ ...s, wallet: { ...base, settings: set('ms.law', { n: 9 }) } }, 'law');
  assert.deepEqual(writes[1].wallet.settings['ms.law'].value, { n: 10, done: true });
});

test('where the money came from: the system, the bank, the government and the account itself', () => {
  // The opening money is the Worker's own entry; the pay and the owner's grants are the system's too.
  const paid = kit.moneySides({ entries: [{ id: 'eco:start', app: 'eco', kind: 'start', amount: 200_000 }, { id: 'eco:wpay:2026-10-19', app: 'eco', kind: 'pay', amount: 10_000 }, { id: 'eco:admin:1', app: 'eco', kind: 'admin', amount: 500 }], snap: {} });
  assert.deepEqual(paid.gave, { start: 200_000, pay: 10_000, rank: 0, other: 500 });
  assert.equal(paid.own, 0);
  const start = { id: 'eco:start', app: 'eco', kind: 'start', amount: 30_000 };
  // Overdraft interest is Orbit's bank's.
  const od = kit.moneySides({ entries: [start, { id: 'eco:od:2026-10', app: 'eco', kind: 'od', amount: -490 }], snap: {} });
  assert.deepEqual([od.fees, od.own, od.worth], [490, 0, 29_510]);
  // Securities' gains are the account's own.
  const gain = kit.moneySides({ entries: [start], snap: { stock: { cash: -10_000, holdings: 12_000 } } });
  assert.deepEqual([gain.fees, gain.own], [0, 2_000]);
});
test('signing out wipes every app’s keys on this device, keeping only its language and safe area', () => {
  store.clear();
  for (const k of ['orbit.refresh', 'orbit.account', 'orbit.wallet', 'orbit.payload.odds', 'oddsStudy.account:abc', 'stockStudy.settings', 'classFocusData', 'orbit.notify.prefs', 'fx.day.v3']) store.set(k, 'x');
  store.set('orbit.lang', 'en');
  store.set('orbit.safeBottom', '{"p":34}');
  tabStore.set('orbit.visit', '1');
  kit.wipeDevice();
  assert.deepEqual([...store.keys()].sort(), ['orbit.lang', 'orbit.safeBottom']);
  assert.equal(tabStore.size, 0);
  assert.equal(kit.storedAccount(), '');
});

test("names: a club with joining words in its name (Atlético de Madrid), and teams found by their Chinese names (皇家 → Real Madrid)", async () => {
  const { teamNameZh, teamsByZh } = await import('../kit/names.mjs');
  assert.equal(teamNameZh('ucl', 'Atlético de Madrid', 'soccer')?.full, '馬德里競技');
  const found = teamsByZh('皇家');
  assert.ok(found.some(x => x.name === 'real madrid' && x.zh === '皇家馬德里'));
  assert.deepEqual(teamsByZh('皇家馬德里')[0], { name: 'real madrid', zh: '皇家馬德里' });
  assert.deepEqual(teamsByZh('Madrid'), []);
});

test('names: fold, one name however written (accents, case, spaces, the letters NFKD keeps whole)', async () => {
  const { fold } = await import('../kit/names.mjs');
  assert.equal(fold(' Pérez '), fold('PEREZ'));
  assert.equal(fold('Rønnow'), 'ronnow');
  assert.equal(fold('Müller'), 'muller');
  assert.equal(fold('Łukasz Fabiański'), 'lukasz fabianski');
  assert.equal(fold('Straße'), 'strasse');
  assert.equal(fold('中信兄弟'), '中信兄弟');
  assert.equal(fold(null), '');
});

test('pressSelector: every :active a press the kit sets, not one iOS puts on a scrolling finger', async () => {
  const kit = await import('../kit/orbit.mjs');
  assert.equal(kit.pressSelector('.card:active, .q-tab:active .q-tab-icon'), '.card[data-q-press], .q-tab[data-q-press] .q-tab-icon');
  assert.equal(kit.pressSelector('button:active:not(:disabled)'), 'button[data-q-press]:not(:disabled)');
  assert.equal(kit.pressSelector('.q-switch:active::after'), '.q-switch[data-q-press]::after');
  assert.equal(kit.pressSelector('.a:hover'), '.a:hover');
});

test('a pack a phone kept before the move (under the Pages address) is still its copy: opened at once, nothing asked', async () => {
  const had = globalThis.caches;
  const kept = new Map();
  const oldKey = `https://orbit.data/${encodeURIComponent('https://jaypengx.github.io/Shared-Data/sports/mlb/2026.json')}`;
  kept.set(oldKey, new Response('{"events":["kept"]}', { headers: { 'x-at': String(Date.now()) } }));
  globalThis.caches = { open: async () => ({ match: async k => kept.get(typeof k === 'string' ? k : k.url)?.clone() || null, put: async () => {}, keys: async () => [], delete: async () => true }) };
  const asked = [];
  globalThis.fetch = async url => (asked.push(String(url)), new Response('{"events":["fresh"]}'));
  try {
    assert.deepEqual((await kit.packJson('sports/mlb/2026.json')).events, ['kept']);
    assert.equal(asked.length, 0);
  } finally {
    globalThis.caches = had;
  }
});

test('what the device keeps is pruned of copies older than a few days, at most every 6 hours, not at every open', async () => {
  const kept = new Map();
  let keysRead = 0;
  const had = { caches: globalThis.caches, idle: globalThis.requestIdleCallback };
  globalThis.caches = { open: async () => ({ match: async k => kept.get(k)?.clone() || null, put: async (k, r) => void kept.set(k, r), keys: async () => (keysRead++, [...kept.keys()]), delete: async k => kept.delete(k) }) };
  globalThis.requestIdleCallback = f => f();
  store.delete('orbit.dataPruned');
  // (A kit just loaded: an app opened.)
  const fresh = await import('../kit/orbit.mjs?pruning');
  kept.set('https://orbit.data/old', new Response('{}', { headers: { 'x-at': String(Date.now() - 5 * 86_400_000) } }));
  globalThis.fetch = async () => new Response('{"n":1}', { status: 200 });
  await fresh.proxyJson('https://x.test/prune-1', { ttl: 1 });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(kept.has('https://orbit.data/old'), false, 'the old copy went');
  assert.equal(keysRead, 1);
  // Another read (another open) within 6 hours: nothing walked again.
  await (await import('../kit/orbit.mjs?pruning-again')).proxyJson('https://x.test/prune-2', { ttl: 1 });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(keysRead, 1);
  assert.ok(Number(store.get('orbit.dataPruned')) > 0);
  globalThis.caches = had.caches;
  globalThis.requestIdleCallback = had.idle;
});

test("中場休息 counts down from the half's last play, by the league's break", async () => {
  // Chelsea at Everton, 2026-10-17: the half ended 12:20:20Z (45'+4').
  const summary = {
    header: { competitions: [{ status: { type: { name: 'STATUS_HALFTIME', shortDetail: 'HT' } } }] },
    keyEvents: [{ type: { type: 'kickoff' }, wallclock: '2026-10-17T11:32:18Z' }, { type: { type: 'halftime' }, wallclock: '2026-10-17T12:20:20Z' }]
  };
  assert.equal(kit.halftimeStartOf(summary), Date.parse('2026-10-17T12:20:20Z'));
  // Football's end of half sits inside its drives.
  assert.equal(kit.halftimeStartOf({ drives: { previous: [{ plays: [{ wallclock: '2026-10-11T15:09:32Z' }] }] } }), Date.parse('2026-10-11T15:09:32Z'));
  assert.equal(kit.halftimeMinutes('soccer'), 15);
  assert.equal(kit.halftimeMinutes('football', 'ncaaf'), 20);
  assert.equal(kit.halftimeMinutes('baseball'), null);
  const end = Date.parse('2026-10-17T12:35:20Z');
  assert.equal(kit.halftimeClock(end, Date.parse('2026-10-17T12:22:46Z')), '12:34');
  assert.equal(kit.halftimeClock(end, end + 1000), '');
  assert.equal(kit.watchHalftime('t:1', { sport: 'soccer', read: async () => summary }), null);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kit.halftimeEnd('t:1'), end);
  assert.deepEqual(JSON.parse(store.get('orbit.halftime'))['t:1'], end);
  // A copy from before the whistle isn't taken.
  kit.watchHalftime('t:2', { sport: 'soccer', read: async () => ({ ...summary, header: { competitions: [{ status: { type: { name: 'STATUS_FIRST_HALF' } } }] } }) });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kit.halftimeEnd('t:2'), null);
});

test('every break counts down by its rule: quarters, innings, timeouts', async () => {
  const nba = { sport: 'basketball', league: 'nba' };
  assert.deepEqual(kit.breakOf({ ...nba, status: { state: 'in', name: 'STATUS_END_PERIOD', period: 1 } })?.seconds, 130);
  assert.equal(kit.breakOf({ ...nba, status: { state: 'in', name: 'STATUS_HALFTIME', period: 2 } })?.kind, 'half');
  // 76ers at Knicks, 2026-10-20: a team's timeout on the scoreboard's last play, 75 s from its own clock.
  const to = kit.breakOf({ ...nba, status: { state: 'in', name: 'STATUS_IN_PROGRESS', period: 1 }, live: { lastType: 'Full Timeout', lastId: '401909089112' } });
  assert.deepEqual([to.kind, to.seconds, to.play], ['timeout', 75, '401909089112']);
  assert.equal(kit.breakOf({ ...nba, status: { state: 'in', name: 'STATUS_IN_PROGRESS', period: 1 }, live: { lastType: 'Substitution' } }), null);
  assert.equal(kit.breakOf({ sport: 'basketball', league: 'euroleague', status: { state: 'in', name: 'STATUS_END_PERIOD', period: 3 } }).seconds, 120);
  assert.equal(kit.breakOf({ sport: 'football', league: 'nfl', status: { state: 'in', name: 'STATUS_END_PERIOD', period: 2 } }).kind, 'half');
  assert.equal(kit.breakOf({ sport: 'hockey', league: 'nhl', status: { state: 'in', name: 'STATUS_END_PERIOD', period: 1 } }).seconds, 1080);
  assert.equal(kit.breakOf({ sport: 'hockey', league: 'nhl', status: { state: 'in', name: 'STATUS_END_PERIOD', period: 3 } }), null);
  assert.equal(kit.breakOf({ sport: 'baseball', league: 'mlb', status: { state: 'in', name: 'STATUS_IN_PROGRESS', period: 3 }, live: { half: 'mid' } }).seconds, 135);
  assert.equal(kit.breakOf({ sport: 'baseball', league: 'mlb', post: true, status: { state: 'in', period: 3 }, live: { half: 'end' } }).seconds, 190);
  assert.equal(kit.breakOf({ sport: 'baseball', league: 'mlb', status: { state: 'in', period: 3 }, live: { half: 'top' } }), null);
  assert.equal(kit.breakOf({ sport: 'soccer', league: 'epl', status: { state: 'in', name: 'STATUS_SECOND_HALF' } }), null);
  assert.equal(kit.breakOf({ ...nba, status: { state: 'in', name: 'STATUS_END_PERIOD', delayed: true } }), null);
  // The timeout's end from its own play, not the latest one after it.
  const summary = { plays: [{ id: '7', wallclock: '2026-10-20T23:24:42Z' }, { id: '8', wallclock: '2026-10-20T23:24:50Z' }] };
  kit.watchBreak('t:to', { seconds: 75, read: async () => summary, play: '7' });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kit.halftimeEnd('t:to'), Date.parse('2026-10-20T23:24:42Z') + 75_000);
  // The NBA's mandatory timeouts: a period's first two, 3:15 on national TV (76ers at Knicks on NBC, 2026-10-20); a third 1:15.
  const plays = [
    { id: '1', period: { number: 2 }, type: { text: 'Full Timeout' }, wallclock: '2026-10-21T00:00:31Z' },
    { id: '2', period: { number: 2 }, type: { text: 'Jump Shot' }, wallclock: '2026-10-21T00:04:00Z' },
    { id: '3', period: { number: 2 }, type: { text: 'Official Timeout' }, wallclock: '2026-10-21T00:08:00Z' },
    { id: '4', period: { number: 2 }, type: { text: 'Full Timeout' }, wallclock: '2026-10-21T00:12:00Z' }
  ];
  const national = { header: { competitions: [{ broadcasts: [{ type: { shortName: 'TV' }, isNational: true }] }] }, plays };
  const nbaTo = kit.breakOf({ ...nba, status: { state: 'in', period: 2 }, live: { lastType: 'Full Timeout', lastId: '1' } });
  kit.watchBreak('t:m1', { ...nbaTo, read: async () => national });
  kit.watchBreak('t:m3', { ...nbaTo, play: '4', read: async () => national });
  kit.watchBreak('t:m1l', { ...nbaTo, read: async () => ({ plays }) });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kit.halftimeEnd('t:m1'), Date.parse('2026-10-21T00:00:31Z') + 195_000);
  assert.equal(kit.halftimeEnd('t:m3'), Date.parse('2026-10-21T00:12:00Z') + 75_000);
  assert.equal(kit.halftimeEnd('t:m1l'), Date.parse('2026-10-21T00:00:31Z') + 180_000);
  // A play stamped ahead of now (a feed's clock minutes fast): the break from now, never longer than its rule.
  const ahead = { plays: [{ id: 'f', period: { number: 1 }, type: { text: 'Full Timeout' }, wallclock: new Date(Date.now() + 157_000).toISOString() }] };
  kit.watchBreak('t:ahead', { seconds: 75, read: async () => ahead, play: 'f' });
  await new Promise(r => setTimeout(r, 0));
  assert.ok(kit.halftimeEnd('t:ahead') <= Date.now() + 75_000);
  // An inning break: the summary says Mid.
  kit.watchBreak('t:inn', { seconds: 135, read: async () => ({ header: { competitions: [{ status: { type: { name: 'STATUS_IN_PROGRESS', shortDetail: 'Mid 1st' } } }] }, plays: [{ wallclock: '2026-10-20T00:13:41Z' }] }), test: /^(mid|end)/i });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kit.halftimeEnd('t:inn'), Date.parse('2026-10-20T00:13:41Z') + 135_000);
});

test('a live number pops only when it changed, and never in the first seconds', () => {
  assert.equal(kit.liveChanged('t:a', '1-0', 10_000), false);
  assert.equal(kit.liveChanged('t:a', '1-0', 11_000), false);
  assert.equal(kit.liveChanged('t:a', '2-0', 12_000), true);
  assert.equal(kit.liveChanged('t:b', '0-0', 100), false);
  assert.equal(kit.liveChanged('t:b', '1-0', kit.LIVE_QUIET_MS - 1), false);
  assert.equal(kit.liveChanged('t:c', '…', 10_000), false);
  assert.equal(kit.liveChanged('t:c', 'NT$1,000', 11_000), false);
});

test('taipeiDay takes a number, an ISO string or a Date', () => {
  const t = Date.UTC(2026, 9, 17, 16, 30); // 00:30 on the 18th in Taipei
  assert.equal(kit.taipeiDay(t), '2026-10-18');
  assert.equal(kit.taipeiDay(new Date(t).toISOString()), '2026-10-18');
  assert.equal(kit.taipeiDay(new Date(t)), '2026-10-18');
});

test('政府: the taxes Securities reports and relief, a side of its own; the four sides add up to the worth', () => {
  const start = { id: 'eco:start', app: 'eco', kind: 'start', amount: 200_000 };
  const w = {
    entries: [start, { id: 'eco:relief:2026-11-02', app: 'eco', kind: 'relief', amount: 5_000 }],
    snap: { stock: { cash: -50_000, holdings: 60_000, gov: { trade: 300, withheld: 90, nhi: 0 } } }
  };
  const g = kit.govOf(w);
  assert.deepEqual(g.paid, { trade: 300, withheld: 90, nhi: 0 });
  assert.deepEqual([g.paidTotal, g.gotTotal, g.net], [390, 5_000, 4_610]);
  const s = kit.moneySides(w);
  assert.equal(s.gave.other, 0);
  assert.equal(s.given - s.fees + s.gov.net + s.own, s.worth);
  // Nothing reported, junk ignored.
  assert.equal(kit.govOf({ snap: { stock: { gov: { trade: 'x', nhi: -5 } } } }).paidTotal, 0);
});

test('every EuroLeague and K League club has a Chinese name (Jay 2026-10-21)', async () => {
  const { teamZh } = await import('../kit/names.mjs');
  const { TEAM_BADGES } = await import('../kit/logos.mjs').catch(() => ({}));
  const el = ['Virtus Bologna', 'Hapoel Tel Aviv', 'Anadolu Efes', 'BC Dubai', 'Real Madrid Baloncesto', 'Maccabi Tel Aviv', 'Saski Baskonia', 'Milano', 'KK Crvena Zvezda Belgrade', 'Partizan Belgrade', 'ASVEL Lyon-Villeurbanne', 'Žalgiris Kaunas', 'Fenerbahce SK', 'Olympiacos BC', 'Valencia Basket Club', 'Paris Basket', ...Object.keys(TEAM_BADGES?.euroleague || {})];
  for (const n of el) assert.match(teamZh('euroleague', n, 'basketball'), /\p{Script=Han}/u, n);
  for (const n of ['Bucheon FC 1995', ...Object.keys(TEAM_BADGES?.kleague || {})]) assert.match(teamZh('kleague', n, 'soccer'), /\p{Script=Han}/u, n);
});
