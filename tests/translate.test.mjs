// Plain translation (translate.js, builders/news-tr.js; Jay 11-13: a full
// Chinese and a full English Orbit, off the AI): names kept, the month's
// cap kept, each text once, only a story's own texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, peopleIn, shielded, shieldedEn, unshield, dayLeft, freshMeter, withMonth, TR_METER, TR_MONTH } from '../translate.js';
import { newsTr, storyTr, wanted, NEWS_TR, trPath } from '../builders/news-tr.js';

const memStore = (seed = {}) => {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { m, json: async k => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, JSON.stringify(v)) };
};
// Google as a fake: each text marked with its language, the spans left alone.
const googleFake = (seen = []) => async (u, init) => {
  const body = JSON.parse(init.body);
  seen.push(body);
  const t = body.q.map(q => (body.target === 'en' ? `EN(${q})` : q.replace(/(^|<\/span>)([^<]+)/g, (_, a, b) => `${a}譯${b.length}`)));
  return new Response(JSON.stringify({ data: { translations: t.map(translatedText => ({ translatedText })) } }));
};
const env = { GOOGLE_WEATHER_KEY: 'k' };

test('names: a person stays in English, a well-known one in Taiwan’s Chinese; places and bodies are not people', () => {
  const p = peopleIn(['Karoline Leavitt defended Marco Rubio on Tuesday after the White House said Prime Minister Keir Starmer would visit New York.', 'Examining Jensen Huang, critics say Tim Cook was not told about the deal at the Supreme Court.']);
  assert.ok(p.includes('Karoline Leavitt') && p.includes('Leavitt') && p.includes('Tim Cook'));
  for (const no of ['Marco Rubio', 'White House', 'Prime Minister Keir', 'New York', 'Supreme Court', 'Jensen Huang', 'Huang', 'Examining Jensen']) assert.ok(!p.includes(no), no);
  // (A headline in Title Case names no one: every word has a capital.)
  assert.deepEqual(peopleIn(['Leavitt Defends Rubio Over Private Trips Paid By Donors']), []);
  assert.equal(shielded('Leavitt defends Rubio & Trump', ['Leavitt']), '<span translate="no">Leavitt</span> defends <span translate="no">盧比歐</span> &amp; <span translate="no">川普</span>');
  assert.equal(unshield('<span translate="no">Leavitt</span>為<span translate="no">盧比歐</span>辯護, 稱: 沒問題?', 'zh-TW'), 'Leavitt 為盧比歐辯護，稱：沒問題？');
});

test('the month: a day spends its share of what is left, never past the cap', () => {
  const now = Date.parse('2026-11-13T04:00:00Z');
  const m = freshMeter(null, now);
  assert.equal(m.month, '2026-11');
  // 18 days left in November (13th..30th).
  assert.equal(dayLeft(m, now), Math.floor((2 * TR_MONTH) / 18));
  assert.equal(dayLeft({ ...m, chars: TR_MONTH, today: 0 }, now), 0);
  // (A new month starts at nothing.)
  assert.equal(freshMeter({ month: '2026-10', chars: 400_000, day: '2026-10-31', today: 9 }, now).chars, 0);
});

test('translate: once over the day’s share it stops; a refused key waits a while; no key asks nothing', async () => {
  const store = memStore();
  const seen = [];
  const out = await translate(env, store, ['Hello there', 'Hello there', ''], 'zh-TW', { fetchImpl: googleFake(seen) });
  assert.deepEqual(Object.keys(out), ['Hello there']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].q.length, 1);
  assert.equal(JSON.parse(store.m.get(TR_METER)).chars, 11);
  const capped = await translate(env, store, ['x'.repeat(50)], 'zh-TW', { fetchImpl: googleFake(seen), max: 10 });
  assert.deepEqual(capped, {});
  const no = await translate(env, store, ['a b'], 'en', { fetchImpl: async () => new Response('denied', { status: 403 }) });
  assert.deepEqual(no, {});
  assert.ok(JSON.parse(store.m.get(TR_METER)).off > Date.now());
  assert.deepEqual(await translate(env, store, ['a b'], 'en', { fetchImpl: googleFake(seen) }), {});
  assert.deepEqual(await translate({}, memStore(), ['a b'], 'en', { fetchImpl: googleFake(seen) }), {});
});

test('news: every headline the AI didn’t title, the top summaries; a turned title made again an hour on', async () => {
  const now = Date.now();
  const w = (id, title) => ({ id, title, sum: `Summary of ${id}`, items: [['cnn', title]] });
  const t = (id, title) => ({ id, title, sum: `${id}的摘要`, items: [['cna', title]] });
  const index = { intl: [w('a', 'Storm hits coast'), w('b', 'Talks resume')], tw: [t('c', '颱風來襲')] };
  const store = memStore({ 'news/index.json': index, 'news/lines.json': { lines: { b: { zh: 'AI 標題' } } } });
  const r = await newsTr({ store, env, now, fetchImpl: googleFake() });
  const tr = JSON.parse(store.m.get(NEWS_TR)).tr;
  assert.equal(tr.a.zh, '譯16');
  assert.equal(tr.b.zh, undefined); // the AI's title wins
  assert.equal(tr.b.sum, '譯12');
  assert.equal(tr.c.en, 'EN(颱風來襲)');
  assert.equal(tr.c.sum, 'EN(c的摘要)');
  assert.ok(r.made >= 4);
  // (The same again asks nothing.)
  const seen = [];
  await newsTr({ store, env, now: now + 60_000, fetchImpl: googleFake(seen) });
  assert.deepEqual(seen, []);
  // (A turned title within the hour keeps the last; past it, made again.)
  index.intl[0].title = 'Storm hits coast hard';
  store.m.set('news/index.json', JSON.stringify(index));
  assert.equal(wanted(index, { b: { zh: 'AI 標題' } }, JSON.parse(store.m.get(NEWS_TR)).tr, now + 60_000).ask.length, 0);
  assert.equal(wanted(index, { b: { zh: 'AI 標題' } }, JSON.parse(store.m.get(NEWS_TR)).tr, now + 2 * 3_600_000).ask.filter(a => a.field === 'title').length, 1);
});

test('a story opened: only its own texts, only those not in the reader’s language, each kept', async () => {
  const s = { id: 'a', title: 'Storm hits coast', sum: 'A storm hit.', items: [['cnn', 'Storm hits coast'], ['fox', 'Big storm']], tw: { items: [['cna', '暴風襲擊']] } };
  const store = memStore();
  const seen = [];
  const find = async id => (id === 'a' ? s : null);
  const r = await storyTr({ store, env, id: 'a', to: 'zh-TW', texts: ['Big storm', 'Not in the story', '暴風襲擊'], find, fetchImpl: googleFake(seen) });
  assert.deepEqual(r.tr, { 'Big storm': '譯9' });
  assert.equal(seen[0].q.length, 1);
  const again = await storyTr({ store, env, id: 'a', to: 'zh-TW', texts: ['Big storm'], find, fetchImpl: googleFake(seen) });
  assert.deepEqual(again.tr, { 'Big storm': '譯9' });
  assert.equal(seen.length, 1);
  assert.ok(store.m.has(trPath('a')));
  const en = await storyTr({ store, env, id: 'a', to: 'en', texts: ['暴風襲擊', 'Big storm'], find, fetchImpl: googleFake(seen) });
  assert.deepEqual(en.tr, { 暴風襲擊: 'EN(暴風襲擊)' });
  assert.equal((await storyTr({ store, env, id: 'zz', to: 'en', texts: [], find })).error, 'story');
});

test('a day alone is this month’s (the one before when it’s still ahead); a headline gets no stop it didn’t have', async () => {
  const at = Date.parse('2026-11-13T04:00:00Z');
  assert.equal(withMonth('衛生所12日實施，3日起報名，2026年11月1日公告', at), '衛生所11月12日實施，11月3日起報名，2026年11月1日公告');
  assert.equal(withMonth('28日發生', at), '10月28日發生');
  const fetchImpl = async (u, init) => new Response(JSON.stringify({ data: { translations: JSON.parse(init.body).q.map(() => ({ translatedText: '沒有談判。' })) } }));
  const out = await translate(env, memStore(), ['No talks underway', 'Talks ended.'], 'zh-TW', { fetchImpl });
  assert.deepEqual(out, { 'No talks underway': '沒有談判', 'Talks ended.': '沒有談判。' });
});

test('Chinese to English: a well-known name and Taiwan’s bodies as Taiwan writes them in English', () => {
  assert.equal(shieldedEn('賴清德與川普通話'), '<span translate="no">Lai Ching-te</span>與<span translate="no">Trump</span>通話');
  assert.equal(shieldedEn('法人：台股走高'), '<span translate="no">analysts</span>：<span translate="no">Taiwan stocks</span>走高');
  assert.equal(shieldedEn('三大法人買超'), '三大法人買超');
  assert.equal(shieldedEn('藍委質詢 <b>'), '<span translate="no">KMT legislator</span>質詢 &lt;b&gt;');
});

test('POST /tr: a Pass’s short texts only, each kept so the next phone asks Google nothing', async () => {
  const { handleTr } = await import('../translate.js');
  const kv = new Map();
  const r2 = new Map();
  const env = {
    GOOGLE_WEATHER_KEY: 'k',
    RATE_LIMIT_KV: { get: async k => kv.get(k) ?? null, getWithMetadata: async k => ({ value: kv.get(k) ?? null, metadata: null }), put: async (k, v) => void kv.set(k, v) },
    DATA: { get: async k => (r2.has(k) ? { arrayBuffer: async () => new TextEncoder().encode(r2.get(k)).buffer, customMetadata: {} } : null), head: async () => null, put: async (k, v) => void r2.set(k, new TextDecoder().decode(v)) }
  };
  let asks = 0;
  const fetchImpl = async (u, init) => (asks++, new Response(JSON.stringify({ data: { translations: JSON.parse(init.body).q.map(q => ({ translatedText: `EN ${q.length}` })) } })));
  const req = body => new Request('https://w/tr', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await handleTr(req({ to: 'en', texts: ['公告'] }), env, {}, null, { fetchImpl })).status, 401);
  const r = await (await handleTr(req({ to: 'en', texts: ['本公司綠線改道', 'Already English', 'x'.repeat(300)] }), env, {}, { app: 'transit' }, { fetchImpl })).json();
  assert.deepEqual(r.tr, { 本公司綠線改道: 'EN 7' });
  const again = await (await handleTr(req({ to: 'en', texts: ['本公司綠線改道'] }), env, {}, { app: 'transit' }, { fetchImpl })).json();
  assert.deepEqual(again.tr, { 本公司綠線改道: 'EN 7' });
  assert.equal(asks, 1);
});
