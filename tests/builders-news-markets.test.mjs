import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimEvent, quiet, aboutEvent, storyText, fitOf, candidates, deadline, shownEvent, labelOf, shortLabels, pairFacts, endsOf, runNewsMarkets, MARKETS_PATH } from '../builders/news-markets.js';

const NOW = Date.parse('2026-11-12T13:00:00Z');
const market = (label, p, extra = {}) => ({ groupItemTitle: label, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify([String(p), String(1 - p)]), oneDayPriceChange: 0.05, endDate: '2026-12-31T00:00:00Z', ...extra });
const event = (id, title, labels, markets, volume = 500_000) => ({ id, slug: `e-${id}`, title, active: true, closed: false, volume, tags: labels.map(label => ({ label })), markets });
const JENSEN = event('1', 'Jensen Huang announced resignation or removal by...?', ['ceo', 'Tech', 'NVIDIA', 'Jensen Huang'], [market('December 31', 0.12), market('March 31, 2027', 0.2, { endDate: '2027-03-31T00:00:00Z' })]);
const ALICE = event('2', 'Alice Huang arrested by...?', ['China', 'NVIDIA', 'Jensen Huang'], [market('December 31', 0.03)]);
const TAIPEI = event('3', 'Taipei Mayor Election Winner', ['Taiwan', 'Politics', 'Taiwan Elections'], [market('Chiang Wan-an', 0.8), market('Puma Shen', 0.2)]);
const NEW_TAIPEI = event('4', 'New Taipei Mayor Election Winner', ['Taiwan', 'Taiwan Elections'], [market('Lee Szu-chuan', 0.6), market('Su Chiao-hui', 0.4)]);
const evs = [JENSEN, ALICE, TAIPEI, NEW_TAIPEI].map(e => trimEvent(e, NOW));

const tw = (id, title, heads) => ({ id, region: 'tw', title, m: heads.length, items: heads.map((t, i) => [`o${i}`, t, '', NOW]) });
const intl = (id, title, heads) => ({ id, region: 'intl', title, m: heads.length, items: heads.map((t, i) => [`o${i}`, t, '', NOW]) });

test('markets no story is about are left out: games, posts, thin trading, closed', () => {
  assert.equal(trimEvent(event('9', 'Elon Musk # tweets November 10?', ['Culture'], [market('200+', 0.4)]), NOW), null);
  assert.equal(trimEvent(event('9', 'Lakers vs Celtics', ['Sports', 'NBA'], [market('Lakers', 0.4)]), NOW), null);
  assert.equal(trimEvent(event('9', 'Will Trump and Xi hug at APEC?', ['Politics'], [market('', 0.1)]), NOW), null);
  assert.equal(trimEvent(event('9', 'Taitung County Magistrate Election Winner', ['Taiwan'], [market('X', 0.5)], 900), NOW), null);
  assert.equal(trimEvent(event('9', 'Next CEO of NVIDIA?', ['NVIDIA'], [market('X', 0.5, { closed: true })]), NOW), null);
});

test('a Taiwan vote’s markets stay off from ten days before it until the polls close (選罷法 §53)', () => {
  const t = evs[2];
  assert.equal(quiet(t, Date.parse('2026-11-17T15:59:00Z')), false); // 11-17 23:59 in Taiwan
  assert.equal(quiet(t, Date.parse('2026-11-17T16:00:00Z')), true); // 11-18 00:00
  assert.equal(quiet(t, Date.parse('2026-11-28T07:59:00Z')), true);
  assert.equal(quiet(t, Date.parse('2026-11-28T08:00:00Z')), false); // 16:00, the polls closed
  assert.equal(quiet(evs[0], Date.parse('2026-11-20T00:00:00Z')), false); // not a vote
});

test('a story about the board weighing Jensen Huang’s job finds his market; a stray mention doesn’t', () => {
  const s = tw('a', '傳輝達董事會擬撤換黃仁勳', ['輝達董事會深夜討論黃仁勳去留', '黃仁勳恐丟工作 6票就能撤換']);
  assert.ok(fitOf(storyText(s), aboutEvent(evs[0])) > 0);
  // (TSMC's ADR story that once named him in one headline of many.)
  const adr = tw('b', '台積電ADR勁揚2% 台指期夜盤下跌', ['台積電ADR勁揚2%', '台指期夜盤下跌124點', '美股收紅 費半漲', '黃仁勳去留未定 輝達跌']);
  assert.equal(fitOf(storyText(adr), aboutEvent(evs[0])), 0);
});

test('a name no table knows must be in an English story’s words: Alice Huang isn’t Jensen Huang', () => {
  const s = intl('c', 'Nvidia board weighs Jensen Huang’s future', ['Nvidia board weighs removing Jensen Huang as CEO', 'Jensen Huang could be out at Nvidia, reports say']);
  assert.ok(fitOf(storyText(s), aboutEvent(evs[0])) > 0);
  assert.equal(fitOf(storyText(s), aboutEvent(evs[1])), 0);
});

test('a race’s place must be in the story’s title: 苗栗’s debate naming 台中 inside isn’t 台中’s race', () => {
  const TAICHUNG = trimEvent(event('5', 'Taichung Mayor Election Winner', ['Taiwan', 'Taiwan Elections'], [market('Johnny Chiang', 0.8), market('Ho Hsin-chun', 0.2)]), NOW);
  const s = tw('f', '苗栗縣長選舉公辦政見會19日首登場', ['苗栗縣長選舉政見會', '台中市長選舉政見會也將登場', '台中市長選戰 江啟臣']);
  assert.equal(fitOf(storyText(s), aboutEvent(TAICHUNG)), 0);
});

test('Taipei’s race and New Taipei’s are never each other’s', () => {
  const taipei = tw('d', '台北市長選戰／沈伯洋提市民大道縫合', ['台北市長選戰 蔣萬安回應', '北市選戰 沈伯洋政見']);
  const newTaipei = tw('e', '新北市長選戰 李四川拚勝選', ['新北選戰民調 李四川領先', '蘇巧慧搶年輕票 新北市長選舉']);
  assert.deepEqual(candidates([taipei, newTaipei], evs).map(c => [c.s.id, c.ev.id]), [['d', '3'], ['e', '4']]);
});

test('deadlines read as dates; a ladder by deadline, a race by its leaders', () => {
  assert.equal(deadline('December 31'), '12/31');
  assert.equal(deadline('March 31, 2027', NOW), '2027/3/31');
  assert.equal(deadline('November 30, 2026', NOW), '11/30', 'this year’s needs no year');
  assert.equal(deadline('Chiang Wan-an'), null);
  const words = { zh: '黃仁勳何時宣布卸任？', en: 'When will Jensen Huang step down?', labels: {} };
  const ladder = shownEvent(evs[0], words, NOW);
  assert.equal(ladder.kind, 'dates');
  assert.deepEqual(ladder.rows.map(r => [r.md, r.p]), [['12/31', 0.12], ['2027/3/31', 0.2]]);
  const race = shownEvent(evs[2], { zh: '台北市長誰會當選？', en: 'Who will win Taipei mayor?', labels: { 'Chiang Wan-an': { zh: '蔣萬安' }, 'Puma Shen': { zh: '沈伯洋' } } });
  assert.equal(race.kind, 'pick');
  assert.deepEqual(race.rows.map(r => [r.en, r.zh, r.p]), [['Chiang Wan-an', '蔣萬安', 0.8], ['Puma Shen', '沈伯洋', 0.2]]);
  // (One name the AI wasn't sure of: the whole card in the names as written, never half Chinese.)
  const half = shownEvent(evs[2], { zh: '台北市長誰會當選？', en: 'Who will win Taipei mayor?', labels: { 'Chiang Wan-an': { zh: '蔣萬安' } } });
  assert.deepEqual(half.rows.map(r => [r.en, r.zh]), [['Chiang Wan-an', undefined], ['Puma Shen', undefined]]);
  // (A dollar threshold worded in code: Over is that or more, Under is short of it, never 不逾 or 以下.)
  assert.deepEqual(['Over $4T', 'Under $4T', 'Over $500B', 'Under $2.5B'].map(x => labelOf(x, {}, x).zh), ['4兆美元以上', '未達4兆美元', '5000億美元以上', '未達25億美元']);
  assert.deepEqual(labelOf('Jensen Huang (No Change)', { 'Jensen Huang (No Change)': { zh: '黃仁勳續任' } }), { en: 'No change', zh: '不換人' });
});

test('a person keeps the name as written unless the headlines write it in Chinese (Jay 11-13: for names, English for accuracy)', () => {
  const ev = { id: '8', slug: 'next-ceo', markets: [{ label: 'Ian Buck', p: 0.3, d: 0 }, { label: 'Colette Kress', p: 0.14, d: 0 }, { label: 'Jensen Huang (No Change)', p: 0.1, d: 0 }] };
  const shown = shownEvent(ev, { zh: '誰接任黃仁勳？', en: 'q', labels: { 'Ian Buck': { who: 1, en: 'Buck' }, 'Colette Kress': { who: 1, zh: '克瑞斯' } } });
  assert.deepEqual(shown.rows.map(r => [r.en, r.zh]), [['Ian Buck', undefined], ['Colette Kress', '克瑞斯'], ['No change', '不換人']]);
  assert.ok(shown.rows.every(r => !('who' in r)));
});

test('options that share a part are told apart by the rest: never two rows both $4T', () => {
  assert.deepEqual(shortLabels(['Resigned/removed; Over $4T', 'Resigned/removed; Under $4T']), ['Over $4T', 'Under $4T']);
  assert.deepEqual(shortLabels(['Ian Buck', 'Rene Haas']), ['Ian Buck', 'Rene Haas']);
  const ev = { id: '9', slug: 'x', markets: [{ label: 'Resigned/removed; Over $4T', p: 0.6, d: 0 }, { label: 'Resigned/removed; Under $4T', p: 0.4, d: 0 }] };
  const shown = shownEvent(ev, { zh: '黃仁勳去職時，輝達市值會在4兆美元以上嗎？', en: 'If Jensen Huang leaves, will Nvidia be worth over $4 trillion?', labels: { 'Resigned/removed; Over $4T': { zh: '4兆美元以上' }, 'Resigned/removed; Under $4T': { zh: '4兆美元以下' } } });
  assert.deepEqual(shown.rows.map(r => [r.en, r.zh]), [['Over $4T', '4兆美元以上'], ['Under $4T', '未達4兆美元']], 'the side worded in code, whatever the AI said');
});

test('the AI is told how the market is settled: what’s already decided, the day it ends, how the card shows it', () => {
  const combo = event('7', 'Jensen Huang resigned or removed & Nvidia above $4T end of 2026?', ['NVIDIA', 'Jensen Huang'], [
    market('Resigned/removed; Over $4T', 0.56, { endDate: '2027-01-01T04:59:00Z' }),
    market('Resigned/removed; Under $4T', 0.45, { endDate: '2027-01-01T04:59:00Z' }),
    market('Not resigned/removed; Over $4T', 0, { closed: true }),
    market('Not resigned/removed; Under $4T', 0, { closed: true })
  ]);
  combo.negRisk = true;
  const ev = trimEvent(combo, NOW);
  assert.equal(endsOf(ev), '2026-12-31', 'a deadline of 11:59 PM ET is the 31st, never Taiwan’s 1/1');
  const facts = pairFacts({ s: tw('a', '輝達董事會撤換黃仁勳', ['輝達宣布黃仁勳卸任']), ev }).market;
  assert.equal(facts.kind, 'pick');
  assert.equal(facts.ends, '2026-12-31');
  assert.deepEqual(facts.settled, ['Not resigned/removed; Over $4T', 'Not resigned/removed; Under $4T']);
  assert.equal(pairFacts({ s: tw('a', 'x', []), ev: evs[0] }).market.ends, undefined, 'a ladder’s rows each show their deadline');
  // (Options that exclude each other: chances that add to 100%, flagged for the page to round to 100.)
  const shown = shownEvent(ev, { zh: '黃仁勳已宣布去職，輝達2026年底市值會達4兆美元嗎？', en: 'q', labels: {} }, NOW);
  assert.equal(shown.one, 1);
  assert.deepEqual(shown.rows.map(r => r.p), [0.554, 0.446]);
  assert.equal(shownEvent(evs[2], { zh: 'q', en: 'q', labels: {} }, NOW).one, undefined, 'not negRisk: each its own chance');
});

test('a person no table knows stays as the market writes them; Taiwan’s races are told so', () => {
  const alice = pairFacts({ s: tw('a', 'x', []), ev: evs[1] }).market;
  assert.deepEqual(alice.keep, ['Alice Huang']);
  assert.equal(alice.tw, undefined);
  assert.equal(pairFacts({ s: tw('a', 'x', []), ev: evs[0] }).market.keep, undefined, 'Jensen Huang is known: 黃仁勳');
  assert.equal(pairFacts({ s: tw('a', 'x', []), ev: evs[2] }).market.tw, true);
});

test('the page: only pairs the AI confirmed, at today’s prices; nothing asked with the day’s AI at 0', async () => {
  const story = tw('a', '傳輝達董事會擬撤換黃仁勳', ['輝達董事會深夜討論黃仁勳去留', '黃仁勳恐丟工作 6票就能撤換']);
  const files = new Map([
    ['news/index.json', { tw: [{ ...story, topics: ['tech'] }], intl: [] }],
    ['private/news/markets.v4.json', { pairs: { 'a|1': { ok: 1, m: 2, at: NOW } }, words: { 1: { zh: '黃仁勳何時宣布卸任？', en: 'When will Jensen Huang step down?', labels: {} } } }]
  ]);
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, JSON.parse(JSON.stringify(d))), true) };
  const fetchImpl = async url => ({ ok: true, json: async () => (/tag_slug=tech/.test(url) ? [JENSEN, ALICE] : []) });
  const r = await runNewsMarkets({ store, env: {}, now: NOW, fetchImpl });
  assert.equal(r.stories, 1);
  const page = files.get(MARKETS_PATH);
  assert.deepEqual(page.stories.a.map(x => [x.e, x.kind, x.rows[0].p]), [['1', 'dates', 0.12]]);
  // (A read that fails keeps the last page.)
  await assert.rejects(runNewsMarkets({ store, env: {}, now: NOW + 1, fetchImpl: async () => ({ ok: false, status: 503 }) }));
  assert.equal(files.get(MARKETS_PATH).built, NOW);
});
