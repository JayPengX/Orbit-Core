// Orbit News in one language (Jay 11-13: "a full traditional Chinese
// experience and full English experience"): the texts a person's phone asks
// for, only as they're on screen (a list's titles in one batch, a story's
// own words as it's opened), by plain translation (translate.js, Google's
// free month), never the AI's. Nothing is translated ahead (11-14: it cost
// too much). Each text once, kept in news/tr/<id>.json (worker.js /news-tr).
import { translate, peopleIn, withMonth } from '../translate.js';

export const TR_V = 2;

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
// (`make`: new ones, which Google bills, only for a 完整 pass's session (worker.js);
// anyone else gets what's kept, the builder's and earlier readers'.)
export async function storyTr({ store, env, id, to, texts, now = Date.now(), fetchImpl = fetch, find, make = true }) {
  if (!['zh-TW', 'en'].includes(to)) return { error: 'to' };
  const s = await find(id);
  if (!s) return { error: 'story' };
  const own = storyTexts(s);
  const want = [...new Set((Array.isArray(texts) ? texts : []).slice(0, 60).map(t => String(t || '').trim()))].filter(t => own.has(t) && hasHan(t) === (to === 'en'));
  const path = trPath(s.id);
  const kept = (k => (k?.v === TR_V ? k : {}))(await store.json(path).catch(() => null));
  const mine = { ...(kept[to] || {}) };
  const need = make ? want.filter(t => !mine[t]) : [];
  if (need.length) {
    const people = to === 'zh-TW' ? peopleIn([s.sum, ...(s.items || []).map(it => it[1])]) : [];
    const got = await translate(env, store, need, to, { people, now, fetchImpl, max: STORY_MAX, prep: t => (to === 'en' ? withMonth(t, s.at || now) : t) });
    if (Object.keys(got).length) {
      Object.assign(mine, got);
      await store.put(path, { ...kept, v: TR_V, [to]: mine, at: now });
    }
  }
  return { tr: Object.fromEntries(want.filter(t => mine[t]).map(t => [t, mine[t]])) };
}

// A list's titles in one batch: `items` [{ id, texts }], at most BATCH_MAX stories, each its own
// story's texts as above; → every translation by its source text.
export const BATCH_MAX = 30;
export async function batchTr({ items, ...rest }) {
  const tr = {};
  for (const it of (Array.isArray(items) ? items : []).slice(0, BATCH_MAX)) {
    const r = await storyTr({ ...rest, id: String(it?.id || ''), texts: Array.isArray(it?.texts) ? it.texts.slice(0, 2) : [] });
    if (r.error === 'to') return r;
    Object.assign(tr, r.tr);
  }
  return { tr };
}
