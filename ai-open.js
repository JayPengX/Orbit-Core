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
//   GET /ai/open?f=<feature>&id=<id>
//     → { out, kept? } | { error: 'origin' | 'feature' | 'story' | 'busy' | 'cap' | 'upstream' }
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

export async function handleAiOpen(request, env, ctx, headers, { ip = '', cap = 0, gemini = null, now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const q = new URL(request.url).searchParams;
  const name = q.get('f') || '';
  const id = String(q.get('id') || '').slice(0, 80);
  const o = OPEN[name];
  if (!o || !id || !env?.DATA) return json({ error: 'feature' }, 400, headers);
  const f = await o.facts(env, id, now, fetchImpl).catch(() => null);
  if (!f) return json({ error: 'story' }, 404, headers);
  const key = `ai:open:${name}:${id}:${f.key}`;
  const kept = await keptRead(env, key);
  if (kept?.out) return json({ out: kept.out, kept: true }, 200, headers);
  if (making.has(key)) {
    const out = await making.get(key).catch(() => null);
    return out ? json({ out }, 200, headers) : json({ error: 'upstream' }, 502, headers);
  }
  if (sessionLimited(`ai-open:${ip}`, 20)) return json({ error: 'busy' }, 429, headers);
  if (!(await spendDay(env, name, cap, twDay(now)))) return json({ error: 'cap' }, 429, headers);
  const job = (async () => {
    const { out } = await runFeature(env, ctx, name, f.input, { gemini, open: true });
    const made = o.out(out, id, f);
    if (!made) throw new Error('nothing usable');
    const put = keptPut(env, key, { out: made }, o.keep);
    if (ctx?.waitUntil) ctx.waitUntil(put);
    else await put;
    return made;
  })();
  making.set(key, job);
  try {
    return json({ out: await job }, 200, headers);
  } catch {
    return json({ error: 'upstream' }, 502, headers);
  } finally {
    making.delete(key);
  }
}
