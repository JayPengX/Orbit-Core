// How often each app's picks are what the person opens, replayed day by day
// on real data (Sports: the season packs' real games; Securities: the real
// catalog; Law: the real list of laws and their rulings; Beats: the real
// grooves and radio) with made-up people (never anyone's real use), each with
// tastes the app isn't told. Each day the app's own ranking code picks, the
// person opens what they like among what's on screen (the first more than the
// last) and now and then finds one elsewhere, and the app learns as it does on
// a phone (the kit's feedback.mjs and affinity, wired as the app wires them).
//
//   node tools/picks-backtest.mjs [sports stock law beats] [--root <dir>] [--seeds 5] [--why]
//
// `--root`: the folder holding the Orbit-Core and Orbit-<App> checkouts to
// measure (default: the ones beside this one). For before and after, run it
// once on a checkout of main (a git worktree) and once here.
//
// What's said for each person, over the first week and the rest:
//   opened   the share of picks on screen the person opened (higher: fewer wasted places)
//   best     how near the picks came to the ones the person would most have
//            opened that day (their chances added up, against the best possible)
//   first    the chance the first pick was opened (the hero, the first card)
//   wrong 常看 (Sports): picks tagged as a habit of theirs the person had
//            less than an even chance of opening
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const ROOT = resolve(opt('--root', new URL('../..', import.meta.url).pathname));
const SEEDS = Array.from({ length: Number(opt('--seeds', 5)) }, (_, i) => [7, 11, 23, 42, 99, 3, 5, 13, 17, 19][i] || i + 1);
const DATA = opt('--data', '/tmp/orbit-seasons');
const asked = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const mod = p => import(pathToFileURL(resolve(ROOT, p)).href);

// A page's storage, in memory (the kit reads localStorage).
const mem = new Map();
const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; }, clear: () => mem.clear() };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;

const DAY = 86_400_000;
const H = 3_600_000;
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const sig = x => 1 / (1 + Math.exp(-x));
// The chance an item at place i of a list is looked at (the first nearly always).
const LOOK = i => 1 / (1 + 0.25 * i);
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%`.padStart(4) : '   –');

// One tally: picks shown and opened; the chances the picks had against the best possible; the first pick's.
const tally = () => ({ shown: 0, opened: 0, got: 0, best: 0, days: 0, first: 0, wrong: 0, tagged: 0 });
const add = (a, b) => Object.keys(a).forEach(k => (a[k] += b[k] || 0));
function line(name, parts) {
  const cell = t => `opened ${pct(t.opened, t.shown)} · best ${pct(t.got, t.best)} · first ${pct(t.first, t.days)}${t.tagged ? ` · wrong 常看 ${t.wrong}/${t.tagged}` : ''}`;
  return `  ${name.padEnd(16)} week 1: ${cell(parts.week1)}  |  after: ${cell(parts.after)}`;
}

// ---- Sports: 首頁's 推薦 (Orbit-Sports lib/picks.mjs dayPlan) ---------------------------

const SPORTS_LEAGUES = ['epl', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'uel', 'mls', 'nba', 'mlb'];
async function seasons(parseScoreboard) {
  mkdirSync(DATA, { recursive: true });
  const out = [];
  for (const l of SPORTS_LEAGUES) {
    const file = `${DATA}/${l}.json`;
    if (!existsSync(file)) {
      const r = await fetch(`https://api.jaypengx.com/data/sports/${l}/2026.json`, { headers: { Origin: 'http://localhost:8123' } });
      writeFileSync(file, await r.text());
    }
    out.push(...parseScoreboard(JSON.parse(readFileSync(file, 'utf8')), l, { lang: 'zh' }).filter(e => e.kind === 'match' && !e.status?.void && e.home?.id && e.away?.id));
  }
  return out;
}
// The tables as they stood before a moment, from the results: { league: { teamId: { pos, n, gp } } }.
function tablesBefore(games, t) {
  const by = {};
  for (const e of games) {
    if (e.status?.state !== 'post' || Date.parse(e.start) >= t || Date.parse(e.start) < t - 120 * DAY) continue;
    const L = (by[e.league] ||= {});
    const [h, a] = [Number(e.home.score), Number(e.away.score)];
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    for (const [s, f, ag] of [[e.home, h, a], [e.away, a, h]]) {
      const r = (L[s.id] ||= { pts: 0, gp: 0, gd: 0 });
      r.gp++;
      r.gd += f - ag;
      r.pts += f > ag ? 3 : f === ag ? 1 : 0;
    }
  }
  const out = {};
  for (const [l, L] of Object.entries(by)) {
    const rows = Object.entries(L).sort((x, y) => y[1].pts / y[1].gp - x[1].pts / x[1].gp || y[1].gd - x[1].gd);
    out[l] = Object.fromEntries(rows.map(([id, r], i) => [id, { pos: i + 1, n: rows.length, gp: r.gp }]));
  }
  return out;
}
// The people: what the app is told (leagues, follows) and what it isn't (`like`: key → log-odds).
const SPORTS_PEOPLE = {
  // Jay's own way (2026-10-23): leagues as ELTA airs them, a game picked, no team followed; but some clubs pull.
  'league watcher': {
    leagues: ['epl', 'ucl', 'nba', 'mlb'],
    follows: [],
    like: { 'league:epl': 0.8, 'league:ucl': 0.8, 'league:nba': 0.2, 'league:mlb': -0.6, 'team:epl:manchester united': 1.6, 'team:epl:liverpool': 1.2, 'team:ucl:real madrid': 1.2, 'team:nba:los angeles lakers': 1.4, 'team:nba:golden state warriors': 1.0 }
  },
  // Two teams followed, and a soft spot for the big games of the leagues that come with them.
  'team fan': {
    leagues: ['epl', 'mlb'],
    follows: [{ league: 'epl', name: 'Arsenal' }, { league: 'mlb', name: 'Los Angeles Dodgers' }],
    like: { 'league:epl': 0.2, 'league:mlb': -1, 'team:epl:arsenal': 3, 'team:mlb:los angeles dodgers': 3, 'team:epl:chelsea': 0.8, 'team:epl:manchester city': 0.8 }
  },
  // Many leagues ticked once, a few really watched: the plan has to learn which.
  'broad follower': {
    leagues: ['epl', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'uel', 'mls', 'nba', 'mlb'],
    follows: [],
    like: { 'league:epl': 0.6, 'league:seriea': 0.5, 'league:ucl': 0.8, 'league:bundesliga': -1, 'league:ligue1': -1.2, 'league:uel': -0.8, 'league:mls': -1.5, 'league:nba': 0.3, 'league:mlb': -1, 'team:seriea:internazionale': 1, 'team:seriea:ac milan': 1 }
  }
};
async function sports() {
  const kit = await mod('Orbit-Core/kit/orbit.mjs');
  const F = await mod('Orbit-Core/kit/feedback.mjs');
  const P = await mod('Orbit-Sports/public/lib/picks.mjs');
  const { eventKeys, teamKey } = await mod('Orbit-Sports/public/lib/foryou.mjs');
  const { parseScoreboard } = await mod('Orbit-Core/kit/sports-espn.mjs');
  const v2 = typeof F.scorer === 'function';
  const games = await seasons(parseScoreboard);
  const from = Date.parse('2026-09-12T05:00:00+08:00');
  const to = Date.parse('2026-11-02T05:00:00+08:00');
  const twHour = ms => new Date(ms + 8 * H).getUTCHours();
  console.log(`\nSports 首頁 推薦 (${v2 ? 'the new engine' : "main's"}; real games ${new Date(from).toISOString().slice(0, 10)} to ${new Date(to - DAY).toISOString().slice(0, 10)}, ${SEEDS.length} runs)`);
  for (const [who, p] of Object.entries(SPORTS_PEOPLE)) {
    const parts = { week1: tally(), after: tally() };
    for (const seed of SEEDS) {
      mem.clear();
      F.useStore?.(storage);
      const r = rng(seed);
      const follows = p.follows.map(f => {
        const e = games.find(g => g.league === f.league && [g.home, g.away].some(s => s.en === f.name));
        const side = [e?.home, e?.away].find(s => s?.en === f.name);
        return { league: f.league, id: side?.id, name: f.name };
      });
      // What the app records when the person sets it up.
      for (const l of p.leagues) kit.recordAffinity('match', [`league:${l}`], 2, from - DAY);
      for (const f of follows) kit.recordAffinity('match', [teamKey(f.league, f.name), `league:${f.league}`], 4, from - DAY);
      const own = new Set([...p.leagues, ...follows.map(f => f.league)]);
      const likeOf = e => {
        const ks = eventKeys(e);
        let u = -1.2 + ks.reduce((s, k) => s + (p.like[k] || 0), 0);
        if (P.bigGame(e)) u += 0.6;
        u += 0.3 * [e.home, e.away].filter(s => P.bigClub(e.league, s)).length;
        const hr = twHour(Date.parse(e.start));
        if (hr >= 1 && hr < 7) u -= 2.5;
        return u;
      };
      for (let t = from, d = 0; t < to; t += DAY, d++) {
        const now = t + 13 * H; // 18:00 in Taiwan
        const day = games.filter(e => own.has(e.league) && Date.parse(e.start) >= t && Date.parse(e.start) < t + DAY);
        if (!day.length) continue;
        const tables = tablesBefore(games, t);
        const pre = day.map(e => ({ ...e, status: { ...e.status, state: 'pre' }, home: { ...e.home, score: '' }, away: { ...e.away, score: '' } }));
        const watched = P.watchedLeagues(p.leagues, follows);
        const base = { leagues: p.leagues, follows, games: [], tables, now };
        const pctx = v2 ? { ...base, personal: F.scorer('match', now, { explore: Number(opt('--explore', 0)) }), why: F.whyOf('match', now, P.HABIT) } : { ...base, aff: kit.affinity(null, now, ['match']), lift: F.lifter('match', now) };
        const chosen = P.leagueChoices(pre, { watched, awake: e => twHour(Date.parse(e.start)) >= 5, ctx: pctx });
        const plan = P.dayPlan(pre, { ...pctx, chosen }, { n: 6 }).plan;
        const item = e => ({ id: `${e.league}:${e.id}`, keys: eventKeys(e) });
        F.shown('match', plan.map(x => item(x.event)), now);
        const part = d < 7 ? parts.week1 : parts.after;
        const wanted = pre.filter(e => sig(likeOf(e)) >= 0.5);
        const inPlan = new Set(plan.map(x => `${x.event.league}:${x.event.id}`));
        part.shown += plan.length;
        part.days++;
        part.got += plan.reduce((s, x) => s + sig(likeOf(x.event)), 0);
        part.best += pre.map(e => sig(likeOf(e))).sort((a, b) => b - a).slice(0, plan.length).reduce((s, x) => s + x, 0);
        const top = [...plan].sort((x, y) => y.score - x.score)[0];
        if (top) part.first += sig(likeOf(top.event));
        if (args.includes('--why') && seed === SEEDS[0] && d % 6 === 0) console.log(`    ${who} ${new Date(now).toISOString().slice(0, 10)}: ${plan.map(x => `${x === top ? '★' : ''}${x.event.away.en} @ ${x.event.home.en} ${x.score} [${x.reasons.join(',')}] want ${sig(likeOf(x.event)).toFixed(2)}`).join(' | ')}`);
        for (const x of plan) {
          if (!x.reasons.includes('habit')) continue;
          part.tagged++;
          if (sig(likeOf(x.event)) < 0.5) {
            part.wrong++;
            if (args.includes('--tags') && v2) console.log(`    wrong 常看 ${who}: ${x.event.away.en} @ ${x.event.home.en} for ${pctx.why({ id: `${x.event.league}:${x.event.id}`, keys: eventKeys(x.event) })} want ${sig(likeOf(x.event)).toFixed(2)}`);
          }
        }
        let k = 0;
        const open = (e, fromList) => {
          const at = now + ++k * 60_000;
          kit.recordAffinity('match', eventKeys(e), 1, at);
          if (v2) F.picked('match', item(e), at, { from: fromList ? 'list' : 'elsewhere' });
          else if (fromList) F.picked('match', item(e), at);
        };
        plan.forEach((x, i) => {
          if (r() < LOOK(i) * sig(likeOf(x.event))) (part.opened++, open(x.event, true));
        });
        // A game wanted and not among the picks: sometimes found in 賽事.
        for (const e of wanted) if (!inPlan.has(`${e.league}:${e.id}`) && r() < 0.3) open(e, false);
      }
    }
    console.log(line(who, parts));
    if (args.includes('--weights') && v2) {
      const sc = F.scorer('match', to);
      console.log('    ' + ['league:epl', 'league:mlb', 'league:nba', 'league:ucl', 'league:mls', 'league:ligue1', 'sport:soccer', 'sport:baseball', 'sport:basketball', 'team:epl:manchester united', 'team:nba:los angeles lakers', 'team:epl:arsenal'].map(k => `${k} ${sc({ keys: [k] }).toFixed(2)}`).join(' · '));
      console.log('    hits', JSON.stringify(F.hitRate('match', to)));
    }
  }
}

// ---- Securities: 首頁's 為你推薦 (Orbit-Securities lib/foryou.mjs forYou) -----------------

// The kind of thing each list holds (the quotes' kind, as the app gets it).
const KIND = { tw: 'stock', twetf: 'etf', us: 'stock', usetf: 'etf', govbond: 'govbond', bond: 'bond', crypto: 'crypto', fx: 'fx', metal: 'metal', jp: 'stock', hk: 'stock', kr: 'stock', eu: 'stock', fund: 'fund', fut: 'fut', ssf: 'fut', etffut: 'fut', other: 'stock', index: 'index' };
const STOCK_PEOPLE = {
  // Holds two high-dividend ETFs; looks at Taiwan's ETFs, never at crypto or abroad.
  'dividend saver': { held: ['0056.TW', '00878.TW'], like: { 'cat:twetf': 1.4, 'kind:etf': 0.5, 'sym:00919.TW': 1, 'sym:00929.TW': 1, 'sym:0050.TW': 0.8, 'sym:00713.TW': 0.8, 'cat:tw': 0.3, 'mkt:US': -1, 'kind:crypto': -2.5, 'cat:jp': -1, 'cat:hk': -1, 'cat:kr': -1, 'cat:eu': -1 } },
  // Holds NVIDIA; America's big tech and its ETFs, not Taiwan's lists, bonds or gold.
  'US tech': { held: ['NVDA'], like: { 'cat:us': 1.3, 'sym:AAPL': 0.8, 'sym:MSFT': 0.8, 'sym:GOOGL': 0.8, 'sym:AMZN': 0.8, 'sym:META': 0.8, 'sym:TSM': 1, 'sym:AMD': 1.2, 'cat:usetf': 0.5, 'sym:QQQ': 1, 'mkt:TW': -0.8, 'kind:bond': -1.2, 'kind:metal': -1, 'kind:crypto': -0.5 } },
  // Holds bitcoin; coins and gold, nothing else much.
  'crypto and gold': { held: ['BTC-USD'], like: { 'kind:crypto': 1.9, 'kind:metal': 1.3, 'kind:etf': -0.8, 'kind:bond': -1.5, 'mkt:TW': -0.6, 'cat:us': -0.3 } }
};
async function stock() {
  const kit = await mod('Orbit-Core/kit/orbit.mjs');
  const F = await mod('Orbit-Core/kit/feedback.mjs');
  const FY = await mod('Orbit-Securities/public/lib/foryou.mjs');
  const { CATEGORIES, catalogInfo } = await mod('Orbit-Securities/public/lib/catalog.mjs');
  const { marketOf } = await mod('Orbit-Core/kit/stock-markets.mjs');
  const v2 = typeof F.scorer === 'function';
  const from = Date.parse('2026-09-15T09:00:00+08:00');
  const days = 42;
  const symbols = [...new Set(CATEGORIES.flatMap(c => c.items.map(i => i[0])))].filter(sym => !/^\^|=F$/.test(sym));
  console.log(`\nSecurities 首頁 為你推薦 (${v2 ? 'the new engine' : "main's"}; the real catalog, ${symbols.length} things, ${days} days, ${SEEDS.length} runs; the first 4 on screen)`);
  const keysOf = (sym, q) => [`sym:${sym}`, catalogInfo(sym)?.category ? `cat:${catalogInfo(sym).category}` : null, q?.kind ? `kind:${q.kind}` : null, q?.market ? `mkt:${q.market}` : null].filter(Boolean);
  for (const [who, p] of Object.entries(STOCK_PEOPLE)) {
    const parts = { week1: tally(), after: tally() };
    for (const seed of SEEDS) {
      mem.clear();
      F.useStore?.(storage);
      const r = rng(seed);
      const watched = [];
      const held = [...p.held];
      const like = (sym, q) => -2.2 + keysOf(sym, q).reduce((s, k) => s + (p.like[k] || 0), 0) + (Math.abs(q?.pct || 0) > 0.03 ? 0.4 : 0);
      // What the app records for what they hold (bought before: a trade counts 2).
      for (let d = 0; d < days; d++) {
        const now = from + d * DAY;
        const quotes = new Map();
        for (const sym of symbols) {
          const cat = catalogInfo(sym)?.category;
          const kind = KIND[cat] || 'stock';
          const z = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
          quotes.set(sym, { symbol: sym, kind, market: marketOf(sym, kind), pct: z * (kind === 'crypto' ? 0.03 : 0.012), price: 100 });
        }
        if (d === 0) for (const sym of held) kit.recordAffinity('stock', keysOf(sym, quotes.get(sym)), 2, now - DAY);
        if (d === 0 && v2) for (const sym of held) F.did('stock', keysOf(sym, quotes.get(sym)), 2, now - DAY);
        const aff = kit.affinity(null, now);
        const lift = v2 ? F.lifter('stock', now, { explore: Number(opt('--explore', 0)) }) : F.lifter('stock', now);
        const recs = FY.forYou({ quotes, held, watched, wallet: null, aff, n: 10, now, lift });
        const shown = recs.slice(0, 4);
        F.shown('stock', shown, now);
        if (args.includes('--why') && seed === SEEDS[0] && d % 7 === 6) console.log(`    ${who} day ${d + 1}: ${recs.slice(0, 6).map(x => `${x.symbol} ${x.why?.key || ''} ${sig(like(x.symbol, quotes.get(x.symbol))).toFixed(2)}`).join(' | ')}`);
        const part = d < 7 ? parts.week1 : parts.after;
        const own = new Set([...held, ...watched]);
        const pool = symbols.filter(sym => !own.has(sym) && quotes.get(sym) && !['fx', 'index'].includes(quotes.get(sym).kind) && !['fut', 'ssf', 'etffut', 'fund', 'govbond'].includes(catalogInfo(sym)?.category));
        part.days++;
        part.shown += shown.length;
        part.got += shown.reduce((s, x) => s + sig(like(x.symbol, quotes.get(x.symbol))), 0);
        part.best += pool.map(sym => sig(like(sym, quotes.get(sym)))).sort((a, b) => b - a).slice(0, shown.length).reduce((s, x) => s + x, 0);
        if (shown[0]) part.first += sig(like(shown[0].symbol, quotes.get(shown[0].symbol)));
        let k = 0;
        const open = (sym, fromList) => {
          const at = now + ++k * 60_000;
          const keys = keysOf(sym, quotes.get(sym));
          kit.recordAffinity('stock', keys, 1, at);
          if (v2) F.picked('stock', { id: `stock:${sym}`, keys }, at, { from: fromList ? 'list' : 'elsewhere' });
          else if (fromList) F.picked('stock', recs.find(x => x.symbol === sym), at);
          // Now and then put on the watchlist (it leaves the picks).
          if (r() < 0.2) {
            watched.push(sym);
            kit.recordAffinity('stock', keys, 2, at);
            if (v2) F.did('stock', keys, 1.5, at);
          }
        };
        shown.forEach((x, i) => {
          if (r() < LOOK(i) * sig(like(x.symbol, quotes.get(x.symbol)))) (part.opened++, open(x.symbol, true));
        });
        // Browsing 市場: a list they like, a thing or two from it.
        if (r() < 0.6) {
          const cats = CATEGORIES.filter(c => !['fx', 'index', 'fut', 'ssf', 'etffut', 'fund', 'govbond'].includes(c.id));
          const w = cats.map(c => Math.exp(p.like[`cat:${c.id}`] || 0) * Math.exp(p.like[`kind:${KIND[c.id]}`] || 0));
          let x = r() * w.reduce((a, b) => a + b, 0);
          const cat = cats.find((c, i) => (x -= w[i]) < 0) || cats[0];
          for (const [sym] of cat.items.slice(0, 12)) if (!own.has(sym) && r() < 0.15 * sig(like(sym, quotes.get(sym)))) open(sym, false);
        }
      }
    }
    console.log(line(who, parts));
  }
}

// ---- Law: 首頁's 為你推薦 (Orbit-Law lib/foryou.mjs; before it, app.mjs recommend) ----------

const LAW_PEOPLE = {
  // A worker reading up on their rights: work first, then welfare and health.
  worker: { like: { labor: 2.2, welfare: 1, health: 0.6, justice: -0.3, gov: -1.2, defense: -1.5, farm: -1.5 } },
  // A driver who rents: transport and housing, the civil code now and then.
  'driver, renter': { like: { traffic: 2.2, home: 1.4, justice: 0.3, gov: -1, defense: -1.5, farm: -1.5, edu: -0.8 } },
  // A new parent: welfare, health, leave from work, schools.
  'new parent': { like: { welfare: 2.2, health: 1.4, labor: 0.6, edu: 0.8, gov: -1, defense: -1.5, money: -0.5 } }
};
async function law() {
  const F = await mod('Orbit-Core/kit/feedback.mjs');
  const { topicOf } = await mod('Orbit-Law/public/lib/topics.mjs');
  const FY = existsSync(resolve(ROOT, 'Orbit-Law/public/lib/foryou.mjs')) ? await mod('Orbit-Law/public/lib/foryou.mjs') : null;
  const get = async (path, file) => {
    if (!existsSync(file)) writeFileSync(file, await (await fetch(`https://orbit.jaypengx.com/law/data/${path}`)).text());
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  mkdirSync(DATA, { recursive: true });
  const rows = (await get('index.json', `${DATA}/law-index.json`)).laws;
  const rulings = await get('rulings/laws.json', `${DATA}/law-rulings.json`);
  const byCode = new Map(rows.map(r => [r[0], r]));
  const topicMemo = new Map();
  const tOf = r => topicMemo.get(r[0]) ?? (topicMemo.set(r[0], topicOf(r[1], r[3])), topicMemo.get(r[0]));
  // main's app.mjs recommend(recent), as it was.
  const COMMON = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '勞動基準法', '道路交通管理處罰條例', '個人資料保護法', '消費者保護法'];
  const before = (recent, starred) => {
    const seen = new Set(recent.map(r => r[0]));
    const topics = new Set([...recent, ...starred].map(tOf));
    const pool = topics.size ? rows.filter(r => r[2] !== '命令' && !r[5] && topics.has(tOf(r)) && !seen.has(r[0])).sort((a, b) => (rulings[b[0]] || 0) - (rulings[a[0]] || 0) || (a[4] < b[4] ? 1 : -1)) : [];
    const common = COMMON.map(n => rows.find(r => r[1] === n)).filter(r => r && !seen.has(r[0]));
    const mine = pool.slice(0, 4), other = common.filter(r => !topics.has(tOf(r)));
    const out = [];
    for (let i = 0; out.length < 8 && (i < mine.length || i < other.length); i++) out.push(...[mine[i], other[i]].filter(Boolean));
    return [...new Set([...out, ...common])].slice(0, 8);
  };
  const most = Math.log1p(Math.max(...Object.values(rulings)));
  const days = 42;
  const from = Date.parse('2026-09-15T20:00:00+08:00');
  const pool = rows.filter(r => r[2] !== '命令' && !r[5]);
  console.log(`\nLaw 首頁 為你推薦 (${FY ? 'the new engine' : "main's"}; the real ${pool.length} laws and their rulings, ${days} days, ${SEEDS.length} runs; the first 3 on screen)`);
  for (const [who, p] of Object.entries(LAW_PEOPLE)) {
    const parts = { week1: tally(), after: tally() };
    const like = r => -2.4 + (p.like[tOf(r)] || 0) + (0.8 * Math.log1p(rulings[r[0]] || 0)) / most;
    for (const seed of SEEDS) {
      mem.clear();
      F.useStore?.(storage);
      const r = rng(seed);
      const recent = [];
      const starred = [];
      for (let d = 0; d < days; d++) {
        const now = from + d * DAY;
        const rec = recent.map(c => byCode.get(c)).filter(Boolean).slice(0, 8);
        const st = starred.map(c => byCode.get(c));
        const list = FY ? FY.forYou({ rows, recent: rec, starred: st, rulings, topicOf: tOf, lift: F.lifter('law', now), now }) : before(rec, st);
        const shown = list.slice(0, 3);
        const item = row => ({ id: `law:${row[0]}`, keys: [`topic:${tOf(row)}`] });
        F.shown('law', shown.map(item), now);
        const part = d < 7 ? parts.week1 : parts.after;
        const seen = new Set(rec.map(x => x[0]));
        part.days++;
        part.shown += shown.length;
        part.got += shown.reduce((s, x) => s + sig(like(x)), 0);
        part.best += pool.filter(x => !seen.has(x[0])).map(x => sig(like(x))).sort((a, b) => b - a).slice(0, shown.length).reduce((s, x) => s + x, 0);
        if (shown[0]) part.first += sig(like(shown[0]));
        let k = 0;
        const read = (row, fromList) => {
          const at = now + ++k * 60_000;
          recent.splice(0, recent.length, ...[row[0], ...recent.filter(c => c !== row[0])].slice(0, 12));
          if (FY) F.picked('law', item(row), at, { from: fromList ? 'list' : 'elsewhere' });
          if (r() < 0.15 && !starred.includes(row[0])) {
            starred.push(row[0]);
            if (FY) F.did('law', item(row).keys, 1.5, at);
          }
        };
        shown.forEach((x, i) => {
          if (r() < LOOK(i) * sig(like(x))) (part.opened++, read(x, true));
        });
        // Looked up by a search: a law of a subject they care about.
        if (r() < 0.5) {
          const w = pool.map(x => Math.exp(2 * like(x)));
          let x = r() * w.reduce((a, b) => a + b, 0);
          read(pool.find((_, i) => (x -= w[i]) < 0) || pool[0], false);
        }
      }
    }
    console.log(line(who, parts));
  }
}

// ---- Beats: 為你電台 and 為你推薦 (Orbit-Beats lib/stations.mjs, lib/listen.mjs) -----------

const BEATS_PEOPLE = {
  // Studies to lo-fi, jazz and city pop; anything hard or fast is skipped.
  'study listener': { like: { lofi: 2.2, jazz: 1.6, citypop: 1.4, bossa: 1.2, ambient: 1, neosoul: 0.8, trap: -2, drill: -2, hardstyle: -2.5, dubstep: -2, phonk: -1.5, metal: -2, techno: -1 } },
  // Dances: house and its family, Afro and Latin grooves; ballads skipped.
  dancer: { like: { house: 2, garage: 1.4, amapiano: 1.6, afro: 1.4, baile: 1, disco: 1.2, techno: 1, salsa: 0.8, ballad: -2, ambient: -2, cinematic: -1.5, country: -1.5, blues: -1, gospel: -1 } },
  // Hip-hop head: boom bap, trap and phonk; little else.
  'hip-hop head': { like: { hiphop: 2, boombap: 2, trap: 1.6, phonk: 1.2, drill: 1, kpop: 0.6, bossa: -1.5, country: -2, ambient: -1.5, ballad: -1.5, chinese: -1 } }
};
async function beats() {
  const F = await mod('Orbit-Core/kit/feedback.mjs');
  const L = await mod('Orbit-Beats/public/lib/listen.mjs');
  const S = await mod('Orbit-Beats/public/lib/stations.mjs');
  const R = await mod('Orbit-Beats/public/lib/radio.mjs');
  const { STYLE_ORDER } = await mod('Orbit-Beats/public/lib/names.mjs');
  const v2 = typeof L.tasteFrom === 'function';
  const days = 28;
  const from = Date.parse('2026-10-01T20:00:00+08:00');
  console.log(`\nBeats 為你電台 (${v2 ? 'the new engine' : "main's"}; the real ${STYLE_ORDER.length} grooves and radio, ${days} days, ${SEEDS.length} runs: 6 songs a day on 為你電台, 3 on 隨機電台)`);
  console.log("  (opened: songs heard through; best: the station's grooves against the 4 the person likes most; first: 為你推薦's first groove)");
  for (const [who, p] of Object.entries(BEATS_PEOPLE)) {
    const parts = { week1: tally(), after: tally() };
    const like = st => -0.6 + (p.like[st] || 0);
    for (const seed of SEEDS) {
      mem.clear();
      F.useStore?.(storage);
      const r = rng(seed);
      let listened = {};
      const kept = {};
      for (let d = 0; d < days; d++) {
        const now = from + d * DAY;
        const weightOf = (opts = {}) => {
          const sc = F.scorer?.('beats', now, opts);
          return st => sc(L.grooveItem(st));
        };
        const taste = v2 ? L.tasteFrom(kept, weightOf({ sure: Number(opt('--sure', 0.5)) }), STYLE_ORDER) : L.blendTaste(kept, listened, now);
        const stationTaste = v2 ? L.tasteFrom(kept, weightOf({ sure: Number(opt('--sure', 0.5)), explore: Number(opt('--explore', 0)) }), STYLE_ORDER) : taste;
        const part = d < 7 ? parts.week1 : parts.after;
        const rows = S.homeRows(taste);
        const top = rows.find(x => x.key === 'for-you').ids.find(id => id.startsWith('style:'));
        part.days++;
        part.first += top ? sig(like(top.slice(6))) : 0;
        const filter = S.stationFilter('taste', stationTaste);
        const styles = filter.styles || [];
        part.got += styles.slice(0, 4).reduce((s, x) => s + sig(like(x)), 0);
        part.best += STYLE_ORDER.map(x => sig(like(x))).sort((a, b) => b - a).slice(0, Math.min(4, styles.length)).reduce((s, x) => s + x, 0);
        const recent = [];
        let k = 0;
        const play = station => {
          const pick = R.radioPick('all', recent, Math.floor(r() * 1e9), station);
          recent.push(pick);
          const at = now + ++k * 240_000;
          const heard = r() < sig(like(pick.style));
          const skipped = !heard && r() < 0.8;
          if (v2) {
            if (heard) F.picked('beats', L.grooveItem(pick.style), at);
            else if (skipped) F.passed('beats', L.grooveItem(pick.style), at);
          } else if (heard || skipped) listened = L.listenNote(listened, pick.style, heard ? L.LISTEN_DONE : L.LISTEN_SKIP, at);
          // Now and then a ♡ for one loved.
          if (heard && like(pick.style) > 1 && r() < 0.12) {
            kept[pick.style] = (kept[pick.style] || 0) + 1;
          }
          return heard;
        };
        for (let i = 0; i < 3; i++) play(null);
        for (let i = 0; i < 6; i++) {
          part.shown++;
          if (play(filter)) part.opened++;
        }
      }
    }
    console.log(line(who, parts));
  }
}

const RUN = { sports, stock, law, beats };
for (const name of asked.length ? asked : Object.keys(RUN)) await RUN[name]?.();
