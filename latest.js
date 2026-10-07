// Orbit Sports' 最新動態 by Gemini, for every player, driver, team and match:
// POST /latest?qt=<a Quadra Pass session>, { league, kind: player|team|match,
// id, team?, team2?, name?, zh?, facts: [lines] } (facts: what the sheet
// knows, in Chinese: form, standing, next game, a match's records and
// result...). GET with the same as a query (no facts) still works.
//
// The Worker reads ESPN's stories itself (the app can't hand it text to
// spend Gemini on): the league's and the team's, those tagged with the
// player or the team, from the last three days, no videos. None: no card,
// Gemini (the cheapest model) writes the card from the one story that matters
// about them (not a schedule, odds, a preview, a game's report, fantasy, a
// league-wide piece), or, with none, from the facts: their situation now, a
// match's preview or recap. A headline and up to three short points, in
// Traditional Chinese. No facts and no story: no card.
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
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

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

export function latestPrompt({ kind, name, zh, league, stories, facts = [] }) {
  const who = kind === 'team' ? `the team ${name}` : kind === 'match' ? `the match ${name}` : `the ${league === 'f1' ? 'F1 driver' : 'player'} ${name}`;
  return [
    `You write the "最新動態" (latest) card for ${who} in a Taiwanese sports app.`,
    kind === 'match'
      ? 'Before the match: a short preview (form, the table, head-to-head, who is missing, the odds). After it: a short recap (the result, who decided it). Use a story below only if it adds something real.'
      : `If one of the stories below is significant and genuinely about ${name} (an injury, a suspension or penalty, a transfer or contract, a record, a coach or manager change, a legal case, a standout performance), write about it and set story to its index. Ignore schedules, start times, odds, betting, predictions, fantasy, previews, plain game reports and league-wide pieces. Otherwise set story = -1 and write ${kind === 'team' ? 'the club' : 'their'} situation now from the facts: what stands out (form, a streak, the standing, injuries, the next game).`,
    `Write in Traditional Chinese as used in Taiwan (never simplified). ${zh ? `Call them ${zh}.` : `Keep their name in English (${name}), as the app shows it.`} Other people's names may stay in English. headline: one line, under 30 characters. points: one to three short factual sentences. Use only what is given; never invent numbers or events.`,
    '',
    facts.length ? `Facts:\n${facts.map(f => `- ${f}`).join('\n')}` : 'Facts: none.',
    '',
    stories.length ? 'Stories:' : 'Stories: none.',
    ...stories.map((st, i) => `[${i}] ${new Date(st.at).toISOString().slice(0, 10)} ${st.headline}\n${st.summary}`)
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

export async function handleLatest(request, env, headers, { session, limited, cache = globalThis.caches?.default, fetchFn = fetch, log = console.log } = {}) {
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
  const espn = CATALOG[league]?.espn;
  if (!espn || !/^[\w-]{1,40}$/.test(id) || !env.GEMINI_API_KEY) return json({ none: true }, headers);
  const name = q('name').slice(0, 100);
  const zh = q('zh').slice(0, 60);
  // What the sheet knows (its own lines, short; never more than 30).
  const facts = (Array.isArray(body.facts) ? body.facts : []).map(f => String(f).replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean).slice(0, 30);
  const digits = x => q(x).replace(/\D/g, '');
  const team = kind === 'team' ? (/^\d+$/.test(id) ? id : '') : digits('team');
  const team2 = kind === 'match' ? digits('team2') : '';
  const read = u => fetchFn(u, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: 300, cacheEverything: true } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const feeds = await Promise.all([read(`${ESPN}/${espn}/news?limit=50`), team ? read(`${ESPN}/${espn}/news?limit=50&team=${team}`) : null, team2 ? read(`${ESPN}/${espn}/news?limit=50&team=${team2}`) : null]);
  const stories =
    kind === 'match'
      ? [...storiesAbout(feeds, { kind: 'team', id: team }), ...storiesAbout(feeds, { kind: 'team', id: team2 })].filter((x, i, all) => all.findIndex(y => y.id === x.id) === i).slice(0, 6)
      : storiesAbout(feeds, { kind, id, name });
  if (!stories.length && !facts.length) return json({ none: true }, headers);

  // Kept by exactly what it's written from (the facts, the stories): Gemini is
  // asked again only when that changes, never just because a day passed.
  const keyUrl = `https://latest.cache/${league}/${kind}/${encodeURIComponent(id)}/${hashOf([...facts, ...stories.map(x => x.id)].join('\n'))}`;
  const kept = cache ? await cache.match(new Request(keyUrl)) : null;
  if (kept) return json(await kept.json(), headers);
  if (!inFlight.has(keyUrl)) inFlight.set(keyUrl, ask().finally(() => inFlight.delete(keyUrl)));
  const out = await inFlight.get(keyUrl);
  return json(out, headers);
  async function ask() {
    if ((await dayCount(cache)) >= LATEST_DAILY_CAP) return { capped: true };
    await dayCount(cache, 1);

    let answer = null;
    try {
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${LATEST_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: latestPrompt({ kind, name, zh, league, stories, facts }) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: 'application/json', responseSchema: SCHEMA }
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
