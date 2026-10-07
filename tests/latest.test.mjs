// Orbit Sports' 最新動態 by Gemini (latest.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { storiesAbout, handleLatest, LATEST_DAILY_CAP, newsQuery, sameStoryOnce, latestPrompt, articleText } from '../latest.js';

const now = Date.parse('2026-10-07T06:00:00Z');
const art = (id, hoursAgo, cats, extra = {}) => ({ id, headline: `H${id}`, description: `D${id}`, published: new Date(now - hoursAgo * 3_600_000).toISOString(), categories: cats, ...extra });
const feed = { articles: [art(1, 5, [{ type: 'athlete', athleteId: 1966 }]), art(2, 100, [{ type: 'athlete', athleteId: 1966 }]), art(3, 2, [{ type: 'team', teamId: 13 }]), art(4, 1, [{ type: 'athlete', athleteId: 1966 }], { type: 'Media' })] };

test("only the last three days' stories tagged with them, no videos, newest first", () => {
  assert.deepEqual(storiesAbout([feed, feed], { kind: 'player', id: '1966' }, now).map(s => s.id), ['1']);
  assert.deepEqual(storiesAbout([feed], { kind: 'team', id: '13' }, now).map(s => s.id), ['3']);
});


test("Google News: the week's headlines with their surname, no how-to-watch or odds, the paper's name apart", async () => {
  const { googleNews } = await import('../latest.js');
  const item = (title, source, hoursAgo, guid) => `<item><title>${title} - ${source}</title><link>https://news.google.com/x</link><guid isPermaLink="false">${guid}</guid><pubDate>${new Date(now - hoursAgo * 3_600_000).toUTCString()}</pubDate><source url="https://x">${source}</source></item>`;
  const xml = `<rss><channel>${[
    item('Liam Scales makes Ireland return after sitting out Israel clash', 'Yahoo Sports', 5, 'a'),
    item('Portugal sail into Nations League last 8, Greece frustrate Germany', 'Daily Sabah', 6, 'b'),
    item('Ireland vs Austria Lineups, Live Stream, TV Channels: Scales starts', 'AOL.com', 7, 'c'),
    item('Irish media wrong to slate Celtic star Liam Scales &amp; the stats', 'Yahoo', 30, 'd'),
    item('Scales signs new deal', 'BBC', 24 * 9, 'e')
  ].join('')}</channel></rss>`;
  assert.deepEqual(googleNews(xml, { must: ['Scales'] }, now), [
    { id: 'a', at: now - 5 * 3_600_000, headline: 'Liam Scales makes Ireland return after sitting out Israel clash', source: 'Yahoo Sports' },
    { id: 'd', at: now - 30 * 3_600_000, headline: 'Irish media wrong to slate Celtic star Liam Scales & the stats', source: 'Yahoo' }
  ]);
  assert.equal(googleNews(xml, {}, now).length, 3, 'a team: every headline Google found (but how-to-watch)');
});

function memCache() {
  const m = new Map();
  return { match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => void m.set(r.url, await res.text()), m };
}
const env = { GEMINI_API_KEY: 'k' };
const post = body => new Request('https://w/latest', { method: 'POST', body: JSON.stringify({ league: 'nba', kind: 'player', name: 'Stephen Curry', ...body }) });
// A world: ESPN's feed (`feed`), Google's (`rss`), ESPN's articles, and Gemini answering `reply`.
function world({ feed = { articles: [] }, rss = '', reply = { skip: false, story: 0, headline: '卡', points: ['一'] } } = {}) {
  const seen = { gemini: 0, articles: 0, reads: 0, prompts: [] };
  const fetchFn = async (url, init) => {
    url = String(url);
    if (url.includes('generativelanguage')) {
      seen.gemini++;
      seen.prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(typeof reply === 'function' ? reply(seen.gemini) : reply) }] } }] }), { status: 200 });
    }
    seen.reads++;
    if (url.includes('content.core')) return (seen.articles++, new Response(JSON.stringify({ headlines: [{ story: '<p>Curry said the knee <b>feels strong</b>.</p>' }] }), { status: 200 }));
    if (url.includes('news.google')) return new Response(rss, { status: 200 });
    return new Response(JSON.stringify(feed), { status: 200 });
  };
  return { seen, opts: { session: { s: 'x' }, limited: () => false, cache: memCache(), fetchFn, log: () => {} } };
}
const withNow = async fn => {
  const real = Date.now;
  Date.now = () => now;
  try {
    await fn();
  } finally {
    Date.now = real;
  }
};

test('no news and no report: no card, and Gemini never asked', () =>
  withNow(async () => {
    const { seen, opts } = world();
    assert.deepEqual(await (await handleLatest(post({ id: '3975', facts: ['勇士・控球後衛'] }), env, {}, opts)).json(), { none: true });
    assert.equal(seen.gemini, 0);
    const reads = seen.reads;
    assert.deepEqual(await (await handleLatest(post({ id: '3975', facts: ['勇士・控球後衛'] }), env, {}, opts)).json(), { none: true });
    assert.equal(seen.reads, reads, 'the second opening: straight from the kept answer, no news read');
  }));

test('a story: ESPN\'s article read in full, the card written once and kept for everyone', () =>
  withNow(async () => {
    const { seen, opts } = world({ feed: { articles: [art(50121620, 5, [{ type: 'athlete', athleteId: 3975 }])] } });
    const a = await (await handleLatest(post({ id: '3975' }), env, {}, opts)).json();
    assert.deepEqual(a, { at: now - 5 * 3_600_000, headline: '卡', points: ['一'] });
    assert.equal(seen.articles, 1);
    assert.match(seen.prompts[0], /\[0\] 2026-10-07 H50121620\nCurry said the knee feels strong\./);
    await handleLatest(post({ id: '3975' }), env, {}, { ...opts, cache: opts.cache });
    assert.equal(seen.gemini, 1);
  }));

test('Gemini finds nothing real: none, kept (not asked again for the same news)', () =>
  withNow(async () => {
    const { seen, opts } = world({ feed: { articles: [art(1, 5, [{ type: 'athlete', athleteId: 3975 }])] }, reply: { skip: true } });
    assert.deepEqual(await (await handleLatest(post({ id: '3975' }), env, {}, opts)).json(), { none: true });
    // Another device, the same news (the last answer gone): the kept skip, no second ask.
    opts.cache.m.forEach((_, k) => k.includes('/last/') && opts.cache.m.delete(k));
    assert.deepEqual(await (await handleLatest(post({ id: '3975' }), env, {}, opts)).json(), { none: true });
    assert.equal(seen.gemini, 1);
  }));

test('a report alone (an injury) is enough to ask; a new report asks again; at once, one call', () =>
  withNow(async () => {
    const { seen, opts } = world({ reply: { skip: false, story: -1, headline: '柯瑞限時出賽', points: [] } });
    const ask = report => handleLatest(post({ id: '3975', report }), env, {}, opts).then(r => r.json());
    const [a, b] = await Promise.all([ask(['傷病：Day-To-Day']), ask(['傷病：Day-To-Day'])]);
    assert.equal(a.headline, '柯瑞限時出賽');
    assert.deepEqual(a, b);
    assert.equal(seen.gemini, 1);
    assert.match(seen.prompts[0], /Report \(written by people, recent\):\n- 傷病：Day-To-Day/);
    await ask(['傷病：Out']);
    assert.equal(seen.gemini, 2);
  }));

test('the last answer at once; the news looked at again behind it every half hour, a new card for the next opening', async () => {
  const real = Date.now;
  let t = now;
  Date.now = () => t;
  try {
    let n = 1;
    const feedNow = () => ({ articles: [art(n, 1, [{ type: 'athlete', athleteId: 7 }])] });
    const { seen, opts } = world({ reply: k => ({ skip: false, story: 0, headline: `卡 ${k}` }) });
    const fetchFn = opts.fetchFn;
    opts.fetchFn = async (url, init) => (String(url).includes('/news?') ? new Response(JSON.stringify(feedNow()), { status: 200 }) : fetchFn(url, init));
    const behind = [];
    opts.waitUntil = p => behind.push(p);
    const open = () => handleLatest(post({ id: '7', name: 'A B' }), env, {}, opts).then(r => r.json());
    assert.equal((await open()).headline, '卡 1');
    assert.equal((await open()).headline, '卡 1');
    assert.equal(behind.length, 0, 'within half an hour: not even looked at');
    t += 31 * 60_000;
    n = 2;
    assert.equal((await open()).headline, '卡 1');
    await Promise.all(behind);
    assert.equal(seen.gemini, 2);
    assert.equal((await open()).headline, '卡 2');
  } finally {
    Date.now = real;
  }
});

test('no match cards; capped past the day\'s budget; a session needed', () =>
  withNow(async () => {
    const { seen, opts } = world({ feed: { articles: [art(1, 5, [{ type: 'team', teamId: 9 }])] } });
    assert.deepEqual(await (await handleLatest(post({ kind: 'match', id: '401' }), env, {}, opts)).json(), { none: true });
    opts.cache.m.set(`https://latest.count/${new Date(now + 8 * 3_600_000).toISOString().slice(0, 10)}`, String(LATEST_DAILY_CAP));
    assert.deepEqual(await (await handleLatest(post({ kind: 'team', id: '9', name: 'Golden State Warriors' }), env, {}, opts)).json(), { capped: true });
    assert.equal(seen.gemini, 0);
    assert.equal((await handleLatest(post({ id: '9' }), env, {}, { ...opts, session: null })).status, 401);
  }));

test("what's asked of Google News; the same story once; ESPN's article as plain text", () => {
  const q = u => new URL(u).searchParams.get('q');
  assert.equal(q(newsQuery({ kind: 'player', name: 'Max Verstappen' })), '"Max Verstappen" when:7d');
  assert.equal(q(newsQuery({ kind: 'team', name: 'Manchester City', sport: 'soccer' })), '"Manchester City" football when:7d');
  assert.match(newsQuery({ kind: 'player', name: '林安可' }), /hl=zh-TW/);
  assert.deepEqual(sameStoryOnce([{ headline: 'Man City appeal Premier League financial ruling' }, { headline: 'Man City appeal Premier League financial ruling, sources say' }, { headline: 'Haaland to leave' }]).map(x => x.headline), ['Man City appeal Premier League financial ruling', 'Haaland to leave']);
  assert.equal(articleText({ headlines: [{ story: '<p>One&nbsp;two.</p><aside>ad</aside><p>Three</p>' }] }), 'One two. Three');
});

test('the prompt: real news or skip, never the numbers', () => {
  const p = latestPrompt({ kind: 'team', name: 'Manchester City', zh: '曼城', league: 'epl', facts: ['英超'], stories: [{ at: now, source: 'Reuters', headline: 'Man City appeal Premier League financial ruling' }] });
  assert.match(p, /set skip = true/);
  assert.match(p, /\[0\] 2026-10-07 \(Reuters\) Man City appeal/);
  assert.match(p, /Report: none\./);
});

test('streamed: "writing" only when Gemini is asked, then the answer; nothing to write, just none', () =>
  withNow(async () => {
    const linesOf = async res => (await res.text()).trim().split('\n').map(x => JSON.parse(x));
    const streamed = body => new Request('https://w/latest?stream=1', { method: 'POST', body: JSON.stringify({ league: 'nba', kind: 'player', name: 'Stephen Curry', ...body }) });
    const quiet = world();
    assert.deepEqual(await linesOf(await handleLatest(streamed({ id: '3975' }), env, {}, quiet.opts)), [{ none: true }]);
    const news = world({ feed: { articles: [art(5, 5, [{ type: 'athlete', athleteId: 3975 }])] } });
    const res = await handleLatest(streamed({ id: '3975' }), env, {}, news.opts);
    assert.equal(res.headers.get('Content-Type'), 'application/x-ndjson');
    assert.deepEqual(await linesOf(res), [{ writing: true }, { at: now - 5 * 3_600_000, headline: '卡', points: ['一'] }]);
    // Written before: the answer at once, no "writing".
    assert.deepEqual(await linesOf(await handleLatest(streamed({ id: '3975' }), env, {}, news.opts)), [{ at: now - 5 * 3_600_000, headline: '卡', points: ['一'] }]);
  }));
