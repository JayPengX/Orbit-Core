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
// shows): a news flash (快訊), a hard fact like a grid penalty, an injury, a
// ruling, a trade; never quotes, reactions, previews or recaps. It weighs it
// (big: it changes the coming games, or it's big anyway) and writes the
// card: the biggest flash, not the newest, as a takeaway
// headline and up to two points of why it matters, and up to two more
// stories in a line each, in Traditional Chinese; or skip, and no card. No match cards: a
// match's page already shows everything Gemini could say.
//
// Fast and cheap: the last answer for them (a card or none) comes back at
// once while what the app sent is the same, and the news is looked at again
// behind it at most every half hour. Each answer is kept by exactly what it
// was written from (Cloudflare's cache, 30 days), so Gemini is never asked
// the same thing twice, by anyone; a skip is kept too. The same ask twice at
// once is one call. With ?stream=1 the answer comes as lines: { writing:
// true } first when Gemini is asked (the app shows the card's shape only
// then), then the answer. LATEST_DAILY_CAP guards against a bug (a loop), never
// reached by use: past it, { capped: true }.
import { CATALOG } from './kit/catalog.mjs';

export const LATEST_MODEL = 'gemini-3.5-flash-lite';
export const LATEST_DAILY_CAP = 2000;
// The localhost dev door's own Gemini asks a day (worker.js), apart from the app's.
export const LATEST_DEV_DAILY_CAP = 60;
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
      const link = a.links?.web?.href || a.links?.mobile?.href || '';
      out.push({ id: key, at, headline: String(a.headline).slice(0, 300), summary: String(a.description || '').slice(0, 600), ...(/^https:\/\//.test(link) ? { url: link } : {}) });
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
    const link = tag('link');
    out.push({ id: tag('guid') || headline, at, headline: headline.slice(0, 300), source: source.slice(0, 60), ...(/^https:\/\//.test(link) ? { url: link } : {}) });
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

// A headline that sounds like a flash (an injury, a rest, a move, a ruling…):
// a star's week on Google is 80-odd items, mostly talk, and the injury
// report a few days back is lost under the newest ten.
const HARD = /\b(injur|hurt|ruled out|won.?t play|will not play|to miss|misses|sidelined|limited|doubtful|questionable|day-to-day|out for|out indefinitely|surgery|torn|tear|strain|sprain|fractur|broken|arthritis|sciatica|knee|ankle|foot|hamstring|calf|groin|shoulder|elbow|back spasm|concussion|illness|rest(s|ed)?\b|load management|return(s|ed|ing)? from|activated|injured list|\bIL\b|suspen|banned|\bban\b|fined|penalt|grid|pit lane|traded|trade[sd]? (for|to)|sign(s|ed)|contract|extension|released|waived|sacked|fired|appointed|hired|resign|verdict|guilty|charged|appeal|court|arrest|record|award|mvp)/i;
// Google's items for the card: the flash-like ones of the week first (deduped), then the newest.
export function papersFor(items, n = 14) {
  const all = sameStoryOnce(items);
  const hard = all.filter(st => HARD.test(st.headline)).slice(0, Math.ceil(n * 0.6));
  return [...hard, ...all.filter(st => !hard.includes(st))].slice(0, n);
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
    `You decide whether ${who} has a news flash (快訊) right now, and if so write the "最新動態" card in a Taiwanese sports app. A flash is a hard fact a fan would want to be told and doesn't know from the scores: most days there is none, and then there is no card, which is better than a weak one.`,
    `A flash, about ${name} themselves: any injury or health news (out, doubtful, limited, held out, back; a knock, a reported or a chronic condition), always, unless a newer item clears it; they are suspended or rested; an F1 grid penalty, a start from the back or the pit lane; a ruling, a charge or a ban in a court or league case; a transfer or trade done, or one reported as agreed or in advanced talks; a coach sacked, hired or resigning; a new contract or a refusal of one; a star asking to leave; a record broken; a major award.`,
    'Never a flash, however new: quotes, interviews, opinions and feelings; a reaction on its own (its subject may be the flash); talk of pressure, form or someone\'s future; previews, a team aiming to bounce back, what a game means; game reports, results, series scores, standings, title-race maths or chances (the page shows them); analysis, rankings and features; highlights, how to watch, lineups, odds, fantasy; lifestyle; pieces mainly about someone else; anything a newer item overtook; anything from last season.',
    'If no flash, set skip = true and leave the rest empty. Otherwise skip = false.',
    'Several items on one thing are one story, the thing that happened: a verdict and the reactions, explainers and visits after it are the verdict, told with what is new. A big one (a ruling, a trade, a coach sacked) stays a flash for the week: when items this week are reactions to a ruling, an explainer of it or a visit after it, the ruling is the flash (曼城財務違規案被判有罪), and the reactions only tell what is new. The headline names the thing itself (曼城財務違規成立，已提上訴), never the reaction. weight: big when it changes the coming games or is big whatever the games (an injury to a regular, a grid drop, a ruling, a trade done, a coach sacked); otherwise normal. The card leads with the biggest flash (equally big: the newest). story = the index of the newest news item used for it (-1 when it comes only from the report); topic = what it is.',
    `headline: the takeaway, under 24 characters besides the names, never a label (「${call}近況」 is wrong; 「{{${name}}}膝傷無礙，揭幕戰可望先發」 is the kind). points: one or two short sentences of fact, each adding something new (how long, since when, who replaces them, what happens next), never an opinion or a feeling. Never list numbers back.`,
    'more: up to two other stories, never the lead\'s again, biggest first, only if they are flashes about them by the same rules (never a story mainly about someone else, a former player, a broadcaster): line = one sentence, under 36 characters besides the names; story and topic as for the lead. None: an empty list.',
    `Write in Traditional Chinese as used in Taiwan (never simplified). Every person's name, in the headline, the points and the lines, is written in double braces with their full name in English as the news has it, e.g. {{${name}}} or {{Ange Postecoglou}} (the app shows each one as that person); never a person's name outside the braces, nor in Chinese ({{Christian Horner}}, not 霍納). Teams and countries are written in Chinese, without braces. Every other word in Chinese (pit lane, paddock, playoffs: 維修區、季後賽), but team and league abbreviations everyone uses (NBA, F1). Use only what is given: never invent facts, numbers, quotes or dates. A rumour is told as a rumour (傳出、據報).`,
    'topic: injury (hurt, out, doubtful), return (back from injury or a ban), suspension, grid (a grid penalty or a start from the back), legal, transfer (a move or a trade), contract, rumour (a move reported, not done), coach (hired, sacked, resigning), role (a coach\'s decision, a role or lineup change), milestone (a record, an award), or other.',
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

export const TOPICS = ['injury', 'return', 'suspension', 'grid', 'legal', 'transfer', 'contract', 'rumour', 'coach', 'role', 'milestone', 'other'];
export const WEIGHTS = ['big', 'normal'];
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    skip: { type: 'BOOLEAN' },
    weight: { type: 'STRING', enum: WEIGHTS },
    story: { type: 'INTEGER' },
    topic: { type: 'STRING', enum: TOPICS },
    headline: { type: 'STRING' },
    points: { type: 'ARRAY', items: { type: 'STRING' } },
    more: { type: 'ARRAY', items: { type: 'OBJECT', properties: { story: { type: 'INTEGER' }, topic: { type: 'STRING', enum: TOPICS }, line: { type: 'STRING' } }, required: ['story', 'topic', 'line'] } }
  },
  // (All of them: Gemini's cheapest model leaves out what it may.)
  required: ['skip', 'weight', 'story', 'topic', 'headline', 'points', 'more'],
  propertyOrdering: ['skip', 'weight', 'story', 'topic', 'headline', 'points', 'more']
};

// The day's count of asks, in Cloudflare's cache (close enough: a few
// isolates may each add one at once; the cap is a budget, not a contract).
async function dayCount(cache, add = 0, dev = false) {
  if (!cache) return 0;
  const key = new Request(`https://latest.count/${dev ? 'dev/' : ''}${taipeiDay()}`);
  const n = Number(await (await cache.match(key))?.text()) || 0;
  if (add) await cache.put(key, new Response(String(n + add), { headers: { 'Cache-Control': 'max-age=2592000' } }));
  return n + add;
}
// What every kept answer is filed under: the prompt, its schema and the
// model, hashed, so any change to them is new answers at once (nothing to bump).
const PROMPT_VERSION = hashOf(latestPrompt.toString() + JSON.stringify(SCHEMA) + LATEST_MODEL);
const KEEP = { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' };

// Gemini's answer as the card: the lead (its weight, its topic, its story's
// day and link) and up to two other stories in a line each, never the lead's
// story again. Exported for the tests.
export function cardOf(answer, stories, now = Date.now()) {
  const st = stories[answer.story];
  const topic = t => (TOPICS.includes(t) ? { topic: t } : {});
  const link = x => (x?.url ? { url: x.url, source: x.source || 'ESPN' } : {});
  const seen = new Set([answer.story]);
  const more = (Array.isArray(answer.more) ? answer.more : [])
    .filter(m => m?.line && String(m.line).trim() && !(m.story >= 0 && seen.has(m.story)) && (seen.add(m.story), true))
    .slice(0, 2)
    .map(m => ({ line: String(m.line).trim().slice(0, 120), ...topic(m.topic), ...(stories[m.story] ? { at: stories[m.story].at } : {}), ...link(stories[m.story]) }));
  return {
    at: st ? st.at : now,
    headline: String(answer.headline).slice(0, 120),
    points: (answer.points || []).map(p => String(p).slice(0, 220)).filter(Boolean).slice(0, 2),
    ...(WEIGHTS.includes(answer.weight) ? { weight: answer.weight } : {}),
    ...topic(answer.topic),
    ...link(st),
    ...(more.length ? { more } : {})
  };
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
  // (Kept across a change to the prompt: the old one's answer at once, the
  // new one written behind it, so a change never makes every card slow.)
  const lastReq = new Request(`https://latest.cache/last/${league}/${kind}/${encodeURIComponent(id)}`);
  const keepLast = (answer, v = PROMPT_VERSION) => cache?.put(lastReq, new Response(JSON.stringify({ v, sent: sentHash, answer, checked: Date.now() }), { headers: KEEP }));
  const last = cache ? await cache.match(lastReq).then(r => r?.json()).catch(() => null) : null;
  // The dev door's ?debug=1: the stories the answer was written from, alongside it (never kept).
  const debug = !!session.dev && url.searchParams.get('debug') === '1';
  if (last?.answer && last.sent === sentHash && !debug) {
    if (last.v !== PROMPT_VERSION || !(Date.now() - last.checked < RECHECK_MS)) waitUntil(Promise.resolve(keepLast(last.answer, last.v)).then(() => write()).catch(() => {}));
    return json(last.answer, headers);
  }
  if (url.searchParams.get('stream') !== '1') return json(await write(), headers);
  // Streamed (?stream=1): a line { writing: true } the moment Gemini is
  // asked, then the answer, so the app shows the card's shape only when a
  // card is being written, never on its way to nothing.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const line = o => writer.write(new TextEncoder().encode(`${JSON.stringify(o)}\n`)).catch(() => {});
  waitUntil(
    write(() => line({ writing: true }))
      .catch(() => ({ failed: true }))
      .then(out => line(out))
      .finally(() => writer.close().catch(() => {}))
  );
  return new Response(readable, { headers: { ...headers, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });

  // The news read; nothing there and no report: none (no Gemini). Else the
  // answer kept for exactly this, or Gemini asked (`writing` told first).
  async function write(writing = () => {}) {
    const google = name ? read(newsQuery({ kind, name, sport: info.sport }), 3600, 'text', 3000) : null;
    const feeds = info.espn ? await Promise.all([read(`${ESPN}/${info.espn}/news?limit=50`), team ? read(`${ESPN}/${info.espn}/news?limit=50&team=${team}`) : null]) : [];
    const espnStories = storiesAbout(feeds, { kind, id, name });
    // A player's headlines have their surname in them (or their whole name, in Chinese).
    const must = kind === 'player' ? (/[㐀-鿿]/.test(name) ? [name] : [name.split(/\s+/).filter(w => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w)).pop() || name]) : [];
    const papers = papersFor(googleNews(await google, { must }));
    const stories = sameStoryOnce([...espnStories, ...papers]).sort((x, y) => y.at - x.at).slice(0, 18);
    let out;
    if (!stories.length && !report.length) out = { none: true };
    else {
      const keyUrl = `https://latest.cache/v${PROMPT_VERSION}/${league}/${kind}/${encodeURIComponent(id)}/${hashOf([...facts, '|', ...report, '|', ...stories.map(x => x.id)].join('\n'))}`;
      const kept = cache ? await cache.match(new Request(keyUrl)) : null;
      if (!kept) writing();
      out = kept ? await kept.json() : await (inFlight.get(keyUrl) || inFlight.set(keyUrl, ask(keyUrl, stories).finally(() => inFlight.delete(keyUrl))).get(keyUrl));
    }
    if (out?.headline || out?.none) await keepLast(out);
    const probe = debug && name ? await (async t => fetchFn(newsQuery({ kind, name, sport: info.sport }), { signal: AbortSignal.timeout(8000) }).then(async r => `${r.status} ${Date.now() - t}ms ${(await r.text()).length}b`).catch(e => `${e.name} ${Date.now() - t}ms`))(Date.now()) : '';
    return debug ? { ...out, debug: { google: !!(await google), probe, stories: stories.map(st => `${new Date(st.at).toISOString().slice(5, 10)} ${st.source || 'ESPN'} | ${st.headline}`) } } : out;
  }

  async function ask(keyUrl, stories) {
    const dev = !!session.dev;
    if ((await dayCount(cache)) >= LATEST_DAILY_CAP || (dev && (await dayCount(cache, 0, true)) >= LATEST_DEV_DAILY_CAP)) return { capped: true };
    await dayCount(cache, 1);
    if (dev) await dayCount(cache, 1, true);
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 700, responseMimeType: 'application/json', responseSchema: SCHEMA }
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
    // (Names in braces, {{Micky van de Ven}}: the app shows each as that person.)
    const out = answer.skip ? { none: true } : cardOf(answer, stories);
    if (cache) await cache.put(new Request(keyUrl), new Response(JSON.stringify(out), { headers: KEEP }));
    return out;
  }
}
