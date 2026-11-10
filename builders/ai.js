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
//   sides    news/sides.json   { built, sides: { id: { sides: { g: { zh, en }… }, diff, m, at } } }
//            各方怎麼說: how each side's outlets framed the day's top stories.
//   sports   sports/recaps/<YYYY-MM-DD>.json  { built, games: { espnId: { line } } }
//            賽後三句話's "why" line for each finished game (builders/recaps.js).
// Lean input (Jay 11-10): code picks and trims the facts before any call.
import { aiOnce } from '../ai.js';
import { runRecaps } from './recaps.js';
import { runF1Stories } from './f1story.js';
import { sideOf } from '../kit/news-outlets.mjs';

const NEWS_LINES = 'news/lines.json';
export const WORDS_CARDS = 'private/ai/words-cards.json';
export const cardsPath = letter => `words/cards/${letter}.json`;
export const letterOf = w => (/^[a-z]/i.test(w) ? w[0].toLowerCase() : '_');
const WORDS_LIST = 'https://orbit.jaypengx.com/words/data/words.json';

// ---- News: one line and two titles a story ----
const NEWS_TOP = { tw: 15, intl: 25 };
const NEWS_BATCH = 12;
// A story as the AI is told it: its outlets' headlines (5 at most, the most
// outlets' own), each with its summary only on the first, cut short.
// A story as the AI is told it: its outlets' headlines (an outlet once,
// three at most), and the language its title is wanted in (a world story's
// in Chinese, a Taiwan story's in English). Nothing else: a title is all
// it writes (Jay 11-10: the one line under it only said the headline again).
export function storyFacts(s, region = s.region) {
  const seen = new Set();
  const heads = [];
  for (const [outlet, title] of s.items || []) {
    if (seen.has(outlet) || heads.length >= 3) continue;
    seen.add(outlet);
    heads.push(String(title).slice(0, 90));
  }
  return { id: s.id, lang: region === 'intl' ? 'zh' : 'en', heads };
}
export async function newsLines({ store, env, ctx, cap, until }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const was = (await store.json(NEWS_LINES))?.lines || {};
  const front = [...(index.tw || []).slice(0, NEWS_TOP.tw).map(x => ({ ...x, region: 'tw' })), ...(index.intl || []).slice(0, NEWS_TOP.intl).map(x => ({ ...x, region: 'intl' }))];
  const keep = {};
  const need = [];
  for (const s of front) {
    const old = was[s.id];
    // (A title once; a copy from before titles alone, with its line, made again.)
    if (old && !old.line && (old.zh || old.en)) keep[s.id] = old;
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

// ---- News: 各方怎麼說, how each side framed a story ----
// The day's top stories that sides take (politics, cross-strait, world, defence, law; both ends
// carrying it), each told once and again only when its coverage has doubled
// and 6 hours have passed (Sonnet's: kept few on purpose).
const NEWS_SIDES = 'news/sides.json';
export const SIDES_TOP = { tw: 8, intl: 4 };
const SIDES_BATCH = 4;
// (The topics sides frame: a company's revenue or a typhoon reads the same from both ends.)
const FRAMED = new Set(['pol', 'cs', 'world', 'def', 'law']);
const ENDS = { tw: ['g', 'b'], intl: ['l', 'r'] };
export const sidesWanted = (s, region) => (s.topics || []).some(t => FRAMED.has(t)) && ENDS[region].every(k => (s.sides?.[k] || 0) > 0);
// A story as the AI is told it: each side's headlines, four outlets at most a side.
export function sideFacts(s, region) {
  const sides = {};
  const seen = new Set();
  for (const [outlet, title] of s.items || []) {
    const k = sideOf(outlet, region);
    if (!k || seen.has(outlet) || (sides[k] ||= []).length >= 4) continue;
    seen.add(outlet);
    sides[k].push(String(title).slice(0, 90));
  }
  for (const k of Object.keys(sides)) if (!sides[k].length) delete sides[k];
  return { id: s.id, region, sides };
}
export async function newsSides({ store, env, ctx, cap, until, now = Date.now() }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const was = (await store.json(NEWS_SIDES))?.sides || {};
  const front = ['tw', 'intl'].flatMap(r => (index[r] || []).filter(s => sidesWanted(s, r)).slice(0, SIDES_TOP[r]).map(s => [s, r]));
  const keep = {};
  const need = [];
  for (const [s, r] of front) {
    const old = was[s.id];
    if (old && ((s.m || 0) < (old.m || 0) * 2 || now - (old.at || 0) < 6 * 3_600_000)) keep[s.id] = old;
    else need.push([s, r]);
  }
  let made = 0, calls = 0;
  const missed = [];
  for (let i = 0; i < need.length && Date.now() < until; i += SIDES_BATCH) {
    const batch = need.slice(i, i + SIDES_BATCH);
    const r = await aiOnce(env, ctx, 'news-sides', { stories: batch.map(([s, reg]) => sideFacts(s, reg)) }, cap);
    calls++;
    if (!r) break;
    // (What failed, said in the run's result: an error, or the stories its check let go.)
    if (r.error) missed.push(r.error);
    else for (const [s] of batch) if (r.out?.[s.id]) (keep[s.id] = { ...r.out[s.id], m: s.m || 0, at: now }), made++;
    else missed.push(`dropped ${s.id}`);
  }
  for (const [s] of need) if (!keep[s.id] && was[s.id]) keep[s.id] = was[s.id];
  await store.put(NEWS_SIDES, { built: now, sides: keep });
  return { made, calls, kept: Object.keys(keep).length, ...(missed.length ? { missed: missed.slice(0, 6) } : {}) };
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
  await step('sides', 'news-sides', c => newsSides({ store, env, ctx, cap: c, until, now }));
  await step('sports', 'sports-recap', c => runRecaps({ store, env, ctx, proxy, cap: c, now, until }));
  await step('f1', 'f1-story', c => runF1Stories({ store, env, ctx, proxy, cap: c, now, until }));
  await step('words', 'words-cards', c => wordsCards({ store, env, ctx, cap: c, until }));
  return out;
}
