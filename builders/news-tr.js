// Orbit News in one language (Jay 11-13: "a full traditional Chinese
// experience and full English experience"): every story's headline, and
// the summary of the stories at the top, in the other language, by plain
// translation (translate.js, Google's free month), never the AI's (its
// titles in news/lines.json win wherever it made one; it's never run
// through a translator). A world story's in Chinese, a Taiwan story's in
// English. Run with the AI's steps (builders/ai.js runAi).
//
//   news/tr.json  { built, tr: { id: { zh | en, t, sum?, s?, at } } }
//                 zh | en: the title in the other language, t the outlet's
//                 title it's from; sum the summary's, s the summary it's from.
//
// Each text once: a story's title made again only when its title has
// turned, an hour on at the soonest (a lead outlet changing its words
// every few minutes costs one translation an hour, not ten). The rest of a
// story (each outlet's headline, a summary lower down) is translated when
// a person opens it (worker.js /news-tr, handleNewsTr).
import { translate, peopleIn, readMeter } from '../translate.js';

export const NEWS_TR = 'news/tr.json';
export const TR_AGAIN = 3_600_000;
// The summaries translated ahead: the stories at the top of each side.
export const SUM_TOP = 12;
const NEWS_LINES = 'news/lines.json';

const toOf = region => (region === 'intl' ? 'zh-TW' : 'en');
const keyOf = region => (region === 'intl' ? 'zh' : 'en');
export const storyPeople = s => (s.region === 'intl' ? peopleIn([s.sum, ...(s.items || []).map(it => it[1])]) : []);

// What a run asks for, best first: each side's stories in their order, a
// title its AI line doesn't cover, then the top stories' summaries.
export function wanted(index, lines, was, now = Date.now()) {
  const keep = {};
  const ask = [];
  const sides = ['intl', 'tw'].map(region => (index[region] || []).map((s, i) => ({ ...s, region, rank: i })));
  const order = [];
  for (let i = 0; i < Math.max(...sides.map(x => x.length)); i++) for (const side of sides) if (side[i]) order.push(side[i]);
  for (const s of order) {
    const k = keyOf(s.region);
    const old = was[s.id] || {};
    const e = { at: old.at || now };
    // (The AI's title covers it: none of ours.)
    const ai = lines[s.id]?.[k];
    const fresh = now - (old.at || 0) < TR_AGAIN;
    if (!ai && s.title) {
      if (old[k] && (old.t === s.title || fresh)) Object.assign(e, { [k]: old[k], t: old.t });
      else ask.push({ s, field: 'title', text: s.title });
    }
    if (s.sum && s.rank < SUM_TOP) {
      if (old.sum && (old.s === s.sum || fresh)) Object.assign(e, { sum: old.sum, s: old.s });
      else ask.push({ s, field: 'sum', text: s.sum });
    } else if (old.sum && old.s === s.sum) Object.assign(e, { sum: old.sum, s: old.s });
    keep[s.id] = e;
  }
  // (Titles before summaries: a list's every headline first.)
  ask.sort((a, b) => (a.field === b.field ? 0 : a.field === 'title' ? -1 : 1));
  return { keep, ask };
}

export async function newsTr({ store, env, now = Date.now(), fetchImpl = fetch, force = false }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const lines = (await store.json(NEWS_LINES).catch(() => null))?.lines || {};
  const was = (await store.json(NEWS_TR).catch(() => null))?.tr || {};
  const { keep, ask } = wanted(index, lines, was, now);
  let made = 0;
  for (const to of ['zh-TW', 'en']) {
    const mine = ask.filter(a => toOf(a.s.region) === to);
    if (!mine.length) continue;
    // (Each text its own story's people: one story's "York" is no other's New York.)
    const whose = new Map(mine.map(a => [a.text, a.s]));
    const seen = new Map();
    const people = t => {
      const s = whose.get(t);
      if (!seen.has(s.id)) seen.set(s.id, storyPeople(s));
      return seen.get(s.id);
    };
    const got = await translate(env, store, mine.map(a => a.text), to, { people, now, fetchImpl, force });
    for (const a of mine) {
      const v = got[a.text];
      if (!v) continue;
      const e = keep[a.s.id];
      if (a.field === 'title') Object.assign(e, { [keyOf(a.s.region)]: v, t: a.text, at: now });
      else Object.assign(e, { sum: v, s: a.text, at: now });
      made++;
    }
  }
  const tr = {};
  for (const [id, e] of Object.entries(keep)) if (e.zh || e.en || e.sum) tr[id] = e;
  // (The month so far beside them, for the admin panel and a look from outside: characters, and a failure's code.)
  const m = await readMeter(store, now).catch(() => null);
  const use = m ? { month: m.month, chars: m.chars, today: m.today || 0, ...(m.off > now ? { off: String(m.why || '').slice(0, 10) } : {}) } : null;
  await store.put(NEWS_TR, { built: now, use, tr });
  // (The failure's whole reason to the run's log only, never the public file.)
  return { made, asked: ask.length, kept: Object.keys(tr).length, use, ...(m?.off > now ? { why: m.why } : {}) };
}

// ---- A story opened (worker.js /news-tr) ----
// The texts a person's phone asks for, only the story's own (its outlets'
// headlines and summary, its clips' titles, Taiwan's outlets on a world
// story), each kept in news/tr/<id>.json once made. `to`: the reader's
// language; a text already in it is left as is.
const hasHan = t => /[㐀-鿿]/.test(t);
const STORY_MAX = 4_000;
export const trPath = id => `news/tr/${String(id).replace(/[^a-z0-9_-]/gi, '')}.json`;
export function storyTexts(s) {
  return new Set([s.title, s.sum, ...(s.items || []).map(it => it[1]), ...(s.clips || []).map(c => c[3]), ...(s.tw?.items || []).map(it => it[1])].filter(Boolean).map(t => String(t).trim()));
}
export async function storyTr({ store, env, id, to, texts, now = Date.now(), fetchImpl = fetch, find }) {
  if (!['zh-TW', 'en'].includes(to)) return { error: 'to' };
  const s = await find(id);
  if (!s) return { error: 'story' };
  const own = storyTexts(s);
  const want = [...new Set((Array.isArray(texts) ? texts : []).slice(0, 60).map(t => String(t || '').trim()))].filter(t => own.has(t) && hasHan(t) === (to === 'en'));
  const path = trPath(s.id);
  const kept = (await store.json(path).catch(() => null)) || {};
  const mine = { ...(kept[to] || {}) };
  const need = want.filter(t => !mine[t]);
  if (need.length) {
    const people = to === 'zh-TW' ? peopleIn([s.sum, ...(s.items || []).map(it => it[1])]) : [];
    const got = await translate(env, store, need, to, { people, now, fetchImpl, max: STORY_MAX });
    if (Object.keys(got).length) {
      Object.assign(mine, got);
      await store.put(path, { ...kept, [to]: mine, at: now });
    }
  }
  return { tr: Object.fromEntries(want.filter(t => mine[t]).map(t => [t, mine[t]])) };
}
