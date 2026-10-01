// The shared kit's pure parts: the pool, activity and the recommender.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const kit = await import('../kit/quadra.mjs');

test('the pool is every entry and every app figure', () => {
  const w = { entries: [{ id: 'a', amount: 100, app: 'odds' }, { id: 'b', amount: -40, app: 'eco' }], snap: { stock: { cash: 1000, t: 1 } } };
  assert.equal(kit.poolBalance(w), 1060);
  assert.equal(kit.othersBalance(w, 'stock'), 60);
});

test('activity counts reset each Taiwan day', () => {
  const day1 = Date.UTC(2026, 9, 1, 3);
  let w = { settings: {} };
  w.settings = { ...w.settings, ...kit.activityPatch(w, 'stock', 'trade', 1, day1).settings };
  w.settings = { ...w.settings, ...kit.activityPatch(w, 'stock', 'trade', 2, day1).settings };
  assert.deepEqual(kit.todayActivity(w, day1).stock, { trade: 3 });
  assert.deepEqual(kit.todayActivity(w, day1 + 86_400_000), {});
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
      { id: 'a', t: Date.UTC(2026, 8, 30), amount: 500, app: 'vocab', kind: 'reward' },
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
  assert.match(kit.paydayText('zh', Date.UTC(2026, 9, 5), { entries: [] }), /NT\$6,000/);
});

test('free bets: only current Quadra-issued tokens are spent once and last a week', () => {
  const t = Date.UTC(2026, 9, 1);
  const tok = (id, note, at = t, app = 'eco') => ({ id, t: at, app, kind: 'freebet', amount: 0, note });
  const w = { entries: [tok('vocab:fb:a', '100', t, 'vocab'), tok('eco:fb:open', '200'), tok('eco:fb:used', '100'), tok('vocab:fb:old', '100', t - 8 * 86_400_000, 'vocab'), { id: 'odds:fb-eco:fb:used', t, app: 'odds', kind: 'freebet', amount: 0 }] };
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

test('notice switches follow the pass: newest wins, old device switches carried over', async () => {
  store.clear();
  // An older version's switches on this device.
  store.set('quadra.notify', '1');
  store.set('quadra.notify.kinds', JSON.stringify({ 'stock:alert': false, 'odds:slip': true }));
  assert.deepEqual(kit.notifyPrefs(), { on: true, off: ['stock:alert'], t: 0 });
  assert.equal(kit.kindOn('stock', 'alert'), false);
  assert.equal(kit.kindOn('stock', 'fill'), true);
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
  const { asiaMonth, tsdbDays } = await import('../kit/leagues.mjs');
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
  assert.equal(kit.PLUS.odds.lift < 0.158, true);
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

test('v7: the kit and the Worker agree on the allowance and Plus; the statement skips Hub points', async () => {
  const eco = await import('../eco.js');
  assert.equal(kit.ECONOMY.monthly, eco.PAY_MONTH);
  assert.equal(kit.PLUS.fee, eco.PLUS.fee);
  assert.equal(kit.PLUS.year, eco.PLUS.year);
  const now = Date.UTC(2026, 9, 10);
  const w = { entries: [{ id: 'eco:pay:2026-10', t: now - 2, app: 'eco', kind: 'pay', amount: 8_000 }, { id: 'vocab:g:1', t: now - 1, app: 'vocab', kind: 'game', amount: 0, xp: 30 }] };
  const d = kit.accountDetails(w, 'en', now);
  assert.deepEqual(d.recent.map(r => r.amount), [8_000]);
  assert.equal(d.count, 1);
});

test('points: earned make the level and title, spent come off what is left', () => {
  assert.deepEqual([0, 99, 100, 899, 900, 1_600, 8_100, 36_099, 36_100, 84_100, 240_100].map(x => kit.xpLevel(x).level), [1, 1, 2, 3, 4, 5, 10, 19, 20, 30, 50]);
  assert.equal(kit.xpLevel(8_100, 'en').title, 'Skilled');
  assert.equal(kit.xpLevel(36_100).title, '達人');
  const l = kit.xpLevel(550);
  assert.deepEqual([l.level, l.from, l.to, l.toNext], [3, 400, 900, 350]);
  const w = { entries: [
    { id: 'vocab:w:1', t: 1, app: 'vocab', kind: 'words', amount: 0, xp: 700 },
    { id: 'vocab:w:old', t: 1, app: 'vocab', kind: 'words', amount: 300 },
    { id: 'vocab:xs:freeze:a', t: 2, app: 'vocab', kind: 'redeem', amount: 0, note: '600' },
    { id: 'vocab:shop:boost:b', t: 2, app: 'vocab', kind: 'shop', amount: -150 },
    { id: 'odds:x', t: 2, app: 'odds', kind: 'payout', amount: 500 }
  ] };
  assert.deepEqual([kit.xpEarned(w), kit.xpSpent(w), kit.xpBalance(w)], [1_000, 600, 400]);
  assert.equal(kit.xpEarned({ entries: [{ id: 'vocab:g:old', t: 1, app: 'vocab', kind: 'game', amount: 0, xp: 5_000 }] }), 0);
  // Plus v8: worth about three times its fee at face, and no daily lift.
  assert.equal(kit.PLUS.odds.lift, 0);
  assert.ok((kit.PLUS.odds.bonusBet * 52) / 12 > kit.PLUS.fee);
  assert.ok(kit.plusPerks('en').every(p => p && !/winnings, every day/.test(p[1])));
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
  kit.plusNotices(s, now);
  assert.equal(localStorage.getItem('quadra.seen.fb'), 'eco:fb:2026-10-26');
  assert.equal(localStorage.getItem('quadra.seen.renew:2026-10'), '1');
  // Ten days earlier: no renewal reminder yet.
  kit.plusNotices(s, Date.UTC(2026, 9, 20, 4));
  assert.equal(localStorage.getItem('quadra.seen.renew:2026-10'), '1');
  assert.equal(localStorage.getItem('quadra.seen.renew:2026-09'), null);
  // Not renewing: no reminder next month.
  kit.plusNotices({ ...s, wallet: { ...w, entries: [...w.entries, plus('2026-11')], settings: { plus: { value: { on: false }, t: 2 } } } }, Date.UTC(2026, 10, 29, 4));
  assert.equal(localStorage.getItem('quadra.seen.renew:2026-11'), null);
});

test('avatars and frames require an active Plus membership', () => {
  const now = Date.UTC(2026, 9, 10);
  const member = {
    entries: [{ id: 'eco:plus:2026-10', t: now, app: 'eco', kind: 'plus', amount: -490 }],
    settings: { avatar: { value: { id: 'panda' }, t: now }, frame: { value: { id: 'gold' }, t: now } }
  };
  assert.ok(kit.AVATARS.every(a => !('xp' in a) && !('level' in a) && !('streak' in a)));
  assert.ok(kit.FRAMES.every(f => !('xp' in f) && !('level' in f)));
  assert.equal(kit.avatarOwned(member, 'panda', now), true);
  assert.equal(kit.avatarOwned(member, 'unlisted', now), false);
  assert.equal(kit.frameOwned(member, 'gold', now), true);
  assert.equal(kit.avatarOf(member, now).glyph, '🐼');
  assert.equal(kit.frameOf(member, now).id, 'gold');
  const expired = Date.UTC(2026, 10, 1);
  assert.equal(kit.avatarOf(member, expired), null);
  assert.equal(kit.frameOf(member, expired), null);
  assert.deepEqual([1, 4, 5, 14, 15, 25].map(kit.levelCards), [0, 0, 1, 1, 2, 3]);
});

test('activity: two steps in a row both count, later one newer, a new day starts over', () => {
  localStorage.removeItem('quadra.act.odds');
  const now = Date.UTC(2026, 9, 5, 4);
  const w = { settings: { 'act:odds': { value: { day: '2026-10-05', n: { bet: 2 } }, t: now - 5 } } };
  // Both computed from the same (stale) wallet, as Play does when a parlay is placed.
  const a = kit.activityPatch(w, 'odds', 'bet', 1, now).settings['act:odds'];
  const b = kit.activityPatch(w, 'odds', 'parlay', 1, now).settings['act:odds'];
  assert.deepEqual(b.value.n, { bet: 3, parlay: 1 });
  assert.ok(b.t > a.t && a.t > now - 5);
  // The Worker's merge keeps the newer: both counts survive.
  const next = kit.activityPatch({ settings: { 'act:odds': b } }, 'odds', 'bet', 1, now + 1000).settings['act:odds'];
  assert.deepEqual(next.value.n, { bet: 4, parlay: 1 });
  const tomorrow = kit.activityPatch(w, 'odds', 'scratch', 1, now + 86_400_000).settings['act:odds'];
  assert.deepEqual(tomorrow.value, { day: '2026-10-06', n: { scratch: 1 } });
});

test('streak: 5 missions keep a day (2 bonus ones at most), a card covers a day; bonus and milestones', () => {
  const now = Date.UTC(2026, 9, 20, 4);
  const day = n => now - n * 86_400_000;
  const dayOf = n => new Date(day(n) + 8 * 3_600_000).toISOString().slice(0, 10);
  const m = (n, id) => ({ id: `vocab:m:${dayOf(n)}:${id}`, t: day(n), app: 'vocab', kind: 'mission', amount: 0, xp: 10 });
  const kept = n => ['words20', 'words50', 'match', 'orbit', 'invest'].map(id => m(n, id));
  // Kept 1 to 8 days ago, except 4 days ago, which a card covered; nothing yet today.
  const entries = [1, 2, 3, 5, 6, 7, 8].flatMap(kept);
  entries.push({ id: `vocab:fz:${dayOf(4)}`, t: day(3), app: 'vocab', kind: 'freeze', amount: 0 });
  const w = { entries };
  assert.equal(kit.streakOf(w, now), 8);
  assert.equal(kit.longestStreakOf(w), 8);
  // Two daily missions and three bonus ones (two count) make 4; another
  // daily mission reaches the five required.
  const today = [m(0, 'words20'), m(0, 'words50'), m(0, 'parlay3'), m(0, 'scratch'), m(0, 'invest')];
  assert.equal(kit.missionDays({ entries: today })[dayOf(0)], 4);
  assert.equal(kit.streakOf({ entries: [...entries, ...today] }, now), 8);
  assert.equal(kit.streakOf({ entries: [...entries, ...today, m(0, 'match')] }, now), 9);
  // Four daily ones alone aren't enough either.
  assert.equal(kit.streakOf({ entries: [...entries, ...['words20', 'words50', 'quotes', 'match'].map(id => m(0, id))] }, now), 8);
  // Before the mission threshold, vocabulary practice kept the day.
  const old = [0, 1, 2].map(n => ({ id: `vocab:w:${n}`, t: Date.UTC(2026, 8, 30 - n, 4), app: 'vocab', kind: 'words', amount: 0, xp: 1 }));
  assert.equal(kit.streakOf({ entries: old }, Date.UTC(2026, 8, 30, 5)), 3);
  const oldGames = old.map(e => ({ ...e, id: e.id.replace('vocab:w:', 'vocab:g:'), kind: 'game' }));
  assert.equal(kit.streakOf({ entries: oldGames }, Date.UTC(2026, 8, 30, 5)), 0);
  assert.equal(kit.streakBonus(8), 0.16);
  assert.equal(kit.streakBonus(40), kit.STREAK.max);
  assert.equal(kit.streakCards(8), 1);
  // Missing yesterday ends it (the longest stays, and so does the tiger).
  const broken = { entries: entries.filter(e => !e.id.startsWith(`vocab:m:${dayOf(1)}`)) };
  assert.equal(kit.streakOf(broken, now), 0);
  assert.equal(kit.longestStreakOf(broken), 7);
  // Other apps' entries don't count.
  assert.equal(kit.streakOf({ entries: [{ id: 'odds:x', t: day(1), app: 'odds', kind: 'game', amount: 0 }] }, now), 0);
});

test('frames: only Plus members can wear them; a repaired day keeps the streak', () => {
  const now = Date.UTC(2026, 9, 20, 4);
  const member = { entries: [{ id: 'eco:plus:2026-10', t: now, app: 'eco', kind: 'plus', amount: -490 }], settings: { frame: { value: { id: 'gold' }, t: now } } };
  assert.ok(kit.frameOwned(member, 'bronze', now) && !kit.frameOwned(member, 'unknown', now));
  assert.equal(kit.frameOf(member, now).id, 'gold');
  assert.equal(kit.frameOf(member, Date.UTC(2026, 10, 1)), null);
  // Yesterday missed, bought back: the streak runs on.
  const dayOf = n => new Date(now - n * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
  const kept = n => ['words20', 'words50', 'match', 'orbit', 'invest'].map(id => ({ id: `vocab:m:${dayOf(n)}:${id}`, t: now - n * 86_400_000, app: 'vocab', kind: 'mission', amount: 0, xp: 10 }));
  const w = { entries: [...kept(3), ...kept(2)] };
  assert.equal(kit.streakOf(w, now), 0);
  w.entries.push({ id: `vocab:xs:repair:${dayOf(1)}`, t: now, app: 'vocab', kind: 'redeem', amount: 0, note: '1500' });
  assert.equal(kit.streakOf(w, now), 3);
});

test('points expire a year after the month earned, oldest spent first; retired game XP is excluded', () => {
  const oct = Date.UTC(2026, 9, 10);
  const nov = Date.UTC(2026, 10, 10);
  const w = {
    entries: [
      { id: 'vocab:w:a', t: oct, app: 'vocab', kind: 'words', amount: 0, xp: 1_000 },
      { id: 'vocab:w:b', t: nov, app: 'vocab', kind: 'words', amount: 0, xp: 500 },
      { id: 'vocab:xs:card:1', t: nov + 1, app: 'vocab', kind: 'redeem', amount: 0, note: '600' }
    ]
  };
  // The spend came out of October's lot: 400 left there, 500 in November's.
  assert.equal(kit.xpBalance(w, nov + 2), 900);
  assert.deepEqual(kit.xpLots(w, nov + 2).map(l => l.amount), [400, 500]);
  // October 2026's points end with October 2027 (Taipei).
  const octEnd = Date.UTC(2027, 10, 1) - 8 * 3_600_000;
  assert.equal(kit.xpBalance(w, octEnd - 1), 900);
  assert.equal(kit.xpBalance(w, octEnd), 500);
  assert.deepEqual(kit.xpExpiring(w, octEnd - 10 * 86_400_000), { amount: 400, at: octEnd });
  assert.equal(kit.xpExpiring(w, nov + 2), null);
  assert.equal(kit.xpEarned(w), 1_500);
  // Retired game points are not carried forward.
  assert.equal(kit.xpBalance({ entries: [{ id: 'vocab:g:old', t: Date.UTC(2025, 0, 1), app: 'vocab', kind: 'game', amount: 0, xp: 300 }] }, Date.UTC(2027, 8, 1)), 0);
});

test('points catalogue: Worker prices are a member’s, limits a month, tokens used once and gone at their days', async () => {
  const eco = await import('../eco.js');
  for (const c of kit.CATALOG) assert.equal(eco.HUB_XP[c.id], kit.catalogCost(c.id), c.id);
  const oct = Date.UTC(2026, 9, 5, 4);
  const xp = n => ({ id: `vocab:w:${n}`, t: Date.UTC(2026, 9, 1, 4), app: 'vocab', kind: 'words', amount: 0, xp: n });
  const trial = { id: 'eco:plus:2026-09', t: 1, app: 'eco', kind: 'plus', amount: 0, note: 'trial' };
  let w = { entries: [xp(100_000), trial] };
  // Free bets: NT$1,000 of face a month; each a Play token for 7 days.
  const add = (item, key, t = oct) => {
    const e = kit.catalogEntry(w, item, key, t);
    assert.ok(e, `${item} ${key}`);
    w = { ...w, entries: [...w.entries, e] };
    return e;
  };
  assert.equal(add('bet500', 'a').note, '22000');
  add('bet100', 'b');
  add('bet100', 'c');
  add('bet100', 'd');
  add('bet100', 'e');
  add('bet100', 'g');
  assert.equal(kit.catalogLimit(w, 'bet100', oct).why, 'month');
  assert.equal(kit.catalogEntry(w, 'bet100', 'f', oct), null);
  assert.ok(kit.catalogLimit(w, 'bet100', Date.UTC(2026, 10, 2)).ok);
  const bets = kit.freeBets(w, oct + 1);
  assert.deepEqual(bets.map(b => b.value).sort((a, b) => a - b), [100, 100, 100, 100, 100, 500]);
  assert.equal(bets[0].until, oct + 7 * 86_400_000);
  assert.equal(kit.freeBets(w, oct + 8 * 86_400_000).length, 0);
  // Used in Play: gone.
  w = { ...w, entries: [...w.entries, { id: 'odds:fb-vocab:xs:bet500:a', t: oct + 2, app: 'odds', kind: 'freebet', amount: 0 }] };
  assert.equal(kit.freeBets(w, oct + 3).length, 5);
  // Commission vouchers: three a month, 30 days, used once in Securities.
  add('fee', 'x');
  add('fee', 'y');
  add('fee', 'z');
  assert.equal(kit.catalogLimit(w, 'fee', oct).why, 'month');
  w = { ...w, entries: [...w.entries, { id: 'stock:xs-vocab:xs:fee:x', t: oct + 5, app: 'stock', kind: 'voucher', amount: 0 }] };
  assert.deepEqual(kit.catalogTokens(w, 'fee', oct + 6).map(x => [x.id, x.value]), [['vocab:xs:fee:y', 100], ['vocab:xs:fee:z', 100]]);
  assert.equal(kit.catalogTokens(w, 'fee', oct + 31 * 86_400_000).length, 0);
  // A deposit bonus: one a month.
  assert.equal(add('td', 't').note, '12000');
  assert.deepEqual(kit.catalogTokens(w, 'td', oct + 1).map(x => [x.rate, x.cap]), [[0.005, 100_000]]);
  assert.equal(kit.catalogLimit(w, 'td', oct).why, 'month');
  // Plus membership is never redeemable with points.
  const member = { entries: [xp(100_000), { id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: -490 }] };
  assert.equal(kit.catalogEntry(member, 'plus', '', oct), null);
  assert.equal(kit.catalogLimit(w, 'plus', oct).why, 'item');
  assert.equal(kit.catalogEntry(member, 'fee', 'q', oct).note, '4000');
  // Not enough points: nothing.
  assert.equal(kit.catalogEntry({ entries: [xp(4_000), trial] }, 'bet100', 'k', oct), null);
});
