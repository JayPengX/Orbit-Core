// Orbit Sports' 最新動態 by Gemini, for every player, driver, team and match:
// POST /latest?qt=<a Quadra Pass session>, { league, kind: player|team|match,
// id, team?, team2?, name?, zh?, facts: [lines] } (facts: what the sheet
// knows, in Chinese: form, standing, next game, a match's records and
// result...). GET with the same as a query (no facts) still works.
//
// The Worker reads the news itself (the app can't hand it text to spend
// Gemini on): ESPN's stories tagged with them (the last three days, no
// videos) and Google News's headlines about them (the last week: the court
// case, the knee, the contract talk ESPN's feed never tags). The facts are
// what the page already shows, so Gemini (the cheapest model) is told never
// to read them back: it writes the storyline the news tells and why it
// matters, using the page's numbers only to explain it; with no storyline,
// one insight the page doesn't spell out (a trend, what the next game
// decides). A headline that's the takeaway and up to three short points, in
// Traditional Chinese. No facts and no news: no card.
//
// Kept by exactly what it was written from (the facts and the stories;
// Cloudflare's cache, 30 days): the same card is never asked for twice, for
// anyone; only a change (a new game, a new story) asks again. The same ask
// arriving twice at once is one call. LATEST_DAILY_CAP is a guard against a bug (a loop),
// never reached by use: past it, { capped: true }, and the app shows the
// facts as they are. One ask is about 1,500 tokens in and 200 out.
import { CATALOG } from './kit/catalog.mjs';

export const LATEST_MODEL = 'gemini-3.5-flash-lite';
export const LATEST_DAILY_CAP = 2000;
const FRESH_MS = 3 * 86_400_000;
const WEEK_MS = 7 * 86_400_000;
// How often the news behind a kept card is looked at again (behind the answer).
const RECHECK_MS = 30 * 60_000;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
// Bumped when the prompt changes, so cards written by the old one are written again.
const PROMPT_VERSION = 3;

// The asks under way in this isolate, by key (the same ask twice at once: one call).
const inFlight = new Map();
const json = (body, headers, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const taipeiDay = (t = Date.now()) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
// A short hash (FNV-1a) of what a card is written from.
const hashOf = text => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

// ESPN's stories about them: [{ id, at, headline, summary }], newest first.
export function storiesAbout(feeds, { kind, id, name = '' }, now = Date.now()) {
  const seen = new Set();
  const out = [];
  const plain = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const feed of feeds)
    for (const a of feed?.articles || []) {
      const at = Date.parse(a.published || a.lastModified || '');
      if (!a.headline || !(now - at < FRESH_MS) || a.type === 'Media' || /video/i.test(a.type || '')) continue;
      const cats = a.categories || [];
      const tagged =
        kind === 'team'
          ? cats.some(c => c.type === 'team' && String(c.teamId ?? c.team?.id) === String(id)) || (name && cats.some(c => plain(c.description) === plain(name)))
          : cats.some(c => c.type === 'athlete' && String(c.athleteId ?? c.athlete?.id) === String(id));
      const key = String(a.id ?? a.headline);
      if (!tagged || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, at, headline: String(a.headline).slice(0, 300), summary: String(a.description || '').slice(0, 600) });
    }
  return out.sort((x, y) => y.at - x.at).slice(0, 10);
}

const plainText = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const unXml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();

// Google News's search feed (RSS): [{ id, at, headline, source }] from the
// last week, newest first. `must`: words one of which a headline has to have
// (a player's surname: "Portugal sail into the last 8" isn't about Scales).
export function googleNews(xml, { must = [] } = {}, now = Date.now()) {
  const out = [];
  const words = must.map(plainText).filter(w => w.length > 1);
  for (const [, item] of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = t => unXml(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]);
    const source = tag('source');
    const headline = tag('title').replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
    const at = Date.parse(tag('pubDate'));
    if (!headline || !(now - at < WEEK_MS)) continue;
    if (words.length && !words.some(w => plainText(headline).includes(w))) continue;
    if (/\b(how to watch|live stream|where to watch|tv channel|lineups?\b|odds|betting|picks?\b|prediction|fantasy|parlay)/i.test(headline)) continue;
    out.push({ id: tag('guid') || headline, at, headline: headline.slice(0, 300), source: source.slice(0, 60) });
  }
  return out.sort((x, y) => y.at - x.at);
}

// What to ask Google News for them: the quoted name (and, for a match, both
// sides); a name in Chinese, Taiwan's edition.
export function newsQuery({ kind, name = '', home = '', away = '', sport = '' }) {
  const q = s => `"${String(s).replace(/"/g, '').trim()}"`;
  const words = { soccer: 'football', basketball: 'basketball', baseball: 'baseball', football: 'NFL', hockey: 'hockey', racing: 'F1', tennis: 'tennis', mma: 'UFC' };
  const text = kind === 'match' && home && away ? `${q(away)} ${q(home)}` : kind === 'team' ? `${q(name)} ${words[sport] || ''}` : q(name);
  const zh = /[㐀-鿿]/.test(text);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${text.trim()} when:7d`)}&${zh ? 'hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : 'hl=en-US&gl=US&ceid=US:en'}`;
}

// The same story twice (ESPN's and a paper's, or two papers'): once.
export function sameStoryOnce(stories) {
  const seen = new Set();
  return stories.filter(st => {
    const key = plainText(st.headline).replace(/[^a-z0-9㐀-鿿]+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
    return !seen.has(key) && seen.add(key);
  });
}

export function latestPrompt({ kind, name, zh, league, stories, facts = [], state = '' }) {
  const who = kind === 'team' ? `the team ${name}` : kind === 'match' ? `the match ${name}` : `the ${league === 'f1' ? 'F1 driver' : 'player'} ${name}`;
  const call = zh || name;
  const task =
    kind === 'match'
      ? state === 'post'
        ? `The match is over and the page shows the score, the goals and the numbers. Say what the result means and the story of it from the news: what decided it, who was the difference or let them down, what it changes (the table, a manager under pressure, a streak ended or extended, what comes next). Never retell the score line by line.`
        : `The match is still to come and the page shows both sides' records, places, form and who is out. Say what is at stake and the storylines going in, from the news: a manager under pressure, a player's return or absence that changes things, a rivalry, what a win or a loss would mean in the table. Never list the sides' records or form back.`
      : `Find, in the news below, the storyline genuinely about ${name} right now: an injury or a recovery, a suspension, a legal or disciplinary case, a transfer, a contract or a rumour with substance, a coach's decision or a role change, a milestone, pressure or criticism, a telling quote, what is at stake. Several headlines about one thing are one storyline: combine them into the picture. Write about the most important one (a second may be a point) and set story to the index of its newest headline.`;
  return [
    `You write the "最新動態" (latest) card for ${who} in a Taiwanese sports app.`,
    `The reader already sees, on the same page, everything under "On the page" (records, standings, results, stats, the schedule). The card must tell them what the page can't. Reading the page's numbers back is a failure.`,
    task,
    `Only what is current matters. A line marked 上季 is last season's: never describe it as their form now, and leave it out unless the news compares with it. News older than a newer headline on the same thing is overtaken. An injury, a rest or a limit on their minutes in the injury report (傷病) is the storyline when it is recent, unless the news has something bigger; say what it is, how long, and what it means for the next game.`,
    'Ignore: how to watch, lineups, odds, betting, fantasy, predictions, lifestyle and property, pieces mainly about someone else, news a newer headline overtook.',
    `Use a number from the page only when it explains the story (e.g. 連三場不勝，帥位壓力更大). With no storyline about them in the news, set story = -1 and give one insight the page doesn't spell out, worked out from the page: a trend in the last games against the season, a streak, what the next game decides. Not a summary of the numbers.`,
    `headline: the takeaway in one line, under 24 characters; never a label (「${call}近況」 is wrong; 「${call}膝傷無礙，揭幕戰可望先發」 is the kind). points: up to three short sentences, each adding something new, never repeating the headline.`,
    `Write in Traditional Chinese as used in Taiwan (never simplified). ${zh ? `Call them ${zh}.` : `Keep their name in English (${name}), as the app shows it.`} Other people's names may stay in English. Use only what is given: never invent facts, numbers, quotes or dates. A rumour is told as a rumour (傳出、據報).`,
    '',
    facts.length ? `On the page:\n${facts.map(f => `- ${f}`).join('\n')}` : 'On the page: nothing.',
    '',
    stories.length ? 'News (newest first):' : 'News: none.',
    ...stories.map((st, i) => `[${i}] ${new Date(st.at).toISOString().slice(0, 10)}${st.source ? ` (${st.source})` : ''} ${st.headline}${st.summary ? `\n${st.summary}` : ''}`)
  ].join('\n');
}

const SCHEMA = {
  type: 'OBJECT',
  properties: { story: { type: 'INTEGER' }, headline: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['story', 'headline']
};

// The day's count of asks, in Cloudflare's cache (close enough: a few
// isolates may each add one at once; the cap is a budget, not a contract).
async function dayCount(cache, add = 0) {
  if (!cache) return 0;
  const key = new Request(`https://latest.count/${taipeiDay()}`);
  const n = Number(await (await cache.match(key))?.text()) || 0;
  if (add) await cache.put(key, new Response(String(n + add), { headers: { 'Cache-Control': 'max-age=2592000' } }));
  return n + add;
}

export async function handleLatest(request, env, headers, { session, limited, cache = globalThis.caches?.default, fetchFn = fetch, log = console.log, waitUntil = p => p } = {}) {
  if (!session) return json({ error: 'ECO_TOKEN_INVALID' }, headers, 401);
  if (limited()) return json({ error: 'RATE_LIMITED' }, headers, 429);
  const url = new URL(request.url);
  let body = {};
  if (request.method === 'POST') {
    const text = await request.text().catch(() => '');
    if (text.length > 8000) return json({ error: 'TOO_LONG' }, headers, 413);
    try {
      body = JSON.parse(text) || {};
    } catch {
      body = {};
    }
  }
  const q = k => String(body[k] ?? url.searchParams.get(k) ?? '');
  const league = q('league');
  const kind = ['team', 'match'].includes(q('kind')) ? q('kind') : 'player';
  const id = q('id');
  const info = CATALOG[league];
  const espn = info?.espn;
  if (!info || !/^[\w-]{1,40}$/.test(id) || !env.GEMINI_API_KEY) return json({ none: true }, headers);
  const name = q('name').slice(0, 100);
  const zh = q('zh').slice(0, 60);
  // A match's sides by name (Google News), and whether it's to come or over.
  const [away, home] = kind === 'match' ? [q('away') || name.split(' vs ')[0] || '', q('home') || name.split(' vs ')[1] || ''].map(x => x.slice(0, 60)) : ['', ''];
  const state = q('state') === 'post' ? 'post' : 'pre';
  // What the sheet knows (its own lines, short; never more than 30).
  const facts = (Array.isArray(body.facts) ? body.facts : []).map(f => String(f).replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean).slice(0, 30);
  const digits = x => q(x).replace(/\D/g, '');
  const team = kind === 'team' ? (/^\d+$/.test(id) ? id : '') : digits('team');
  const team2 = kind === 'match' ? digits('team2') : '';
  const read = (u, ttl = 300, as = 'json', ms = 8000) => fetchFn(u, { signal: AbortSignal.timeout(ms), cf: { cacheTtl: ttl, cacheEverything: true } }).then(r => (r.ok ? r[as]() : null)).catch(() => null);

  // Fast: the last card written for them, while the page's facts are the
  // same, comes back at once (no news read, no Gemini waited on). The news
  // is looked at again behind it, at most every half hour, and a new card,
  // if the news changed, is the one the next opening gets.
  const factsHash = hashOf([state, ...facts].join('\n'));
  const lastReq = new Request(`https://latest.cache/v${PROMPT_VERSION}/last/${league}/${kind}/${encodeURIComponent(id)}`);
  const keepLast = card => cache?.put(lastReq, new Response(JSON.stringify({ facts: factsHash, card, checked: Date.now() }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' } }));
  const last = cache ? await cache.match(lastReq).then(r => r?.json()).catch(() => null) : null;
  if (last?.card && last.facts === factsHash) {
    if (!(Date.now() - last.checked < RECHECK_MS)) waitUntil(Promise.resolve(keepLast(last.card)).then(write).catch(() => {}));
    return json(last.card, headers);
  }
  return json(await write(), headers);

  // The news read, the card found by what it's written from, else Gemini asked.
  async function write() {
    // Google's feed, read once an hour at most (and never waited on long: it's the extra, ESPN's the base).
    const google = name ? read(newsQuery({ kind, name, home, away, sport: info.sport }), 3600, 'text', 3000) : null;
    const feeds = espn ? await Promise.all([read(`${ESPN}/${espn}/news?limit=50`), team ? read(`${ESPN}/${espn}/news?limit=50&team=${team}`) : null, team2 ? read(`${ESPN}/${espn}/news?limit=50&team=${team2}`) : null]) : [];
    const espnStories =
      kind === 'match'
        ? [...storiesAbout(feeds, { kind: 'team', id: team }), ...storiesAbout(feeds, { kind: 'team', id: team2 })].filter((x, i, all) => all.findIndex(y => y.id === x.id) === i).slice(0, 6)
        : storiesAbout(feeds, { kind, id, name });
    // A player's headlines have their surname in them (or their whole name, in Chinese).
    const must = kind === 'player' ? (/[㐀-鿿]/.test(name) ? [name] : [name.split(/\s+/).filter(w => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w)).pop() || name]) : [];
    const papers = googleNews(await google, { must }).slice(0, 12);
    const stories = sameStoryOnce([...espnStories, ...papers]).sort((x, y) => y.at - x.at).slice(0, 14);
    if (!stories.length && !facts.length) return { none: true };

    // Kept by exactly what it's written from (the facts, the stories): Gemini is
    // asked again only when that changes, never just because a day passed.
    const keyUrl = `https://latest.cache/v${PROMPT_VERSION}/${league}/${kind}/${encodeURIComponent(id)}/${hashOf([state, ...facts, ...stories.map(x => x.id)].join('\n'))}`;
    const kept = cache ? await cache.match(new Request(keyUrl)) : null;
    const out = kept ? await kept.json() : await (inFlight.get(keyUrl) || inFlight.set(keyUrl, ask(keyUrl, stories).finally(() => inFlight.delete(keyUrl))).get(keyUrl));
    if (out?.headline) await keepLast(out);
    return out;
  }
  async function ask(keyUrl, stories) {
    if ((await dayCount(cache)) >= LATEST_DAILY_CAP) return { capped: true };
    await dayCount(cache, 1);

    let answer = null;
    try {
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${LATEST_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: latestPrompt({ kind, name, zh, league, stories, facts, state }) }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json', responseSchema: SCHEMA }
        }),
        signal: AbortSignal.timeout(15000)
      });
      const data = res.ok ? await res.json() : null;
      const u = data?.usageMetadata || {};
      log(JSON.stringify({ event: 'gemini_usage', feature: 'latest', model: LATEST_MODEL, prompt: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, total: u.totalTokenCount ?? 0 }));
      answer = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || 'null');
    } catch {
      answer = null;
    }
    // Gemini failed: nothing kept, the app draws its own card.
    if (!answer?.headline) return { failed: true };
    const st = stories[answer.story];
    const out = { at: st ? st.at : Date.now(), from: st ? 'story' : 'facts', headline: String(answer.headline).slice(0, 80), points: (answer.points || []).map(p => String(p).slice(0, 160)).filter(Boolean).slice(0, 3) };
    if (cache) await cache.put(new Request(keyUrl), new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' } }));
    return out;
  }
}
