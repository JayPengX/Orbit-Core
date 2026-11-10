// The family's AI made once and shared (Jay 11-10: built once, kept in R2,
// served to everyone for free after that). Run on its own even minutes
// (run.js SLOTS 'ai'), each step in turn while the run has time, each
// writing only what changed, each through the AI door's aiOnce (ai.js: the
// feature's day cap, its models in turn, every call logged):
//
//   news     news/lines.json   { built, lines: { id: { line, zh, en, m } } }
//            a story's neutral one line and its titles in both languages,
//            from its outlets' own headlines (each story once, again when
//            its coverage has doubled); stories gone from the front, dropped.
//   words    words/cards/<a…z>.json  { built, cards: { word: { ex: [{ en, zh }], hook, confuse } } }
//            two examples and a memory hook a word, by its first letter (a
//            word's sheet reads one small file), the whole list made once, a
//            few batches a run until done (kept whole in private/ai/words-cards.json).
//   sports   sports/recaps/<YYYY-MM-DD>.json  { built, games: { espnId: { line } } }
//            賽後三句話's "why" line for each finished game (builders/recaps.js).
// Lean input (Jay 11-10): code picks and trims the facts before any call.
import { aiOnce } from '../ai.js';
import { runRecaps } from './recaps.js';

const NEWS_LINES = 'news/lines.json';
export const WORDS_CARDS = 'private/ai/words-cards.json';
export const cardsPath = letter => `words/cards/${letter}.json`;
export const letterOf = w => (/^[a-z]/i.test(w) ? w[0].toLowerCase() : '_');
const WORDS_LIST = 'https://orbit.jaypengx.com/words/data/words.json';

// ---- News: one line and two titles a story ----
const NEWS_TOP = { tw: 40, intl: 25 };
const NEWS_BATCH = 8;
// A story as the AI is told it: its outlets' headlines (5 at most, the most
// outlets' own), each with its summary only on the first, cut short.
export function storyFacts(s) {
  const seen = new Set();
  const heads = [];
  for (const [outlet, title] of s.items || []) {
    if (seen.has(outlet) || heads.length >= 5) continue;
    seen.add(outlet);
    heads.push({ outlet, title: String(title).slice(0, 90) });
  }
  if (s.sum) heads[0] = { ...heads[0], sum: String(s.sum).slice(0, 120) };
  return { id: s.id, heads };
}
export async function newsLines({ store, env, ctx, cap, until }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const was = (await store.json(NEWS_LINES))?.lines || {};
  const front = [...(index.tw || []).slice(0, NEWS_TOP.tw), ...(index.intl || []).slice(0, NEWS_TOP.intl)];
  const keep = {};
  const need = [];
  for (const s of front) {
    const old = was[s.id];
    if (old && (s.m || 0) < (old.m || 0) * 2) keep[s.id] = old;
    else need.push(s);
  }
  let made = 0, calls = 0;
  for (let i = 0; i < need.length && Date.now() < until; i += NEWS_BATCH) {
    const batch = need.slice(i, i + NEWS_BATCH);
    const r = await aiOnce(env, ctx, 'news-lines', { stories: batch.map(storyFacts) }, cap);
    calls++;
    if (!r) break;
    if (r.error) continue;
    for (const s of batch) if (r.out[s.id]) (keep[s.id] = { ...r.out[s.id], m: s.m || 0 }), made++;
  }
  // (An old line kept for a story still on the front that this run couldn't reach.)
  for (const s of need) if (!keep[s.id] && was[s.id]) keep[s.id] = was[s.id];
  await store.put(NEWS_LINES, { built: Date.now(), lines: keep });
  return { made, calls, kept: Object.keys(keep).length };
}

// ---- Words: the list's study cards, made once ----
const WORDS_BATCH = 25;
export async function wordsCards({ store, env, ctx, cap, until, fetchImpl = fetch }) {
  const doc = (await store.json(WORDS_CARDS)) || { cards: {}, skip: {} };
  const res = await fetchImpl(WORDS_LIST).catch(() => null);
  if (!res?.ok) return { skipped: 'no list' };
  // words.json rows: [word, pos, level, zh, kk]; the first sense's Chinese is what's asked.
  const rows = await res.json();
  const left = rows.filter(r => !doc.cards[r[0]] && !(doc.skip?.[r[0]] >= 2));
  let calls = 0, made = 0;
  for (let i = 0; i < left.length && Date.now() < until; i += WORDS_BATCH) {
    const batch = left.slice(i, i + WORDS_BATCH).map(r => ({ w: r[0], zh: String(r[3]).split('\n')[0].slice(0, 40) }));
    const r = await aiOnce(env, ctx, 'words-cards', { words: batch }, cap);
    calls++;
    if (!r) break;
    // (Every model answered, none usable: each word counts a miss; a failed call doesn't.)
    if (r.error && !/nothing usable/.test(r.error)) continue;
    for (const w of batch) {
      if (r.error) {
        (doc.skip ||= {})[w.w] = (doc.skip[w.w] || 0) + 1;
        continue;
      }
      if (r.out[w.w]) (doc.cards[w.w] = r.out[w.w]), made++;
      else (doc.skip ||= {})[w.w] = (doc.skip[w.w] || 0) + 1;
    }
  }
  if (made || calls) {
    await store.put(WORDS_CARDS, { built: Date.now(), cards: doc.cards, skip: doc.skip || {} });
    // (Each letter's file, written only when it changed: store.put compares.)
    const by = {};
    for (const [w, c] of Object.entries(doc.cards)) (by[letterOf(w)] ||= {})[w] = c;
    for (const [l, cards] of Object.entries(by)) await store.put(cardsPath(l), { cards });
  }
  return { made, calls, total: Object.keys(doc.cards).length, of: rows.length };
}

// The 'ai' run: each step while there's time (5 minutes of the run's 8).
export async function runAi({ store, env, proxy, now = Date.now(), cap = async () => 0, ctx = null, only = null }) {
  const until = now + 5 * 60_000;
  const out = {};
  const step = async (name, feature, fn) => {
    if (only && only !== name) return;
    if (Date.now() >= until) return void (out[name] = { later: true });
    try {
      out[name] = await fn(await cap(feature));
    } catch (e) {
      out[name] = { failed: String(e?.message || e).slice(0, 200) };
    }
  };
  await step('news', 'news-lines', c => newsLines({ store, env, ctx, cap: c, until }));
  await step('sports', 'sports-recap', c => runRecaps({ store, env, ctx, proxy, cap: c, now, until }));
  await step('words', 'words-cards', c => wordsCards({ store, env, ctx, cap: c, until }));
  return out;
}
