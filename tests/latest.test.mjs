// Orbit Sports' 最新動態 by Gemini (latest.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { storiesAbout, handleLatest, LATEST_DAILY_CAP } from '../latest.js';

const now = Date.parse('2026-10-07T06:00:00Z');
const art = (id, hoursAgo, cats, extra = {}) => ({ id, headline: `H${id}`, description: `D${id}`, published: new Date(now - hoursAgo * 3_600_000).toISOString(), categories: cats, ...extra });
const feed = { articles: [art(1, 5, [{ type: 'athlete', athleteId: 1966 }]), art(2, 100, [{ type: 'athlete', athleteId: 1966 }]), art(3, 2, [{ type: 'team', teamId: 13 }]), art(4, 1, [{ type: 'athlete', athleteId: 1966 }], { type: 'Media' })] };

test("only the last three days' stories tagged with them, no videos, newest first", () => {
  assert.deepEqual(storiesAbout([feed, feed], { kind: 'player', id: '1966' }, now).map(s => s.id), ['1']);
  assert.deepEqual(storiesAbout([feed], { kind: 'team', id: '13' }, now).map(s => s.id), ['3']);
});

function memCache() {
  const m = new Map();
  return { match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => void m.set(r.url, await res.text()), m };
}
const req = q => new Request(`https://w/latest?${q}`);
const env = { GEMINI_API_KEY: 'k' };

test('Gemini asked once per newest story, kept for everyone; none without stories; capped past the day\'s budget', async () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    let asked = 0;
    const fetchFn = async url => {
      if (String(url).includes('generativelanguage')) {
        asked++;
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ story: 0, headline: '詹姆斯缺席揭幕戰', points: ['他將缺席。'] }) }] } }] }), { status: 200 });
      }
      return new Response(JSON.stringify(feed), { status: 200 });
    };
    const cache = memCache();
    const opts = { session: { s: 'x' }, limited: () => false, cache, fetchFn, log: () => {} };
    const a = await (await handleLatest(req('league=nba&kind=player&id=1966&team=13&name=LeBron%20James'), env, {}, opts)).json();
    assert.deepEqual(a, { at: now - 5 * 3_600_000, from: 'story', headline: '詹姆斯缺席揭幕戰', points: ['他將缺席。'] });
    await handleLatest(req('league=nba&kind=player&id=1966&team=13'), env, {}, opts);
    assert.equal(asked, 1, 'kept: the second opening asks nobody');
    assert.deepEqual(await (await handleLatest(req('league=nba&kind=player&id=9999'), env, {}, opts)).json(), { none: true });
    assert.equal(asked, 1, 'no stories and no facts, no Gemini');
    // A quiet player: written from the sheet's facts (a POST), once a day.
    const post = facts => new Request('https://w/latest', { method: 'POST', body: JSON.stringify({ league: 'nba', kind: 'player', id: '9999', facts }) });
    await handleLatest(post(['近 5 場場均 30 分']), env, {}, opts);
    await handleLatest(post(['近 5 場場均 30 分']), env, {}, opts);
    assert.equal(asked, 2, 'the same facts: asked once, ever');
    // The same ask twice at once: one call.
    await Promise.all([handleLatest(post(['同時 A']), env, {}, opts), handleLatest(post(['同時 A']), env, {}, opts)]);
    assert.equal(asked, 3, 'at once: one call');
    await handleLatest(post(['近 5 場場均 31 分']), env, {}, opts);
    assert.equal(asked, 4, 'new facts: asked again');
    cache.m.set(`https://latest.count/${new Date(now + 8 * 3_600_000).toISOString().slice(0, 10)}`, String(LATEST_DAILY_CAP));
    assert.deepEqual(await (await handleLatest(req('league=nba&kind=team&id=13'), env, {}, opts)).json(), { capped: true });
    assert.equal((await handleLatest(req('league=nba&kind=team&id=13'), env, {}, { ...opts, session: null })).status, 401);
  } finally {
    Date.now = realNow;
  }
});
