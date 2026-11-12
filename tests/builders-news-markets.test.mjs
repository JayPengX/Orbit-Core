import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimEvent, quiet, aboutEvent, storyText, fitOf, candidates, deadline, shownEvent, runNewsMarkets, MARKETS_PATH } from '../builders/news-markets.js';

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

test('Taipei’s race and New Taipei’s are never each other’s', () => {
  const taipei = tw('d', '台北市長選戰／沈伯洋提市民大道縫合', ['台北市長選戰 蔣萬安回應', '北市選戰 沈伯洋政見']);
  const newTaipei = tw('e', '新北市長選戰 李四川拚勝選', ['新北選戰民調 李四川領先', '蘇巧慧搶年輕票 新北市長選舉']);
  assert.deepEqual(candidates([taipei, newTaipei], evs).map(c => [c.s.id, c.ev.id]), [['d', '3'], ['e', '4']]);
});

test('deadlines read as dates; a ladder by deadline, a race by its leaders', () => {
  assert.equal(deadline('December 31'), '12/31');
  assert.equal(deadline('March 31, 2027'), '2027/3/31');
  assert.equal(deadline('Chiang Wan-an'), null);
  const words = { zh: '黃仁勳何時宣布卸任？', en: 'When will Jensen Huang step down?', names: {} };
  const ladder = shownEvent(evs[0], words);
  assert.equal(ladder.kind, 'dates');
  assert.deepEqual(ladder.rows.map(r => [r.md, r.p]), [['12/31', 0.12], ['2027/3/31', 0.2]]);
  const race = shownEvent(evs[2], { zh: '台北市長誰會當選？', en: 'Who will win Taipei mayor?', names: { 'Chiang Wan-an': '蔣萬安' } });
  assert.equal(race.kind, 'pick');
  assert.deepEqual(race.rows.map(r => [r.en, r.zh, r.p]), [['Chiang Wan-an', '蔣萬安', 0.8], ['Puma Shen', undefined, 0.2]]);
});

test('the page: only pairs the AI confirmed, at today’s prices; nothing asked with the day’s AI at 0', async () => {
  const story = tw('a', '傳輝達董事會擬撤換黃仁勳', ['輝達董事會深夜討論黃仁勳去留', '黃仁勳恐丟工作 6票就能撤換']);
  const files = new Map([
    ['news/index.json', { tw: [{ ...story, topics: ['tech'] }], intl: [] }],
    ['private/news/markets.json', { pairs: { 'a|1': { ok: 1, m: 2, at: NOW } }, words: { 1: { zh: '黃仁勳何時宣布卸任？', en: 'When will Jensen Huang step down?', names: {} } } }]
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
