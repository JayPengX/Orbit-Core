// AI made when someone opens it (Jay 11-14: "I don't want money spent on
// things I don't open… only spend it as I use it but kept fast enough").
// A part is made the first time anyone opens what it's about, from facts
// code picks here or at build, never from what a phone sends; kept for
// everyone after that (kept-store.js). The phone shows the part's shape
// while it's made (a few seconds), or nothing if it can't be.
//   news-brief, news-sides  a story's 重點整理, 各方怎麼說 (id: the story's), from the build's
//                           facts (builders/ai.js newsOpenFacts: private/news/open/<part>.json);
//                           again only once its coverage has grown by half and someone opens it
//   sports-recap            a finished game's why line (id: '<league>:<espn id>'), from ESPN's summary
//   sports-preview          a game to come's 看點 (same id), again within 6 hours of the start
//
// Made ahead, the one exception (11-14, Jay: "kept fast enough"): the front page's lead
// stories (頭條: Taiwan's first 8, the world's first 4), their 重點整理 and 各方怎麼說, on
// each 'ai' run (newsOpenAhead), only when not kept already: what nearly every reader opens,
// on Haiku without thinking (about NT$0.01 a call), AHEAD_DAY a day each at most.
//
//   GET /ai/open?f=<feature>&id=<id>
//     → { out, kept? } | { error: 'origin' | 'feature' | 'story' | 'busy' | 'cap' | 'level' | 'used' | 'upstream' }
import { json, isAllowedOrigin } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { keptRead, keptPut } from './kept-store.js';
import { runFeature, spendDay, twDay } from './ai.js';
import { openPart, openPath, BRIEF_V } from './builders/ai.js';
import { gameFacts } from './builders/recaps.js';
import { previewFacts } from './builders/previews.js';
import { LEAGUES, SITE } from './kit/sports-espn.mjs';

const DAY_S = 86_400;
// (Coverage grown by half: a step of its own, so a story that grew is made again when next opened.)
const step = m => Math.floor(Math.log(Math.max(1, m)) / Math.log(1.5));

// Each news part file read once a few minutes an isolate.
const parts = new Map();
export const forgetParts = () => parts.clear();
async function storyOf(env, id, now) {
  const i = openPart(id);
  const had = parts.get(i);
  if (had && now - had.at < 120_000) return (await had.p)?.[id] || null;
  const p = env.DATA.get(openPath(i))
    .then(o => (o ? o.json() : null))
    .then(j => j?.stories || {})
    .catch(() => ({}));
  parts.set(i, { at: now, p });
  const got = await p;
  // (A part not written yet is read again soon, not held empty two minutes.)
  if (!Object.keys(got).length) parts.set(i, { at: now - 105_000, p });
  return got[id] || null;
}

// A game's ESPN summary (one outside read), with what the builders' facts take from its event.
async function gameOf(id, fetchImpl) {
  const [league, eid] = String(id).split(':');
  const espn = LEAGUES[league]?.espn;
  if (!espn || !/^\d{3,12}$/.test(eid || '')) return null;
  const res = await fetchImpl(`${SITE}/${espn}/summary?event=${eid}`, { cf: { cacheTtl: 60 } }).catch(() => null);
  const summary = res?.ok ? await res.json().catch(() => null) : null;
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  return { summary, state: comp.status?.type?.state || '', e: { league, id: eid, start: comp.date, note: comp.notes?.[0]?.headline || '' } };
}
const whoIn = (people, said) => Object.fromEntries(Object.entries(people || {}).filter(([pid]) => said.includes(`{p:${pid}}`)));

// Each feature: what it's made from (null: nothing to make), its key, how long kept, what's kept of the answer.
export const OPEN = {
  'news-brief': {
    async facts(env, id, now) {
      const s = await storyOf(env, id, now);
      return s?.brief ? { input: { stories: [s.brief] }, key: `v${BRIEF_V}:${step(s.m)}` } : null;
    },
    keep: 3 * DAY_S,
    out: (out, id) => (Array.isArray(out?.[id]) && out[id].length ? { points: out[id] } : null)
  },
  'news-sides': {
    async facts(env, id, now) {
      const s = await storyOf(env, id, now);
      return s?.sides ? { input: { stories: [s.sides] }, key: `v1:${step(s.m)}` } : null;
    },
    keep: 3 * DAY_S,
    out: (out, id) => (out?.[id]?.sides ? out[id] : null)
  },
  'sports-recap': {
    async facts(env, id, now, fetchImpl) {
      const g = await gameOf(id, fetchImpl);
      const f = g?.state === 'post' ? gameFacts(g.summary, g.e) : null;
      return f ? { input: { facts: f.facts }, key: 'v2', people: f.people } : null;
    },
    keep: 30 * DAY_S,
    out: (out, id, f) => (out?.zh ? { ...out, who: whoIn(f.people, `${out.zh} ${out.en}`) } : null)
  },
  'sports-preview': {
    async facts(env, id, now, fetchImpl) {
      const g = await gameOf(id, fetchImpl);
      const start = Date.parse(g?.e.start);
      if (g?.state !== 'pre' || !(start > now)) return null;
      const f = previewFacts(g.summary, g.e);
      // (Made again once within 6 hours of the start: the injury list and the rest by then.)
      return f ? { input: { facts: f.facts }, key: `v2:${start - now < 6 * 3_600_000 ? 'near' : 'far'}`, people: f.people } : null;
    },
    keep: 2 * DAY_S,
    out: (out, id, f) => (out?.points?.length ? { points: out.points, who: whoIn(f.people, out.points.map(p => `${p.zh} ${p.en}`).join(' ')) } : null)
  }
};

// Two people opening the same thing at once: one call.
const making = new Map();

// One part: kept, or made now. → { out, kept? } | { error, status }. allow(): may this one be
// made (the asker's limit, the day's cap), asked only when it isn't kept.
export async function openMake(env, ctx, name, id, { allow = async () => true, gemini = null, now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const o = OPEN[name];
  if (!o || !id || !env?.DATA) return { error: 'feature', status: 400 };
  const f = await o.facts(env, id, now, fetchImpl).catch(() => null);
  if (!f) return { error: 'story', status: 404 };
  const key = `ai:open:${name}:${id}:${f.key}`;
  const kept = await keptRead(env, key);
  if (kept?.out) return { out: kept.out, kept: true };
  if (making.has(key)) {
    const out = await making.get(key).catch(() => null);
    return out ? { out } : { error: 'upstream', status: 502 };
  }
  const no = await allow();
  if (no !== true) return { error: no, status: no === 'level' ? 403 : 429 };
  const job = (async () => {
    const { out } = await runFeature(env, ctx, name, f.input, { gemini, open: true, need: x => !!o.out(x, id, f) });
    const made = o.out(out, id, f);
    if (!made) throw new Error('nothing usable');
    const put = keptPut(env, key, { out: made }, o.keep);
    if (ctx?.waitUntil) ctx.waitUntil(put);
    else await put;
    return made;
  })();
  making.set(key, job);
  try {
    return { out: await job };
  } catch {
    return { error: 'upstream', status: 502 };
  } finally {
    making.delete(key);
  }
}

// (`spend`: one of the asker's Orbit AI allowance taken as one is made,
// ai-allow.js aiSpend → true | 'level' | 'used'; `full`, a test's yes to all.
// What's kept is anyone's, as it costs nothing, and never counted.)
export async function handleAiOpen(request, env, ctx, headers, { ip = '', cap = 0, gemini = null, full = false, spend = null, now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const q = new URL(request.url).searchParams;
  const name = q.get('f') || '';
  const id = String(q.get('id') || '').slice(0, 80);
  const may = spend || (async () => (full ? true : 'level'));
  const allow = async () => {
    if (sessionLimited(`ai-open:${ip}`, 20)) return 'busy';
    const why = await may();
    if (why !== true) return why;
    return (await spendDay(env, name, cap, twDay(now))) ? true : 'cap';
  };
  const r = await openMake(env, ctx, name, id, { allow, gemini, now, fetchImpl });
  return r.error ? json({ error: r.error }, r.status, headers) : json(r.kept ? { out: r.out, kept: true } : { out: r.out }, 200, headers);
}

// The front page's lead stories, made ahead (above): Taiwan's first AHEAD_TW, the world's first
// AHEAD_INTL in the builder's order, three at a time. → { made, kept, failed, capped }.
export const AHEAD_TW = 8;
export const AHEAD_INTL = 4;
export const AHEAD_DAY = 120;
export async function newsOpenAhead({ store, env, ctx = null, until = Infinity, now = Date.now() }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  forgetParts();
  const jobs = [];
  for (const s of [...(index.tw || []).slice(0, AHEAD_TW), ...(index.intl || []).slice(0, AHEAD_INTL)]) for (const name of ['news-brief', 'news-sides']) jobs.push([name, s.id]);
  const out = { made: 0, kept: 0, failed: 0, capped: 0, none: 0 };
  for (let i = 0; i < jobs.length && Date.now() < until; i += 3)
    for (const r of await Promise.all(
      jobs.slice(i, i + 3).map(([name, id]) => openMake(env, ctx, name, id, { now, allow: async () => ((await spendDay(env, `${name}-ahead`, AHEAD_DAY, twDay(now))) ? true : 'cap') }))
    ))
      out[r.kept ? 'kept' : r.out ? 'made' : r.error === 'cap' ? 'capped' : r.error === 'story' ? 'none' : 'failed']++;
  return out;
}
