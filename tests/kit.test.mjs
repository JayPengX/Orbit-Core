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
  assert.match(d.recent[1].text, /Quadra · 每月津貼/);
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

test('the allowance: by what the account is worth, Securities holdings included', () => {
  assert.equal(kit.paydayFor({ entries: [] }), 8_000);
  assert.equal(kit.paydayFor({ entries: [{ id: 'a', amount: 60_000, app: 'odds' }] }), 4_000);
  assert.equal(kit.paydayFor({ entries: [], snap: { stock: { cash: 50_000, holdings: 500_000, t: 1 } } }), 500);
  assert.match(kit.paydayText('zh', Date.UTC(2026, 9, 5), { entries: [] }), /NT\$8,000/);
});

test('free bets: tokens (Rewards gave them before v7) are spent once and last a week', () => {
  const t = Date.UTC(2026, 9, 1);
  const tok = (id, note, at = t) => ({ id, t: at, app: 'vocab', kind: 'freebet', amount: 0, note });
  const w = { entries: [tok('vocab:fb:a', '100'), tok('vocab:fb:b', '50', t + 1000), tok('vocab:fb:c', '7'), tok('vocab:fb:old', '100', t - 8 * 86_400_000), { id: 'odds:fb-vocab:fb:b', t, app: 'odds', kind: 'freebet', amount: 0 }] };
  assert.deepEqual(kit.freeBets(w, t).map(x => [x.id, x.value]), [['vocab:fb:a', 100]]);
  assert.deepEqual(kit.freeBets(w, t, ['vocab:fb:a']), []);
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

test('pictures: national sides get flags, players found in either name order, fighters learned', async () => {
  const L = await import('../kit/logos.mjs');
  assert.equal(L.playerNation('Sri Lanka'), 'LK');
  assert.equal(L.countryCode('England'), 'GB-ENG');
  assert.equal(L.countryFlag('Wales'), '🇬🇧');
  assert.match(L.teamBadge('kleague', 'Ulsan HD'), /thesportsdb/);
  assert.match(L.teamBadge('cricket', 'West Indies'), /thesportsdb/);
  L.rememberLogo('wta', 'Shi Han', 'https://a.espncdn.com/i/teamlogos/countries/500/chn.png');
  assert.match(L.teamLogo('wta', 'Han Shi'), /chn\.png$/);
  L.rememberNation('Some Boxer', 'Mexico');
  assert.equal(L.playerNation('Some Boxer'), 'MX');
  assert.ok(L.knowsNation('Some Boxer'));
  for (const key of ['acb', 'nbl', 'cba', 'kbl', 'kleague', 'rugbyunion', 'cricket', 'boxing']) assert.ok(L.leagueLogo(key), key);
});

test('v7: the kit and the Worker agree on the allowance and Plus; the statement skips Rewards points', async () => {
  const eco = await import('../eco.js');
  assert.deepEqual(kit.ECONOMY.payTiers, eco.PAY_TIERS);
  assert.equal(kit.PLUS.fee, eco.PLUS.fee);
  assert.equal(kit.PLUS.year, eco.PLUS.year);
  const now = Date.UTC(2026, 9, 10);
  const w = { entries: [{ id: 'eco:pay:2026-10', t: now - 2, app: 'eco', kind: 'pay', amount: 8_000 }, { id: 'vocab:g:1', t: now - 1, app: 'vocab', kind: 'game', amount: 0, xp: 30 }] };
  const d = kit.accountDetails(w, 'en', now);
  assert.deepEqual(d.recent.map(r => r.amount), [8_000]);
  assert.equal(d.count, 1);
});

test('points: earned make the level and title, spent come off what is left', () => {
  assert.deepEqual([0, 99, 100, 999, 1_000, 4_500, 19_000, 43_500].map(x => kit.xpLevel(x).level), [1, 1, 2, 4, 5, 10, 20, 30]);
  assert.equal(kit.xpLevel(4_500, 'en').title, 'Skilled');
  assert.equal(kit.xpLevel(19_000).title, '達人');
  const l = kit.xpLevel(550);
  assert.deepEqual([l.level, l.from, l.to, l.toNext], [3, 300, 600, 50]);
  const w = { entries: [
    { id: 'vocab:g:1', t: 1, app: 'vocab', kind: 'game', amount: 0, xp: 700 },
    { id: 'vocab:w:old', t: 1, app: 'vocab', kind: 'words', amount: 300 },
    { id: 'vocab:xs:freeze:a', t: 2, app: 'vocab', kind: 'redeem', amount: 0, note: '600' },
    { id: 'vocab:shop:boost:b', t: 2, app: 'vocab', kind: 'shop', amount: -150 },
    { id: 'odds:x', t: 2, app: 'odds', kind: 'payout', amount: 500 }
  ] };
  assert.deepEqual([kit.xpEarned(w), kit.xpSpent(w), kit.xpBalance(w)], [1_000, 600, 400]);
  // Plus v8: worth about three times its fee at face, and no daily lift.
  assert.equal(kit.PLUS.odds.lift, 0);
  assert.ok((kit.PLUS.odds.bonusBet * 52) / 12 + 300 * kit.PLUS.vocab.cards > 2.5 * kit.PLUS.fee);
  assert.ok(kit.plusPerks('en').every(p => p && !/winnings, every day/.test(p[1])));
});
