// Orbit Sports' 最新動態 by Gemini: a player's, a driver's or a team's real
// news, and only that. POST /latest?qt=<a Quadra Pass session>, { league,
// kind: player|team, id, team?, name?, zh?, facts: [who they are], report:
// [ESPN's injury report, RotoWire's note: recent, written by people] }.
//
// The Worker reads the news itself: ESPN's stories tagged with them (the
// last three days, no videos; the newest two read in full, free from ESPN's
// content API) and Google News's headlines about them (the last week: the
// court case, the contract talk ESPN never tags). Nothing there and no
// report: no card, and no Gemini. Otherwise Gemini (the cheapest model)
// decides if any of it is real news (an injury, a case, a transfer, a
// milestone...; not highlights, previews, game reports or numbers the page
// shows) and writes it: a takeaway headline and up to two points of why it
// matters, in Traditional Chinese; or skip, and no card. No match cards: a
// match's page already shows everything Gemini could say.
//
// Fast and cheap: the last answer for them (a card or none) comes back at
// once while what the app sent is the same, and the news is looked at again
// behind it at most every half hour. Each answer is kept by exactly what it
// was written from (Cloudflare's cache, 30 days), so Gemini is never asked
// the same thing twice, by anyone; a skip is kept too. The same ask twice at
// once is one call. LATEST_DAILY_CAP guards against a bug (a loop), never
// reached by use: past it, { capped: true }.
import { CATALOG } from './kit/catalog.mjs';

export const LATEST_MODEL = 'gemini-3.5-flash-lite';
export const LATEST_DAILY_CAP = 2000;
const FRESH_MS = 3 * 86_400_000;
const WEEK_MS = 7 * 86_400_000;
// How often the news behind a kept answer is looked at again (behind the answer).
const RECHECK_MS = 30 * 60_000;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_ARTICLE = 'https://content.core.api.espn.com/v1/sports/news';

// The asks under way in this isolate, by key (the same ask twice at once: one call).
const inFlight = new Map();
const json = (body, headers, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const taipeiDay = (t = Date.now()) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
// A short hash (FNV-1a) of what an answer is written from.
const hashOf = text => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const lines = (x, n, len) => (Array.isArray(x) ? x : []).map(f => String(f).replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, n);

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
    if (/\b(how to watch|live stream|where to watch|tv channel|lineups?\b|odds|betting|picks?\b|prediction|fantasy|parlay|highlights?|full game|and-1|mic'd up)/i.test(headline)) continue;
    out.push({ id: tag('guid') || headline, at, headline: headline.slice(0, 300), source: source.slice(0, 60) });
  }
  return out.sort((x, y) => y.at - x.at);
}

// What to ask Google News for them: the quoted name (a team's with its
// sport); a name in Chinese, Taiwan's edition.
export function newsQuery({ kind, name = '', sport = '' }) {
  const words = { soccer: 'football', basketball: 'basketball', baseball: 'baseball', football: 'NFL', hockey: 'hockey', racing: 'F1', tennis: 'tennis', mma: 'UFC' };
  const text = `"${String(name).replace(/"/g, '').trim()}"${kind === 'team' && words[sport] ? ` ${words[sport]}` : ''}`;
  const zh = /[㐀-鿿]/.test(text);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${text} when:7d`)}&${zh ? 'hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : 'hl=en-US&gl=US&ceid=US:en'}`;
}

// The same story twice (ESPN's and a paper's, or two papers'): once.
export function sameStoryOnce(stories) {
  const seen = new Set();
  return stories.filter(st => {
    const key = plainText(st.headline).replace(/[^a-z0-9㐀-鿿]+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
    return !seen.has(key) && seen.add(key);
  });
}

// An ESPN article's text (its HTML and ESPN's embeds taken out), the first `max` characters.
export function articleText(data, max = 1800) {
  const story = data?.headlines?.[0]?.story || '';
  return String(story)
    .replace(/<(script|style|figure|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/ ([.,!?;:)])/g, '$1')
    .trim()
    .slice(0, max);
}

export function latestPrompt({ kind, name, zh, league, stories, facts = [], report = [] }) {
  const who = kind === 'team' ? `the team ${name}` : `the ${league === 'f1' ? 'F1 driver' : 'player'} ${name}`;
  const call = zh || name;
  return [
    `You decide whether ${who} has real news right now, and if so write the "最新動態" (latest) card in a Taiwanese sports app.`,
    `Real news, about ${name} themselves: an injury, a rest or a limit on minutes; a suspension; a legal or disciplinary case; a transfer, a contract or a rumour with substance; a coach's decision or a role change; a milestone or a record; pressure or criticism; a quote that reveals something. Several items on one thing are one story: combine them.`,
    'Not news: highlights, how to watch, lineups, odds, fantasy, previews, plain game reports, stats and results (the page shows them), lifestyle, pieces mainly about someone else, anything a newer item overtook, anything from last season.',
    'If nothing qualifies, set skip = true and leave the rest empty. Otherwise skip = false and story = the index of the newest news item used (-1 when it comes only from the report).',
    `headline: the takeaway, under 24 characters, never a label (「${call}近況」 is wrong; 「${call}膝傷無礙，揭幕戰可望先發」 is the kind). points: one or two short sentences, each adding something new: the context and what it means next. Never list numbers back.`,
    `Write in Traditional Chinese as used in Taiwan (never simplified). ${zh ? `Call them ${zh}.` : `Keep their name in English (${name}), as the app shows it.`} Other people's names may stay in English. Use only what is given: never invent facts, numbers, quotes or dates. A rumour is told as a rumour (傳出、據報).`,
    '',
    facts.length ? `Who they are:\n${facts.map(f => `- ${f}`).join('\n')}` : '',
    report.length ? `Report (written by people, recent):\n${report.map(f => `- ${f}`).join('\n')}` : 'Report: none.',
    '',
    stories.length ? 'News (newest first):' : 'News: none.',
    ...stories.map((st, i) => `[${i}] ${new Date(st.at).toISOString().slice(0, 10)}${st.source ? ` (${st.source})` : ''} ${st.headline}${st.text ? `\n${st.text}` : st.summary ? `\n${st.summary}` : ''}`)
  ]
    .filter(x => x !== '')
    .join('\n');
}

const SCHEMA = {
  type: 'OBJECT',
  properties: { skip: { type: 'BOOLEAN' }, story: { type: 'INTEGER' }, headline: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['skip']
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
// What every kept answer is filed under: the prompt, its schema and the
// model, hashed, so any change to them is new answers at once (nothing to bump).
const PROMPT_VERSION = hashOf(latestPrompt.toString() + JSON.stringify(SCHEMA) + LATEST_MODEL);
const KEEP = { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' };

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
  const kind = q('kind') === 'team' ? 'team' : q('kind') === 'player' || !q('kind') ? 'player' : '';
  const id = q('id');
  const info = CATALOG[league];
  if (!kind || !info || !/^[\w-]{1,40}$/.test(id) || !env.GEMINI_API_KEY) return json({ none: true }, headers);
  const name = q('name').slice(0, 100);
  const zh = q('zh').slice(0, 60);
  const facts = lines(body.facts, 6, 200);
  const report = lines(body.report, 3, 400);
  const team = kind === 'team' ? (/^\d+$/.test(id) ? id : '') : q('team').replace(/\D/g, '');
  const read = (u, ttl = 300, as = 'json', ms = 8000) => fetchFn(u, { signal: AbortSignal.timeout(ms), cf: { cacheTtl: ttl, cacheEverything: true } }).then(r => (r.ok ? r[as]() : null)).catch(() => null);

  // Fast: the last answer for them (a card or none) at once while what the
  // app sent is the same; the news looked at again behind it every half hour.
  const sentHash = hashOf([...facts, '|', ...report].join('\n'));
  const lastReq = new Request(`https://latest.cache/v${PROMPT_VERSION}/last/${league}/${kind}/${encodeURIComponent(id)}`);
  const keepLast = answer => cache?.put(lastReq, new Response(JSON.stringify({ sent: sentHash, answer, checked: Date.now() }), { headers: KEEP }));
  const last = cache ? await cache.match(lastReq).then(r => r?.json()).catch(() => null) : null;
  if (last?.answer && last.sent === sentHash) {
    if (!(Date.now() - last.checked < RECHECK_MS)) waitUntil(Promise.resolve(keepLast(last.answer)).then(write).catch(() => {}));
    return json(last.answer, headers);
  }
  return json(await write(), headers);

  // The news read; nothing there and no report: none (no Gemini). Else the
  // answer kept for exactly this, or Gemini asked.
  async function write() {
    const google = name ? read(newsQuery({ kind, name, sport: info.sport }), 3600, 'text', 3000) : null;
    const feeds = info.espn ? await Promise.all([read(`${ESPN}/${info.espn}/news?limit=50`), team ? read(`${ESPN}/${info.espn}/news?limit=50&team=${team}`) : null]) : [];
    const espnStories = storiesAbout(feeds, { kind, id, name });
    // A player's headlines have their surname in them (or their whole name, in Chinese).
    const must = kind === 'player' ? (/[㐀-鿿]/.test(name) ? [name] : [name.split(/\s+/).filter(w => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w)).pop() || name]) : [];
    const papers = googleNews(await google, { must }).slice(0, 10);
    const stories = sameStoryOnce([...espnStories, ...papers]).sort((x, y) => y.at - x.at).slice(0, 12);
    let out;
    if (!stories.length && !report.length) out = { none: true };
    else {
      const keyUrl = `https://latest.cache/v${PROMPT_VERSION}/${league}/${kind}/${encodeURIComponent(id)}/${hashOf([...facts, '|', ...report, '|', ...stories.map(x => x.id)].join('\n'))}`;
      const kept = cache ? await cache.match(new Request(keyUrl)) : null;
      out = kept ? await kept.json() : await (inFlight.get(keyUrl) || inFlight.set(keyUrl, ask(keyUrl, stories).finally(() => inFlight.delete(keyUrl))).get(keyUrl));
    }
    if (out?.headline || out?.none) await keepLast(out);
    return out;
  }

  async function ask(keyUrl, stories) {
    if ((await dayCount(cache)) >= LATEST_DAILY_CAP) return { capped: true };
    await dayCount(cache, 1);
    // ESPN's two newest stories in full (the why is in the text, not the headline).
    await Promise.all(
      stories
        .filter(st => !st.source)
        .slice(0, 2)
        .map(async st => {
          st.text = /^\d+$/.test(st.id) ? articleText(await read(`${ESPN_ARTICLE}/${st.id}`, 86_400, 'json', 3000)) : '';
        })
    );
    let answer = null;
    try {
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${LATEST_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: latestPrompt({ kind, name, zh, league, stories, facts, report }) }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: 'application/json', responseSchema: SCHEMA }
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
    // Gemini failed: nothing kept, the app draws ESPN's own word if it has it.
    if (!answer || (!answer.skip && !answer.headline)) return { failed: true };
    const st = stories[answer.story];
    const out = answer.skip ? { none: true } : { at: st ? st.at : Date.now(), headline: String(answer.headline).slice(0, 80), points: (answer.points || []).map(p => String(p).slice(0, 160)).filter(Boolean).slice(0, 2) };
    if (cache) await cache.put(new Request(keyUrl), new Response(JSON.stringify(out), { headers: KEEP }));
    return out;
  }
}
