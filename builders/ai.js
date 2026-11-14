// The family's AI made once and shared (Jay 11-10: built once, kept in R2,
// served to everyone for free after that). Run on its own even minutes
// (run.js SLOTS 'ai'), each step in turn while the run has time, each
// writing only what changed, each through the AI door's aiOnce (ai.js: the
// feature's day cap, its models in turn, every call logged):
//
//   news     news/lines.json   { built, lines: { id: { line, zh, en, m } } }
//            a story's neutral one line and its titles in both languages,
//            from its outlets' own headlines (each story once, again when
//            its title has turned, an hour on); stories gone from the front, dropped.
//   words    words/cards/<a…z>.json  { built, cards: { word: { ex: [{ en, zh }], hook, confuse } } }
//            two examples and a memory hook a word, by its first letter (a
//            word's sheet reads one small file), the whole list made once, a
//            few batches a run until done (kept whole in private/ai/words-cards.json).
//   sides    news/sides.json   { built, sides: { id: { sides: { g: { zh, en }… }, diff, m, at } } }
//            各方怎麼說: how each side's outlets framed the day's top stories.
//   brief    news/briefs.json  { built, briefs: { id: { points: [{ zh, en }], m, at } } }
//            重點整理: a story's few points in our own words, from its outlets'
//            headlines and feed summaries (Jay 11-13: reading kept in the app).
//   sport    news/sport-who.json  { built, who: { id: { p, t, zh | en, at } } }
//            Orbit News' sports stories (news/sport.json) for Orbit Sports'
//            links: the people and teams each names, in English (柯瑞 →
//            Stephen Curry; code matches them), and its title in the other
//            language; each story once (news-sport); the news build puts them in.
//   sports   sports/recaps/<YYYY-MM-DD>.json  { built, games: { espnId: { line } } }
//            賽後三句話's "why" line for each finished game (builders/recaps.js).
//   preview  sports/previews/<YYYY-MM-DD>.json  { v, built, games: { '<league>:<id>': { points, who } } }
//            賽前看點: up to two points before each game of today and tomorrow (builders/previews.js).
// Lean input (Jay 11-10): code picks and trims the facts before any call.
import { aiOnce } from '../ai.js';
import { VAGUE } from '../ai-features.js';
import { runRecaps } from './recaps.js';
import { runPreviews } from './previews.js';
import { runF1Stories } from './f1story.js';
import { runRecWeekly } from '../rec-weekly.js';
import { usage as meterUsage } from '../transit.js';
import { sideOf } from '../kit/news-outlets.mjs';
import { SPORT_PATH } from '../kit/news-sport.mjs';
import { SPORT_WHO, piecesOf } from './news.js';
import { HOOKS } from './words-hooks.mjs';
import { newsTr } from './news-tr.js';

const NEWS_LINES = 'news/lines.json';
export const WORDS_CARDS = 'private/ai/words-cards.json';
export const cardsPath = letter => `words/cards/${letter}.json`;
export const letterOf = w => (/^[a-z]/i.test(w) ? w[0].toLowerCase() : '_');
const WORDS_LIST = 'https://orbit.jaypengx.com/words/data/words.json';

// ---- News: one line and two titles a story ----
// (Every world story near the front in Chinese: Jay 11-13, an English title on a Chinese page.)
const NEWS_TOP = { tw: 15, intl: 60 };
// A title made before 11-13's rules (the event, never the topic; a foreign name
// in English unless Taiwan's press fixes one) is made again.
export const LINES_V = 3;
const NEWS_BATCH = 12;
// A title made again once the story's own title has changed, an hour after it was last made at most.
export const TITLE_AGAIN = 3_600_000;
// A story as the AI is told it: its own title (the turn it's on, 11-12: the
// newest three spoke of who comes after him, not that he'd gone), then the
// outlets' headlines nearest the rest of the story (an outlet once, three
// at most), and the language its title is wanted in (a world story's in
// Chinese, a Taiwan story's in English). Nearest, not newest (Jay 11-13:
// 「伊朗議題受關注」, from Pence's 2028 run, Mark Kelly's and an essay on
// the war beside Trump ending the Iran talks: all they shared was Iran).
// Nothing else: a title is all it writes (Jay 11-10: the one line under
// it only said the headline again).
export function storyFacts(s, region = s.region) {
  const cut = t => String(t).slice(0, 90);
  const heads = s.title ? [cut(s.title)] : [];
  const lang = region === 'intl' ? 'en' : 'zh';
  const list = (s.items || []).map(([outlet, title], i) => ({ outlet, t: cut(title), i, p: new Set(piecesOf(String(title), lang)) }));
  // (How much of each headline the others share, piece by piece.)
  for (const a of list) a.near = a.p.size ? list.reduce((n, b) => (b === a ? n : n + [...a.p].filter(x => b.p.has(x)).length / a.p.size), 0) : 0;
  const seen = new Set();
  for (const it of [...list].sort((a, b) => b.near - a.near || a.i - b.i)) {
    if (heads.includes(it.t) || seen.has(it.outlet) || heads.length >= 4) continue;
    seen.add(it.outlet);
    heads.push(it.t);
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
    // (A title once, in the language its region is asked in; a copy from before titles alone,
    // with its line, made again; so is a world story's English title from before 11-12's fix.)
    // (Again when the story has turned: its title isn't the one it was made from, an hour on
    // (11-12: 黃仁勳 resigned, his world story's Chinese title still said the board was weighing it).)
    const turned = old && old.t !== s.title && !(Date.now() - (old.at || 0) < TITLE_AGAIN);
    if (old && !old.line && old[storyFacts(s).lang] && !turned && old.v === LINES_V) keep[s.id] = old;
    else need.push(s);
  }
  let made = 0, calls = 0;
  for (let i = 0; i < need.length && Date.now() < until; i += NEWS_BATCH) {
    const batch = need.slice(i, i + NEWS_BATCH);
    // (Each story alone: map's index as `region` asked every world story in English, 11-12.)
    const r = await aiOnce(env, ctx, 'news-lines', { stories: batch.map(s => storyFacts(s)) }, cap);
    calls++;
    if (!r) break;
    if (r.error) continue;
    for (const s of batch) if (r.out[s.id]) (keep[s.id] = { ...r.out[s.id], m: s.m || 0, t: s.title, at: Date.now(), v: LINES_V }), made++;
  }
  // (An old line kept for a story still on the front that this run couldn't reach.)
  // (Never a vague one, 伊朗議題受關注: the outlets' own headline over it.)
  for (const s of need) if (!keep[s.id] && was[s.id] && !VAGUE.test(`${was[s.id].zh || ''} ${was[s.id].en || ''}`)) keep[s.id] = was[s.id];
  await store.put(NEWS_LINES, { built: Date.now(), lines: keep });
  return { made, calls, kept: Object.keys(keep).length };
}

// ---- News: the sports stories' names, for Orbit Sports' links ----
// Every story of a sport Sports shows (not the NFL's, hockey's, colleges'),
// newest first, each once; a run's batches while there's time, at most
// SPORT_RUNS (a quiet hour's few, a busy evening's many over a few runs).
const SPORT_BATCH = 15;
const SPORT_RUNS = 6;
export function sportFacts(s) {
  const seen = new Set();
  const heads = [];
  for (const [outlet, title] of [[s.by, s.title], ...(s.items || [])]) {
    const t = String(title || '').slice(0, 90);
    if (!t || heads.includes(t) || seen.has(outlet) || heads.length >= 3) continue;
    seen.add(outlet);
    heads.push(t);
  }
  return { id: s.id, want: /\p{Script=Han}/u.test(s.title) ? 'en' : 'zh', heads };
}
export async function sportWho({ store, env, ctx, cap, until }) {
  const pack = await store.json(SPORT_PATH);
  if (!pack) return { skipped: 'no sport pack' };
  const was = (await store.json(SPORT_WHO))?.who || {};
  const stories = [...(pack.tw || []), ...(pack.intl || [])].sort((a, b) => b.at - a.at);
  const keep = {};
  // (One read before `a`, the clubs it's about, 11-13: read again, the newest first.)
  for (const s of stories) if (was[s.id] && Array.isArray(was[s.id].a)) keep[s.id] = was[s.id];
  const need = stories.filter(s => !keep[s.id]);
  let made = 0, calls = 0;
  for (let i = 0; i < need.length && calls < SPORT_RUNS && Date.now() < until; i += SPORT_BATCH) {
    const batch = need.slice(i, i + SPORT_BATCH);
    const r = await aiOnce(env, ctx, 'news-sport', { stories: batch.map(sportFacts) }, cap);
    calls++;
    if (!r) break;
    if (r.error) continue;
    for (const s of batch) if (r.out[s.id]) (keep[s.id] = { ...r.out[s.id], at: Date.now() }), made++;
  }
  await store.put(SPORT_WHO, { built: Date.now(), who: keep });
  return { made, calls, kept: Object.keys(keep).length, left: need.length - made };
}

// ---- News: 各方怎麼說, how each side framed a story ----
// The day's top stories that sides take (politics, cross-strait, world, defence, law; both ends
// carrying it), each told once and again only when its coverage has doubled
// and 6 hours have passed (Sonnet's: kept few on purpose).
const NEWS_SIDES = 'news/sides.json';
export const SIDES_TOP = { tw: 8, intl: 4 };
const SIDES_BATCH = 4;
export const SIDES_RETRY = 2 * 3_600_000, SIDES_TRIES = 3;
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
  const prev = await store.json(NEWS_SIDES);
  const was = prev?.sides || {};
  // (A story no answer could be kept for is asked again only after SIDES_RETRY, SIDES_TRIES times at
  // most: before, a story the check kept dropping was asked every run, a Sonnet call each 10–20 minutes.)
  const tries = {};
  const front = ['tw', 'intl'].flatMap(r => (index[r] || []).filter(s => sidesWanted(s, r)).slice(0, SIDES_TOP[r]).map(s => [s, r]));
  const keep = {};
  const need = [];
  for (const [s, r] of front) {
    const old = was[s.id];
    const t = prev?.tries?.[s.id];
    if (t) tries[s.id] = t;
    // (One that left out a side the story has is made again, 11-13: no 偏右 though ten carried it.)
    const whole = old && Object.keys(sideFacts(s, r).sides).every(k => old.sides?.[k]);
    if (old && whole && ((s.m || 0) < (old.m || 0) * 2 || now - (old.at || 0) < 6 * 3_600_000)) keep[s.id] = old;
    else if (t && (t.n >= SIDES_TRIES || now - t.at < SIDES_RETRY) && (s.m || 0) < (t.m || 0) * 2) {
      if (whole) keep[s.id] = old;
    } else need.push([s, r]);
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
    else
      for (const [s] of batch)
        if (r.out?.[s.id]) ((keep[s.id] = { ...r.out[s.id], m: s.m || 0, at: now }), made++, delete tries[s.id]);
        else {
          missed.push(`dropped ${s.id}`);
          // (Coverage doubling since the last try starts the count again: there's more to compare.)
          const t = tries[s.id];
          tries[s.id] = { n: t && (s.m || 0) < (t.m || 0) * 2 ? t.n + 1 : 1, at: now, m: s.m || 0 };
        }
  }
  for (const [s, r] of need) if (!keep[s.id] && was[s.id] && Object.keys(sideFacts(s, r).sides).every(k => was[s.id].sides?.[k])) keep[s.id] = was[s.id];
  await store.put(NEWS_SIDES, { built: now, sides: keep, ...(Object.keys(tries).length ? { tries } : {}) });
  return { made, calls, kept: Object.keys(keep).length, ...(missed.length ? { missed: missed.slice(0, 6) } : {}) };
}

// ---- News: 重點整理, a story's points in our own words ----
// The front's biggest stories (3 outlets or more), each made once and again
// when its coverage has grown by half and 3 hours have passed. Told from
// its outlets' headlines and the summaries their feeds gave (the builder's
// 48 hours, private/news/items.json.gz); never an article.
const NEWS_BRIEFS = 'news/briefs.json';
export const BRIEFS_TOP = { tw: 24, intl: 14 };
const BRIEFS_BATCH = 4;
export const BRIEF_AGAIN = 3 * 3_600_000;
// A story as the AI is told it: its title, then an outlet's headline once
// (12 at most, nearest the story first, as storyFacts) and up to 8
// outlets' summaries, each cut short, the title's own first.
export function briefFacts(s, sums = new Map()) {
  const near = storyFacts(s, s.region || 'tw');
  const order = new Map(near.heads.map((t, i) => [t, i]));
  const seen = new Set();
  const heads = s.title ? [String(s.title).slice(0, 90)] : [];
  const said = [];
  const items = [...(s.items || [])].sort((a, b) => (order.get(String(a[1]).slice(0, 90)) ?? 99) - (order.get(String(b[1]).slice(0, 90)) ?? 99));
  for (const [outlet, title, url] of items) {
    if (seen.has(outlet)) continue;
    seen.add(outlet);
    const t = String(title).slice(0, 90);
    if (heads.length < 12 && !heads.includes(t)) heads.push(t);
    const d = sums.get(url);
    if (d && said.length < 8 && !said.includes(d)) said.push(String(d).slice(0, 280));
  }
  if (s.sum && !said.includes(s.sum)) said.unshift(String(s.sum).slice(0, 280));
  return { id: s.id, heads, sums: said.slice(0, 8) };
}
// A brief made before 11-13's kinds (what happened, background, next) is made again.
export const BRIEF_V = 3;
export const briefWanted = s => (s.n || 0) >= 3;
export async function newsBriefs({ store, env, ctx, cap, until, now = Date.now() }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const was = (await store.json(NEWS_BRIEFS))?.briefs || {};
  const front = ['tw', 'intl'].flatMap(r => (index[r] || []).filter(briefWanted).slice(0, BRIEFS_TOP[r]).map(s => ({ ...s, region: r })));
  const keep = {};
  const need = [];
  for (const s of front) {
    const old = was[s.id];
    if (old && old.v === BRIEF_V && ((s.m || 0) < (old.m || 0) * 1.5 || now - (old.at || 0) < BRIEF_AGAIN)) keep[s.id] = old;
    else need.push(s);
  }
  let made = 0, calls = 0;
  const missed = [];
  if (need.length && Date.now() < until) {
    // (Each outlet's own summary, by its link, from the builder's kept headlines.)
    const state = await store.json('private/news/items.json.gz').catch(() => null);
    const sums = new Map((state?.items || []).filter(it => it?.u && it.d).map(it => [it.u, it.d]));
    for (let i = 0; i < need.length && Date.now() < until; i += BRIEFS_BATCH) {
      const batch = need.slice(i, i + BRIEFS_BATCH);
      const r = await aiOnce(env, ctx, 'news-brief', { stories: batch.map(s => briefFacts(s, sums)) }, cap);
      calls++;
      if (!r) break;
      if (r.error) missed.push(r.error);
      else for (const s of batch) if (r.out?.[s.id]) ((keep[s.id] = { points: r.out[s.id], m: s.m || 0, at: now, v: BRIEF_V }), made++);
        else missed.push(`dropped ${s.id}`);
    }
  }
  // (An old one kept for a story still on the front that this run couldn't remake.)
  for (const s of need) if (!keep[s.id] && was[s.id]) keep[s.id] = was[s.id];
  await store.put(NEWS_BRIEFS, { built: now, briefs: keep });
  return { made, calls, kept: Object.keys(keep).length, ...(missed.length ? { missed: missed.slice(0, 6) } : {}) };
}

// ---- News: what a story's AI parts are made from, for when someone opens it ----
// (Jay 11-14: "only spend it as I use it".) No AI here: each front story's
// facts for 重點整理 and 各方怎麼說, kept in OPEN_PARTS files by its id, so
// the proxy's /ai/open (ai-open.js) reads one small file when a person opens
// the story and makes that story's part then, once, for everyone.
export const OPEN_PARTS = 16;
export function openPart(id) {
  let n = 0;
  for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n % OPEN_PARTS;
}
export const openPath = i => `private/news/open/${i}.json`;
export async function newsOpenFacts({ store }) {
  const index = await store.json('news/index.json');
  if (!index) return { skipped: 'no index' };
  const state = await store.json('private/news/items.json.gz').catch(() => null);
  const sums = new Map((state?.items || []).filter(it => it?.u && it.d).map(it => [it.u, it.d]));
  const parts = Array.from({ length: OPEN_PARTS }, () => ({}));
  let n = 0;
  for (const r of ['tw', 'intl'])
    for (const s of index[r] || []) {
      const brief = briefWanted(s) ? briefFacts({ ...s, region: r }, sums) : null;
      const sides = sidesWanted(s, r) ? sideFacts(s, r) : null;
      if (!brief && !sides) continue;
      parts[openPart(s.id)][s.id] = { m: s.m || 0, ...(brief ? { brief } : {}), ...(sides ? { sides } : {}) };
      n++;
    }
  let written = 0;
  for (let i = 0; i < OPEN_PARTS; i++) if (await store.put(openPath(i), { built: Date.now(), stories: parts[i] })) written++;
  return { stories: n, written };
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
  // (The hooks put right by hand, words-hooks.mjs: over the AI's, and the files written again when one changes.)
  let fixed = 0;
  for (const [w, hook] of Object.entries(HOOKS)) if (doc.cards[w] && doc.cards[w].hook !== hook) (doc.cards[w] = { ...doc.cards[w], hook }), fixed++;
  if (made || calls || fixed) {
    await store.put(WORDS_CARDS, { built: Date.now(), cards: doc.cards, skip: doc.skip || {} });
    // (Each letter's file, written only when it changed: store.put compares.)
    const by = {};
    for (const [w, c] of Object.entries(doc.cards)) (by[letterOf(w)] ||= {})[w] = c;
    for (const [l, cards] of Object.entries(by)) await store.put(cardsPath(l), { cards });
  }
  return { made, calls, ...(fixed ? { fixed } : {}), total: Object.keys(doc.cards).length, of: rows.length };
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
  // (Not the AI: plain translation of what the AI didn't title, Google's free month (builders/news-tr.js).)
  if (!only || only === 'tr')
    try {
      out.tr = await newsTr({ store, env, now: Date.now(), force: only === 'tr' });
    } catch (e) {
      out.tr = { failed: String(e?.message || e).slice(0, 200) };
    }
  await step('sides', 'news-sides', c => newsSides({ store, env, ctx, cap: c, until, now }));
  await step('brief', 'news-brief', c => newsBriefs({ store, env, ctx, cap: c, until, now }));
  if (!only || only === 'open')
    try {
      out.open = await newsOpenFacts({ store });
    } catch (e) {
      out.open = { failed: String(e?.message || e).slice(0, 200) };
    }
  await step('sport', 'news-sport', c => sportWho({ store, env, ctx, cap: c, until }));
  await step('sports', 'sports-recap', c => runRecaps({ store, env, ctx, proxy, cap: c, now, until }));
  await step('preview', 'sports-preview', c => runPreviews({ store, env, ctx, proxy, cap: c, now, until }));
  await step('f1', 'f1-story', c => runF1Stories({ store, env, ctx, proxy, cap: c, now, until }));
  await step('words', 'words-cards', c => wordsCards({ store, env, ctx, cap: c, until }));
  // (除錯紀錄週報: Mondays from 06:00 Taiwan, once a week; `ai-weekly` by hand makes it now.)
  await step('weekly', 'rec-weekly', c => runRecWeekly({ store, env, ctx, cap: c, now, aiOnce, usage: () => meterUsage(env, now), force: only === 'weekly' }));
  return out;
}
