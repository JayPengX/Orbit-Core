// Orbit Sports' 最新動態 by Gemini: GET /latest?league=&kind=player|team&id=
// [&team=<the player's team id>][&name=<English name>][&zh=<the app's
// Chinese name>]&qt=<a Quadra Pass session>.
//
// The Worker reads ESPN's stories itself (the app can't hand it text to
// spend Gemini on): the league's and the team's, those tagged with the
// player or the team, from the last three days, no videos. None: no card,
// no Gemini. Otherwise Gemini (the cheapest model) picks the one story that
// matters about them, if any (not a schedule, odds, a preview, a game's
// report, fantasy, a league-wide piece), and writes it as the app shows it:
// a headline and up to three short points, in Traditional Chinese.
//
// Kept by the newest story's id (Cloudflare's cache, two days): Gemini is
// asked again only when a new story comes, once for everyone. At most
// LATEST_DAILY_CAP asks a day (the owner pays, a few hundred NT$ at a time):
// past it, { capped: true }, and the app draws its own card (rule-based).
// One ask is about 1,000 tokens in and 150 out.
import { CATALOG } from './kit/catalog.mjs';

export const LATEST_MODEL = 'gemini-3.5-flash-lite';
export const LATEST_DAILY_CAP = 400;
const FRESH_MS = 3 * 86_400_000;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const json = (body, headers, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const taipeiDay = (t = Date.now()) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);

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

export function latestPrompt({ kind, name, zh, league, stories }) {
  const who = kind === 'team' ? `the team ${name}` : `the ${league === 'f1' ? 'F1 driver' : 'player'} ${name}`;
  return [
    `You write the "最新動態" (latest) card for ${who} in a Taiwanese sports app. Readers want what has actually happened to ${kind === 'team' ? 'the club' : 'them'}: injuries, suspensions, penalties, transfers, contracts, records, a manager or coach change, a legal case, a big personal performance.`,
    `From the stories below, pick the ONE that is most significant and genuinely about ${name}. Reject schedules, start times, how-to-watch, odds, betting, predictions, fantasy, previews, plain game reports and player ratings, and league-wide pieces that only mention ${name} in passing. If none qualifies, answer pick = -1.`,
    `Write in Traditional Chinese as used in Taiwan (not simplified). ${zh ? `Call them ${zh}.` : `Keep their name in English (${name}), as the app shows it.`} Other people's names may stay in English too. headline: one line, under 30 characters. points: one to three short factual sentences from the story, no opinions, nothing not in the story.`,
    '',
    ...stories.map((s, i) => `[${i}] ${new Date(s.at).toISOString().slice(0, 10)} ${s.headline}\n${s.summary}`)
  ].join('\n');
}

const SCHEMA = {
  type: 'OBJECT',
  properties: { pick: { type: 'INTEGER' }, headline: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['pick']
};

// The day's count of asks, in Cloudflare's cache (close enough: a few
// isolates may each add one at once; the cap is a budget, not a contract).
async function dayCount(cache, add = 0) {
  if (!cache) return 0;
  const key = new Request(`https://latest.count/${taipeiDay()}`);
  const n = Number(await (await cache.match(key))?.text()) || 0;
  if (add) await cache.put(key, new Response(String(n + add), { headers: { 'Cache-Control': 'max-age=172800' } }));
  return n + add;
}

export async function handleLatest(request, env, headers, { session, limited, cache = globalThis.caches?.default, fetchFn = fetch, log = console.log } = {}) {
  if (!session) return json({ error: 'ECO_TOKEN_INVALID' }, headers, 401);
  if (limited()) return json({ error: 'RATE_LIMITED' }, headers, 429);
  const q = new URL(request.url).searchParams;
  const league = q.get('league') || '';
  const kind = q.get('kind') === 'team' ? 'team' : 'player';
  const id = q.get('id') || '';
  const espn = CATALOG[league]?.espn;
  if (!espn || !/^[\w-]{1,40}$/.test(id) || !env.GEMINI_API_KEY) return json({ none: true }, headers);
  const name = (q.get('name') || '').slice(0, 80);
  const zh = (q.get('zh') || '').slice(0, 40);
  const team = kind === 'team' ? (/^\d+$/.test(id) ? id : '') : (q.get('team') || '').replace(/\D/g, '');
  // (ESPN's feeds kept 5 minutes at Cloudflare's edge: a sheet opened again doesn't read them again.)
  const read = url => fetchFn(url, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: 300, cacheEverything: true } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const feeds = await Promise.all([read(`${ESPN}/${espn}/news?limit=50`), team ? read(`${ESPN}/${espn}/news?limit=50&team=${team}`) : null]);
  const stories = storiesAbout(feeds, { kind, id, name });
  if (!stories.length) return json({ none: true }, headers);

  // Kept until a newer story comes.
  const keyUrl = `https://latest.cache/${league}/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(stories[0].id)}`;
  const kept = cache ? await cache.match(new Request(keyUrl)) : null;
  if (kept) return json(await kept.json(), headers);
  if ((await dayCount(cache)) >= LATEST_DAILY_CAP) return json({ capped: true }, headers);
  await dayCount(cache, 1);

  let answer = null;
  try {
    const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${LATEST_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: latestPrompt({ kind, name, zh, league, stories }) }] }],
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
  if (!answer || typeof answer.pick !== 'number') return json({ failed: true }, headers);
  const st = stories[answer.pick];
  const out =
    answer.pick < 0 || !st || !answer.headline
      ? { none: true }
      : { at: st.at, headline: String(answer.headline).slice(0, 80), points: (answer.points || []).map(p => String(p).slice(0, 160)).filter(Boolean).slice(0, 3) };
  if (cache) await cache.put(new Request(keyUrl), new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=172800' } }));
  return json(out, headers);
}
