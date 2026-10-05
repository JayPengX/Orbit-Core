// The shared kit's pure parts: the pool, Plus, looks and the recommender.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const store = new Map();
const tabStore = new Map();
globalThis.localStorage = storage(store);
globalThis.sessionStorage = storage(tabStore);
const kit = await import('../kit/quadra.mjs');

test('the pool is every entry and every app figure', () => {
  const w = { entries: [{ id: 'a', amount: 100, app: 'odds' }, { id: 'b', amount: -40, app: 'eco' }], snap: { stock: { cash: 1000, t: 1 } } };
  assert.equal(kit.poolBalance(w), 1060);
  assert.equal(kit.othersBalance(w, 'stock'), 60);
});

test('recommendations follow affinity, stay diverse, and learn from dismissals', () => {
  store.clear();
  const now = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 5; i++) kit.recordAffinity('odds', ['team:mlb:LAD', 'league:mlb'], 1, now);
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
  assert.ok(kit.isPass('ABCDE-23456'));
});

test('account details: this month in and out, latest entries first', () => {
  const now = Date.UTC(2026, 9, 15, 4);
  const w = {
    created: Date.UTC(2026, 0, 1),
    entries: [
      { id: 'a', t: Date.UTC(2026, 8, 30), amount: 500, app: 'odds', kind: 'payout' },
      { id: 'b', t: Date.UTC(2026, 9, 2), amount: 7000, app: 'eco', kind: 'pay' },
      { id: 'c', t: Date.UTC(2026, 9, 3), amount: -200, app: 'odds', kind: 'stake' }
    ]
  };
  const d = kit.accountDetails(w, 'zh', now);
  assert.equal(d.in, 7000);
  assert.equal(d.out, -200);
  assert.equal(d.count, 2);
  assert.equal(d.recent[0].amount, -200);
  assert.match(d.recent[1].text, /Quadra · 每月薪水/);
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

test('packJson reads a nightly pack from GitHub Pages, not the proxy; a pack not there is a failure', async () => {
  const asked = [];
  globalThis.fetch = async url => (asked.push(String(url)), String(url).endsWith('nba/2026.json') ? new Response('{"events":[1,2]}', { status: 200 }) : new Response('nope', { status: 404 }));
  assert.deepEqual((await kit.packJson('sports/nba/2026.json')).events, [1, 2]);
  assert.equal(asked[0], 'https://jaypengx.github.io/Shared-Data/sports/nba/2026.json');
  await assert.rejects(kit.packJson('sports/nope/2026.json'), e => e.status === 404);
});

test("a read the nightly mirror holds comes from GitHub Pages until its time, then from the proxy; one it doesn't hold, from the proxy", async () => {
  const asked = [];
  const now = Date.now();
  const roster = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/13/roster';
  const day = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261005&limit=200';
  const files = {
    'mirror/index.json': { built: now, until: now + 86_400_000, match: ['^espn-roster!|^!https://site\\.api\\.espn\\.com/apis/site/v2/sports/[^?]+/(teams/\\d+/roster|scoreboard\\?dates=\\d{8}&limit=200)$'] },
    [kit.mirrorPath(roster)]: { until: now + 3_600_000, data: { from: 'mirror' } },
    [kit.mirrorPath(day)]: { until: now - 1, data: { from: 'old mirror' } }
  };
  assert.equal(kit.mirrorPath(day), 'mirror/_/site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard/dates~3D20261005~26limit~3D200.json');
  globalThis.fetch = async url => {
    asked.push(String(url));
    const path = String(url).replace(kit.PACKS_URL, '');
    if (String(url).startsWith(kit.PACKS_URL)) return files[path] ? new Response(JSON.stringify(files[path]), { status: 200 }) : new Response('nope', { status: 404 });
    return new Response(JSON.stringify({ from: 'proxy' }), { status: 200 });
  };
  assert.equal((await kit.proxyJson(roster, { persist: false })).from, 'mirror');
  assert.ok(!asked.some(u => u.startsWith(kit.PROXY_URL)), 'the proxy never asked');
  assert.equal((await kit.proxyJson(day, { persist: false })).from, 'proxy', 'past its time: the proxy');
  assert.equal((await kit.proxyJson(`${roster.replace('13', '14')}`, { persist: false, trim: 'espn-roster' })).from, 'proxy', 'held by pattern, not built: the proxy');
  assert.equal((await kit.proxyJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', { persist: false })).from, 'proxy', 'not held');
  const n = asked.length;
  await kit.proxyJson(day, { persist: false, ttl: 0 });
  assert.equal(asked.slice(n).filter(u => u.startsWith(kit.PACKS_URL)).length, 0, 'not looked for again');
});

test('a device keeps its sign-in and the account id, never the pass', () => {
  store.clear();
  assert.equal(kit.storedAccount(), '');
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('quadra.refresh', `${claims}.sig`);
  store.set('quadra.account', 'abcdef0123456789');
  assert.equal(kit.storedAccount(), 'abcdef0123456789');
  store.delete('quadra.refresh');
  assert.equal(kit.storedAccount(), '', 'no sign-in, no account');
  assert.equal(kit.formatPass('ABCDE23456'), 'ABCDE-23456');
  assert.equal(kit.formatPass('ABCD2345'), 'ABCD-2345');
  assert.ok(kit.DEVICE_CODE_PATTERN.test('ABCD2345'));
});

test('Quadra Plus: a month is a member’s when the Worker billed it; joining is free once', () => {
  const oct = Date.UTC(2026, 9, 10, 4);
  const w = { entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0 }], settings: { plus: { value: { on: true }, t: 1 } } };
  assert.equal(kit.plusMember(w, oct), true);
  assert.equal(kit.plusMember(w, Date.UTC(2026, 10, 2)), false);
  assert.equal(kit.plusRenewing(w), true);
  assert.deepEqual([...kit.plusMonths(w)], ['2026-10']);
  // An app's own entry never counts.
  assert.equal(kit.plusMember({ entries: [{ id: 'eco:plus:2026-10', app: 'odds', kind: 'plus' }] }, oct), false);
  assert.equal(kit.plusJoinPrice({ entries: [] }, oct), 0);
  // 22 of 31 days left.
  assert.equal(kit.plusJoinPrice(w, oct), 350);
});

test('the pay: fixed, whatever the account holds', () => {
  assert.equal(kit.paydayFor({ entries: [] }), 6_000);
  assert.equal(kit.paydayFor({ entries: [{ id: 'a', amount: 60_000, app: 'odds' }] }), 6_000);
  assert.equal(kit.paydayFor({ entries: [], snap: { stock: { cash: 50_000, holdings: 500_000, t: 1 } } }), 6_000);
  assert.match(kit.paydayText('zh', Date.UTC(2026, 9, 5)), /NT\$6,000/);
});

test('free bets: only current Quadra-issued tokens are spent once and last a week', () => {
  const t = Date.UTC(2026, 9, 1);
  const tok = (id, note, at = t, app = 'eco') => ({ id, t: at, app, kind: 'freebet', amount: 0, note });
  const w = { entries: [tok('odds:fb:a', '100', t, 'odds'), tok('eco:fb:open', '200'), tok('eco:fb:used', '100'), tok('eco:fb:old', '100', t - 8 * 86_400_000), { id: 'odds:fb-eco:fb:used', t, app: 'odds', kind: 'freebet', amount: 0 }] };
  assert.deepEqual(kit.freeBets(w, t).map(x => [x.id, x.value]), [['eco:fb:open', 200]]);
  assert.deepEqual(kit.freeBets(w, t, ['eco:fb:open']), []);
  assert.deepEqual(kit.freeBets(w, t + 8 * 86_400_000), []);
});

test('token requests made together share one sign-in call to the Worker', async () => {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('quadra.refresh', `${claims}.sig`);
  store.set('quadra.account', 'abcdef0123456789');
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(JSON.parse(init.body || '{}').op);
    await new Promise(r => setTimeout(r, 20));
    return new Response(JSON.stringify({ token: 'tok', wallet: { entries: [] }, active: true }), { status: 200 });
  };
  const s = kit.quadraSession('stock', { heartbeat: 1e9 });
  const [a, b, c] = await Promise.all([s.ensureToken(), s.ensureToken(), s.ensureToken()]);
  assert.deepEqual([a, b, c], ['tok', 'tok', 'tok']);
  assert.deepEqual(calls, ['refresh']);
  // Fresh: no call at all.
  await s.ensureToken();
  assert.equal(calls.length, 1);
});

test('the data proxy turning a token away (its secret changed) gets a new one at once, and the ask again', async () => {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('quadra.refresh', `${claims}.sig`);
  let n = 0;
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') return new Response(JSON.stringify({ token: `tok${++n}`, wallet: { entries: [] }, active: true }), { status: 200 });
    asked.push(new URL(url).searchParams.get('qt'));
    // The first token it sees was signed before the secret changed.
    return asked.length === 1 ? new Response('{}', { status: 401 }) : new Response('{"ok":1}', { status: 200 });
  };
  kit.quadraSession('match', { heartbeat: 1e9 });
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
  store.set('quadra.notify.prefs', JSON.stringify({ on: true, off: ['stock:alert'], t: 1 }));
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

test('CPBL: a month the proxy can\'t fill comes from TheSportsDB\'s day lists on the device', async () => {
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
  // An empty month from the proxy too; other leagues never.
  assert.equal((await asiaMonth(async () => ({ games: [] }), 'cpbl', '2026-10', { now, fetchJson })).length, 1);
  assert.deepEqual(await asiaMonth(refused, 'npb', '2026-10', { now, fetchJson }), []);
  // The proxy's own list when it has one.
  assert.equal((await asiaMonth(async () => ({ games: [{ id: 'x' }] }), 'cpbl', '2026-10', { now, fetchJson })).length, 1);
});

test('Plus: the weekly bonus bet is a free bet; what Plus gave back this month', () => {
  const t = Date.UTC(2026, 9, 7, 4);
  const w = { entries: [
    { id: 'eco:plus:2026-10', t, app: 'eco', kind: 'plus', amount: -290 },
    { id: 'eco:fb:2026-10-05', t, app: 'eco', kind: 'freebet', amount: 0, note: '100' },
    // An app can't mint one: only the Worker's ('eco') count.
    { id: 'eco:fb:fake', t, app: 'odds', kind: 'freebet', amount: 0, note: '500' },
    { id: 'odds:plus-s1', t, app: 'odds', kind: 'plusboost', amount: 42 },
    { id: 'odds:plus-old', t: Date.UTC(2026, 8, 20), app: 'odds', kind: 'plusboost', amount: 99 }
  ] };
  assert.deepEqual(kit.freeBets(w, t).map(x => [x.id, x.value]), [['eco:fb:2026-10-05', 100]]);
  assert.deepEqual(kit.plusReturns(w, t), { boosts: 42, bets: 100, total: 142 });
  assert.match(kit.describeEntry({ app: 'odds', kind: 'plusboost', amount: 42 }), /Plus/);
});

test('VIP in the kit: the same tiers as the Worker, this month so far', async () => {
  const eco = await import('../eco.js');
  assert.deepEqual(kit.VIP.tiers.map(t => [t.id, t.min, t.back]), eco.VIP.tiers.map(t => [t.id, t.min, t.back]));
  assert.equal(kit.VIP.from, eco.VIP.from);
  const now = Date.UTC(2026, 9, 20, 4);
  const w = { entries: [
    { id: 'odds:stake-a', t: now, app: 'odds', kind: 'stake', amount: -60_000 },
    { id: 'eco:vip:2026-09', t: now - 1, app: 'eco', kind: 'vip', amount: 80, note: 'bronze' }
  ] };
  const v = kit.vipStatus(w, now);
  assert.equal(v.stakes, 60_000);
  assert.equal(v.tier.id, 'silver');
  assert.equal(v.back, 480);
  assert.equal(v.next.id, 'gold');
  assert.equal(v.toNext, 90_000);
  assert.equal(v.paid.amount, 80);
  assert.equal(kit.vipStatus({ entries: [] }, now).tier, null);
  assert.equal(kit.vipName(v.tier, 'en'), '🥈 Silver');
  assert.equal(kit.WELCOME.bet, eco.WELCOME.bet);
  assert.equal(kit.welcomeDue({ entries: [] }), true);
  assert.equal(kit.welcomeDue(w), false);
});

test('pictures: national sides get flags, names in either order', async () => {
  const L = await import('../kit/logos.mjs');
  assert.equal(L.countryCode('England'), 'GB-ENG');
  assert.equal(L.countryFlag('Wales'), '🇬🇧');
  assert.match(L.teamBadge('kleague', 'Ulsan HD'), /thesportsdb/);
  assert.equal(L.teamLogo('nba', 'Boston Celtics'), 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg');
  assert.equal(L.teamLogo('nba', 'Boston Celtics', true), 'https://cdn.nba.com/logos/nba/1610612738/primary/D/logo.svg');
  assert.equal(L.teamLogo('nba', 'London Lions'), null);
  L.rememberLogo('mls', 'Miami Inter', 'https://a.espncdn.com/i/teamlogos/soccer/500/20232.png');
  assert.match(L.teamLogo('mls', 'Inter Miami'), /20232\.png$/);
  for (const key of ['kleague', 'euroleague', 'npb', 'cpbl']) assert.ok(L.leagueLogo(key), key);
});

test('the kit and the Worker agree on the pay and Plus; the statement skips free bet tokens', async () => {
  const eco = await import('../eco.js');
  assert.equal(kit.ECONOMY.monthly, eco.PAY_MONTH);
  assert.equal(kit.PLUS.fee, eco.PLUS.fee);
  assert.equal(kit.PLUS.year, eco.PLUS.year);
  const now = Date.UTC(2026, 9, 10);
  const w = { entries: [{ id: 'eco:pay:2026-10', t: now - 2, app: 'eco', kind: 'pay', amount: 8_000 }, { id: 'eco:fb:welcome', t: now - 1, app: 'eco', kind: 'freebet', amount: 0, note: '200' }] };
  const d = kit.accountDetails(w, 'en', now);
  assert.deepEqual(d.recent.map(r => r.amount), [8_000]);
  assert.equal(d.count, 1);
});

test('Plus hooks: tenure, returns since joining, the weekly free bet and renewal notices once each', () => {
  const plus = m => ({ id: `eco:plus:${m}`, t: Date.UTC(2026, 7, 1), app: 'eco', kind: 'plus', amount: -490 });
  // Friday 30 Oct 2026, noon in Taiwan: the week of Monday the 26th, 2 days before the renewal.
  const now = Date.UTC(2026, 9, 30, 4);
  const w = {
    entries: [plus('2026-09'), plus('2026-10'), { id: 'eco:fb:2026-10-26', t: now - 3_600_000, app: 'eco', kind: 'freebet', amount: 0, note: '200' }, { id: 'eco:fb:welcome', t: now, app: 'eco', kind: 'freebet', amount: 0, note: '200' }],
    settings: { plus: { value: { on: true, plan: 'month' }, t: 1 } }
  };
  assert.equal(kit.plusTenure(w, now), 2);
  const r = kit.plusReturns(w, now);
  // The welcome offer isn't Plus's.
  assert.deepEqual([r.bets, r.total], [200, 200]);
  assert.equal(kit.plusReturns(w, now, { all: true }).total, 200);
  const s = { wallet: w, lang: 'zh', app: 'odds' };
  // Said once for the whole pass: marked on the device and on the pass.
  const wrote = [];
  kit.plusNotices({ ...s, write: x => (wrote.push(x), Promise.resolve()) }, now);
  assert.equal(localStorage.getItem('quadra.seen:eco:fb:2026-10-26'), '1');
  assert.equal(localStorage.getItem('quadra.seen:plus-renew:2026-10'), '1');
  assert.deepEqual(wrote.at(-1).wallet.settings.seen.value, ['eco:fb:2026-10-26', 'plus-renew:2026-10']);
  // Another app (its own storage) on a pass that already said it: nothing.
  localStorage.removeItem('quadra.seen:eco:fb:2026-10-26');
  assert.equal(kit.sayOnce({ wallet: { settings: { seen: { value: ['eco:fb:2026-10-26'], t: 1 } } } }, 'eco:fb:2026-10-26'), false);
  assert.equal(kit.sayOnce({ wallet: { settings: { seen: { value: ['x:1'], t: 1 } } } }, 'x:1'), false);
  assert.equal(kit.sayOnce({ wallet: { settings: {} } }, 'x:2'), true);
  // Ten days earlier: no renewal reminder yet.
  kit.plusNotices(s, Date.UTC(2026, 9, 20, 4));
  assert.equal(localStorage.getItem('quadra.seen:plus-renew:2026-09'), null);
  // Not renewing: no reminder next month.
  kit.plusNotices({ ...s, wallet: { ...w, entries: [...w.entries, plus('2026-11')], settings: { plus: { value: { on: false }, t: 2 } } } }, Date.UTC(2026, 10, 29, 4));
  assert.equal(localStorage.getItem('quadra.seen:plus-renew:2026-11'), null);
});

test('looks: an avatar and a frame show only while the account is a Plus member', () => {
  const now = Date.UTC(2026, 9, 10);
  const member = {
    entries: [{ id: 'eco:plus:2026-10', t: now, app: 'eco', kind: 'plus', amount: -490 }],
    settings: { avatar: { value: { id: 'panda' }, t: now }, frame: { value: { id: 'gold' }, t: now } }
  };
  assert.equal(kit.avatarOf(member, now).glyph, '🐼');
  assert.equal(kit.frameOf(member, now).id, 'gold');
  // Not a member (any more), or a look that isn't in the lists: none.
  const expired = Date.UTC(2026, 10, 1);
  assert.equal(kit.avatarOf(member, expired), null);
  assert.equal(kit.frameOf(member, expired), null);
  assert.equal(kit.avatarOf({ ...member, settings: { avatar: { value: { id: 'unlisted' }, t: now } } }, now), null);
});

test('Plus is about Play and Securities: perks that make betting and trading cheaper or bigger, and the looks', () => {
  assert.deepEqual(Object.keys(kit.PLUS.odds).sort(), ['bonusBet', 'boost', 'cashOutKeep']);
  assert.deepEqual(Object.keys(kit.PLUS.stock).sort(), ['commission', 'fxSpread', 'loanCut']);
  assert.ok(kit.PLUS.odds.boost > 1);
  const perks = kit.plusPerks('en');
  assert.deepEqual([...new Set(perks.map(p => p[0]))], ['odds', 'stock', 'looks']);
  assert.ok(perks.every(p => p[1] && p[2]));
});

test('where the money came from: an account older than the shared wallet, its opening money in the apps, reset to 30,000', () => {
  // Securities opened with 100,000 (no Play then): the reset, its fix, a month's pay, the old games' money, interest and its refund.
  const old = {
    entries: [
      { id: 'eco:rebase:v3', app: 'eco', kind: 'rebase', amount: -80_000 },
      { id: 'eco:rebase:v3fix', app: 'eco', kind: 'rebase', amount: 10_000 },
      { id: 'eco:pay:2026-10', app: 'eco', kind: 'pay', amount: 8_000 },
      { id: 'eco:rebase:hub', app: 'eco', kind: 'rebase', amount: 7_648, note: 'hub' },
      { id: 'eco:od:2026-10', app: 'eco', kind: 'od', amount: -466 },
      { id: 'eco:odback:v3', app: 'eco', kind: 'od', amount: 466 }
    ],
    snap: { stock: { cash: 100_000, opened: 100_000, holdings: 0 } }
  };
  const s = kit.moneySides(old);
  assert.deepEqual(s.gave, { start: 30_000, pay: 8_000, rank: 0, other: 7_648 });
  assert.equal(s.quadra, 0);
  assert.equal(s.own, 0);
  // With Play's old 10,000 too (its own entry), no fix: still 30,000.
  const both = kit.moneySides({ entries: [{ id: 'eco:rebase:v3', app: 'eco', kind: 'rebase', amount: -80_000 }, { id: 'odds:start', app: 'odds', kind: 'start', amount: 10_000 }], snap: { stock: { cash: 100_000, opened: 100_000 } } });
  assert.deepEqual([both.gave.start, both.own], [30_000, 0]);
  // A new account: the opening money is the Worker's own entry.
  const fresh = kit.moneySides({ entries: [{ id: 'eco:start', app: 'eco', kind: 'start', amount: 30_000 }], snap: {} });
  assert.deepEqual([fresh.gave.start, fresh.own], [30_000, 0]);
  // Play: an open bet is money at stake (in the worth, on neither side); settled, it's against Quadra, either way.
  const start = { id: 'eco:start', app: 'eco', kind: 'start', amount: 30_000 };
  const bet = { id: 'odds:stake-a', app: 'odds', kind: 'stake', amount: -500 };
  const placed = kit.moneySides({ entries: [start, bet], snap: {} });
  assert.deepEqual([placed.atStake, placed.quadra, placed.own, placed.worth], [500, 0, 0, 30_000]);
  const won = kit.moneySides({ entries: [start, bet, { id: 'odds:payout-a', app: 'odds', kind: 'payout', amount: 1_200 }], snap: {} });
  assert.deepEqual([won.atStake, won.quadra, won.own, won.worth], [0, 700, 0, 30_700]);
  const lost = kit.moneySides({ entries: [start, bet, { id: 'odds:payout-a', app: 'odds', kind: 'payout', amount: 0 }, { id: 'eco:plus:2026-10', app: 'eco', kind: 'plus', amount: -490 }], snap: {} });
  assert.deepEqual([lost.quadra, lost.fees, lost.own, lost.worth], [-990, 490, 0, 29_010]);
  // Securities' gains are the account's own.
  const gain = kit.moneySides({ entries: [start], snap: { stock: { cash: -10_000, holdings: 12_000 } } });
  assert.deepEqual([gain.quadra, gain.own], [0, 2_000]);
});

test('signing out wipes every app’s keys on this device, keeping only its language and safe area', () => {
  store.clear();
  for (const k of ['quadra.refresh', 'quadra.account', 'quadra.wallet', 'quadra.payload.odds', 'oddsStudy.account:abc', 'stockStudy.settings', 'classFocusData', 'quadra.notify.prefs', 'fx.day.v3']) store.set(k, 'x');
  store.set('quadra.lang', 'en');
  store.set('quadra.safeBottom', '{"p":34}');
  tabStore.set('quadra.visit', '1');
  kit.wipeDevice();
  assert.deepEqual([...store.keys()].sort(), ['quadra.lang', 'quadra.safeBottom']);
  assert.equal(tabStore.size, 0);
  assert.equal(kit.storedAccount(), '');
});

test('looks for staying a member: the streak is months held in a row up to now, a gap starts it again', () => {
  const plus = months => ({ entries: months.map(m => ({ id: `eco:plus:${m}`, app: 'eco', kind: 'plus', amount: -490 })), settings: {} });
  const now = Date.UTC(2026, 9, 15);
  assert.equal(kit.plusStreak(plus(['2026-08', '2026-09', '2026-10']), now), 3);
  assert.equal(kit.plusStreak(plus(['2025-11', '2025-12', '2026-01', '2026-10']), now), 1);
  // A year paid ahead counts as its months arrive.
  assert.equal(kit.plusStreak(plus(['2026-10', '2026-11', '2026-12']), now), 1);
  assert.equal(kit.plusStreak(plus(['2026-09']), now), 0);
  // Across a new year.
  assert.equal(kit.plusStreak(plus(['2025-12', '2026-01']), Date.UTC(2026, 0, 10)), 2);
  const wolf = kit.AVATARS.find(a => a.id === 'wolf');
  const fox = kit.AVATARS.find(a => a.id === 'fox');
  const two = { ...plus(['2026-09', '2026-10']), settings: { avatar: { value: { id: 'wolf' }, t: 1 } } };
  assert.equal(kit.lookOpen(two, fox, now), true);
  assert.equal(kit.lookOpen(two, wolf, now), false);
  assert.equal(kit.avatarOf(two, now), null);
  const three = { ...plus(['2026-08', '2026-09', '2026-10']), settings: two.settings };
  assert.equal(kit.avatarOf(three, now)?.id, 'wolf');
  // Every look has a different id, every streak one of LOOK_STREAKS.
  for (const list of [kit.AVATARS, kit.FRAMES]) {
    assert.equal(new Set(list.map(x => x.id)).size, list.length);
    for (const x of list) if (x.streak) assert.ok(kit.LOOK_STREAKS.includes(x.streak));
  }
});
