// Orbit Sports' win probability lines, in the kit so the proxy's builders (the family's
// data, data.js) run the same code as the app; Orbit Sports' lib/winprob.mjs
// re-exports it.
// A game's win probability from Polymarket's market on it, where ESPN draws
// none (soccer, MLB while it's on, CPBL): its moneyline's price, every two
// minutes from the start. The app reads it for a game on now; a finished
// game's is read once by the winprob builder and kept in R2 for
// good. No imports: the builder loads this file alone.
//
//   polymarketLine(league, { start, home, away }, getJson)   (English names)
//     → { source: 'polymarket', points: [{ t, home, draw? }] } | null
//
// getJson(url, { trim, kind }) reads through the data proxy; kind ('game',
// 'history') says how long its answer can be kept.

export const GAMMA = 'https://gamma-api.polymarket.com';
export const CLOB = 'https://clob.polymarket.com/prices-history';
export const GAMES_TRIM = 'polymarket-games';
// Each league's Polymarket series (its games' list).
// CPBL's market isn't one: it's traded too thinly most games to draw a line (the owner, 2026-10-10).
export const PM_LEAGUE = { mlb: 3, nba: 10345, epl: 10188, seriea: 10203, bundesliga: 10194, ligue1: 10195, ucl: 10204, uel: 10209, scotland: 10674, mls: 10189, facup: 10314, nationsleague: 11446 };

// Names compared plainly (accents, "FC" and the like aside).
const plain = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(fc|afc|cf|sc|ac|sk|club|calcio)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Words too common to tell two sides apart.
const COMMON = new Set(['united', 'city', 'real', 'sporting', 'athletic', 'new', 'saint', 'san', 'the', 'and', 'de', 'del', 'la']);
const words = s => plain(s).split(' ').filter(w => w.length >= 3 && !COMMON.has(w));
// How alike two names are: the same, one inside the other, words in common
// ("Hamburg SV" and "Hamburger SV", "Red Bull New York" and "New York Red Bulls").
export function nameScore(a, b) {
  const [x, y] = [plain(a), plain(b)];
  if (!x || !y) return 0;
  if (x === y) return 10;
  if (x.includes(y) || y.includes(x)) return 6;
  let n = 0;
  for (const w of words(a)) for (const v of words(b)) if (w === v || (w.length >= 5 && v.length >= 5 && (w.startsWith(v) || v.startsWith(w)))) n += 2;
  return n;
}
// Which of two labels is the home side's: the one more like it than like the away side.
const homeFirst = (x, y, home, away) => nameScore(home, x) - nameScore(away, x) >= nameScore(home, y) - nameScore(away, y);

const json = s => {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s || [];
  } catch {
    return [];
  }
};

const iso = ms => new Date(Math.floor(ms / 60_000) * 60_000).toISOString().replace('.000Z', 'Z');

// The game's market: the league's games at its kickoff (a few at most), the
// one most like it by the sides' names (one side's is enough: "FC Cologne"
// is Polymarket's "1. FC Köln"), and the token whose price is each outcome's
// chance: { slug, home, away } or { slug, home, draw, away }.
export async function findMarket(league, { start, home, away }, getJson) {
  const series = PM_LEAGUE[league];
  const at = Date.parse(start);
  if (!series || !at) return null;
  const events = (await getJson(`${GAMMA}/events?series_id=${series}&start_time_min=${iso(at - 15 * 60_000)}&start_time_max=${iso(at + 15 * 60_000)}&limit=100`, { trim: GAMES_TRIM, kind: 'game' })) || [];
  const labels = ev => [...(ev.teams || []).flatMap(t => [t.name, t.alias]), ...(ev.markets || []).flatMap(m => [...json(m.outcomes), m.groupItemTitle])].filter(Boolean);
  const fit = ev => Math.max(0, ...labels(ev).map(l => nameScore(home, l))) + Math.max(0, ...labels(ev).map(l => nameScore(away, l)));
  const event = events
    .filter(ev => ev.markets?.length)
    .map(ev => [ev, fit(ev)])
    .sort((x, y) => y[1] - x[1])
    .find(([, f]) => f > 0)?.[0];
  const markets = event?.markets || [];
  if (markets.length === 1) {
    // Two ways: one market, each side an outcome.
    const [o0, o1] = json(markets[0].outcomes);
    const tokens = json(markets[0].clobTokenIds);
    if (!o0 || !o1 || tokens.length !== 2) return null;
    return homeFirst(o0, o1, home, away) ? { slug: event.slug, home: tokens[0], away: tokens[1] } : { slug: event.slug, home: tokens[1], away: tokens[0] };
  }
  // Three ways (soccer): a yes-or-no market each for either side's win and the draw.
  const yes = m => json(m?.clobTokenIds)[0];
  const draw = markets.find(m => /^draw\b/i.test(m.groupItemTitle || ''));
  const [m0, m1] = markets.filter(m => m !== draw);
  if (!draw || !m0 || !m1) return null;
  const [h, a] = homeFirst(m0.groupItemTitle, m1.groupItemTitle, home, away) ? [m0, m1] : [m1, m0];
  return { slug: event.slug, home: yes(h), draw: yes(draw), away: yes(a) };
}

// One token's price, every minute for the 6 hours from the start (a game,
// even one in extra innings; never a market left open for days after it).
// Every minute, not 2: a finger on the chart read the game in 2-minute
// steps (the owner, 2026-10-18; F1's races are read by the minute too).
const LONGEST = 6 * 3600;
export const historyUrl = (token, start) => {
  const from = Math.floor(Date.parse(start) / 60_000) * 60;
  return `${CLOB}?market=${token}&startTs=${from}&endTs=${from + LONGEST}&fidelity=1`;
};

// The prices as one line of points; after the market has settled (a side at
// 99%+ to the end), only the first such point.
export function mergeHistories(series) {
  const keys = Object.keys(series).filter(k => series[k]?.length);
  if (!keys.includes('home')) return [];
  const times = [...new Set(keys.flatMap(k => series[k].map(p => p.t)))].sort((x, y) => x - y);
  const idx = Object.fromEntries(keys.map(k => [k, 0]));
  const last = {};
  const points = [];
  for (const t of times) {
    for (const k of keys) {
      const s = series[k];
      while (idx[k] < s.length && s[idx[k]].t <= t) last[k] = s[idx[k]++].p;
    }
    // From the first moment every outcome has a price.
    if (keys.some(k => last[k] == null)) continue;
    if ('draw' in series) {
      const [hh, dd, aa] = [last.home ?? 0, last.draw ?? 0, last.away ?? Math.max(0, 1 - (last.home ?? 0) - (last.draw ?? 0))];
      const sum = hh + dd + aa || 1;
      points.push({ t, home: hh / sum, draw: dd / sum });
    } else points.push({ t, home: last.home });
  }
  const settled = p => p.home >= 0.99 || p.home <= 0.01 || (p.draw ?? 0) >= 0.99;
  let end = points.length;
  while (end > 1 && settled(points[end - 1]) && settled(points[end - 2])) end--;
  return points.slice(0, end).map(p => ({ t: p.t, home: Math.round(p.home * 1000) / 1000, ...(p.draw != null ? { draw: Math.round(p.draw * 1000) / 1000 } : {}) }));
}

// A finished game's line, kept in R2 (builders/winprob.js) while
// the app can show the game: its league's current season, and before the
// next one's regular season its playoffs. A month's games in one file,
// winprob/<league>/<YYYY-MM>.json (the start's UTC month): { games: { key:
// { m, t0, p: [[minutes, home‰, draw‰?]…] } | { none } } }, none where ESPN
// draws its own or Polymarket had no market. ESPN's games by their id;
// CPBL's (whose ids change with the source) by the day and the home side.
export const PM_PACK = 'winprob';
export const gameKey = (league, { id, start, home }) => (league === 'cpbl' ? `${new Date(start).toISOString().slice(0, 10)}-${plain(home?.en || home?.name).split(' ').at(-1)}` : String(id));
export const monthPath = (league, start) => `${PM_PACK}/${league}/${new Date(start).toISOString().slice(0, 7)}.json`;
// What the app asks for: the month's file with the version of its meaning.
// When the lines' meaning changes (LINE: F1 lines read again,
// a race once marked { none } drawn), this goes up, so a phone's kept copy
// (the kit keeps a pack 6 hours and opens on it) is asked afresh on the
// app's next open instead of being waited out.
export const PACK_V = 2;
export const monthPack = (league, start) => `${monthPath(league, start)}?v=${PACK_V}`;
// A line as kept (a fifth of its size) and back.
export function packLine(line) {
  const t0 = line.points[0].t;
  return { m: line.market || '', t0, p: line.points.map(x => [Math.round((x.t - t0) / 60), Math.round(x.home * 1000), ...(x.draw != null ? [Math.round(x.draw * 1000)] : [])]) };
}
export function unpackLine(kept) {
  if (!Array.isArray(kept?.p) || kept.p.length < 4) return null;
  return { source: 'polymarket', market: kept.m, points: kept.p.map(([dt, h, d]) => ({ t: kept.t0 + dt * 60, home: h / 1000, ...(d != null ? { draw: d / 1000 } : {}) })) };
}

// A game to come: each side's chance now (the last price of the day's).
export const nowUrl = token => `${CLOB}?market=${token}&interval=1d&fidelity=30`;
export async function polymarketNow(league, game, getJson) {
  const market = await findMarket(league, game, getJson);
  if (!market) return null;
  const read = 'draw' in market ? ['home', 'draw', 'away'] : ['home'];
  const last = await Promise.all(read.map(k => getJson(nowUrl(market[k]), { kind: 'now' }).then(x => Number((x?.history || []).at(-1)?.p))));
  if (!last.every(Number.isFinite)) return null;
  if (!('draw' in market)) return { source: 'polymarket', home: last[0] };
  const sum = last[0] + last[1] + last[2] || 1;
  return { source: 'polymarket', home: last[0] / sum, draw: last[1] / sum };
}

export async function polymarketLine(league, game, getJson) {
  const market = await findMarket(league, game, getJson);
  if (!market) return null;
  // Two ways: the home side's price is the line (the away side's is its rest).
  const read = 'draw' in market ? ['home', 'draw', 'away'] : ['home'];
  const got = await Promise.all(read.map(k => getJson(historyUrl(market[k], game.start), { kind: 'history' }).then(x => (x?.history || []).map(p => ({ t: p.t, p: Number(p.p) })).filter(p => Number.isFinite(p.p)))));
  const series = Object.fromEntries(read.map((k, i) => [k, got[i]]));
  if ('draw' in market) series.draw ||= [];
  const points = mergeHistories(series);
  return points.length > 3 ? { source: 'polymarket', market: market.slug, points } : null;
}

// ---- F1: a race's winner market, each driver's chance ----
// The race's market (Polymarket's F1 events at the race's start): each
// driver's yes token and how much it's traded.
export async function findRaceMarket(start, getJson) {
  const at = Date.parse(start);
  if (!at) return null;
  // The race's day, the closest winner market to its start (Polymarket's time can be hours off: Miami 2026, 20:00 for 17:00).
  const events = (await getJson(`${GAMMA}/events?tag_slug=f1&start_time_min=${iso(at - 6 * 3_600_000)}&start_time_max=${iso(at + 6 * 3_600_000)}&limit=50`, { trim: GAMES_TRIM, kind: 'game' })) || [];
  const off = ev => Math.abs(Date.parse(ev.startTime || '') - at) || Infinity;
  // An F1 race's own (Polymarket's F1 tag holds IndyCar's too: Mid-Ohio's on Silverstone's day).
  const event = events.filter(ev => /^f1-.*-winner-\d{4}-\d{2}-\d{2}$/.test(ev.slug || '') && !/sprint/.test(ev.slug)).sort((a, b) => off(a) - off(b))[0];
  const drivers = (event?.markets || []).map(m => ({ name: m.groupItemTitle || '', token: json(m.clobTokenIds)[0], volume: Number(m.volume) || 0 })).filter(d => d.name && d.token);
  return drivers.length ? { slug: event.slug, drivers } : null;
}

// Each lap's end on the clock ([{ lap, t }], t in seconds, lap 0 the lights
// going out), from OpenF1 once the race is over (it's closed while one runs):
// the winner's laps, as they really ran (a start held an hour and a half
// for rain moves every lap; the race's set time says nothing of it).
const OPENF1 = 'https://api.openf1.org/v1';
async function raceSession(start, getJson) {
  const at = Date.parse(start);
  const got = await getJson(`${OPENF1}/sessions?year=${new Date(at).getUTCFullYear()}&session_name=Race`, { kind: 'laps' });
  const sessions = Array.isArray(got) ? got : [];
  return sessions.find(x => Math.abs(Date.parse(x.date_start) - at) < 6 * 3_600_000) || null;
}
export async function raceLaps(start, getJson) {
  const race = await raceSession(start, getJson);
  if (!race) return null;
  const list = x => (Array.isArray(x) ? x : []);
  const [won] = list(await getJson(`${OPENF1}/session_result?session_key=${race.session_key}&position=1`, { kind: 'laps' }));
  if (!won?.driver_number) return null;
  const laps = list(await getJson(`${OPENF1}/laps?session_key=${race.session_key}&driver_number=${won.driver_number}`, { kind: 'laps' })).filter(l => l.date_start).sort((x, y) => x.lap_number - y.lap_number);
  if (laps.length < 3) return null;
  const sec = d => Date.parse(d) / 1000;
  return [{ lap: 0, t: sec(laps[0].date_start) }, ...laps.map((l, i) => ({ lap: l.lap_number, t: laps[i + 1] ? sec(laps[i + 1].date_start) : sec(l.date_start) + (Number(l.lap_duration) || 0) }))];
}

// The safety car, the virtual one and red flags from race control's
// messages ({ category, flag, message }, OpenF1's or F1's live feed's, in
// order): [[from, to, 'sc' | 'vsc' | 'red', the message that sent it out]],
// from and to by `at` (a lap, or a time); one still out runs to `end`.
export function controlBands(messages, at, end) {
  const bands = [];
  let open = null;
  for (const m of messages) {
    const msg = String(m.message || '').toUpperCase();
    const flag = String(m.flag || '').toUpperCase();
    // A red flag is sometimes only said ("RED FLAG - RACE SUSPENDED"), its flag left out.
    const kind = /(VIRTUAL SAFETY CAR|VSC) DEPLOYED/.test(msg) ? 'vsc' : /SAFETY CAR DEPLOYED/.test(msg) ? 'sc' : flag === 'RED' || /\bRED FLAG\b/.test(msg) ? 'red' : '';
    const clear = msg === 'TRACK CLEAR';
    const ends = open && ((open.kind === 'vsc' && (/(VIRTUAL SAFETY CAR|VSC) ENDING/.test(msg) || clear)) || (open.kind === 'sc' && (/SAFETY CAR IN THIS LAP/.test(msg) || clear)) || (open.kind === 'red' && (flag === 'GREEN' || clear || /RESUME|START/.test(msg))));
    // One turned into another (a virtual safety car into the real one): the first ends there.
    if (open && (ends || (kind && kind !== open.kind))) {
      bands.push([open.from, Math.max(open.from, at(m)), open.kind, open.m]);
      open = null;
    }
    if (kind && !open && !ends) open = { kind, from: at(m), m };
  }
  if (open) bands.push([open.from, Math.max(open.from, end), open.kind, open.m]);
  return bands;
}

// Why the safety car (or a flag) came out, from race control's messages
// ({ t, message }) about it: a car out of the race just before (`out`, its
// drivers' names), a car stopped, a collision noted. { kind: 'out' |
// 'stopped' | 'crash', who: [names] } or null. nameOf: a car's number to
// its driver's name.
export function causeOf(messages, at, out = [], nameOf = () => '') {
  const cars = msg => [...String(msg).matchAll(/CARS? (\d+) \(([A-Z]{3})\)|AND (\d+) \(([A-Z]{3})\)/g)].map(x => nameOf(x[1] || x[3]) || x[2] || x[4]);
  const near = (before, after) => (at == null ? [] : messages.filter(m => m.t >= at - before && m.t <= at + after));
  const stopped = near(240, 90).find(m => /STOPPED|CRASH|IN THE BARRIER|IN THE GRAVEL|BEACHED/i.test(m.message) && cars(m.message).length);
  if (out.filter(Boolean).length) return { kind: 'out', who: [...new Set(out.filter(Boolean))] };
  if (stopped) return { kind: 'stopped', who: cars(stopped.message) };
  const crash = near(120, 30).find(m => /INCIDENT INVOLVING|COLLISION/i.test(m.message) && cars(m.message).length);
  return crash ? { kind: 'crash', who: [...new Set(cars(crash.message))] } : null;
}

// What turned a race, from OpenF1 once it's over: the safety car, the
// virtual one and red flags ([[from lap, to lap, 'sc' | 'vsc' | 'red']]), and
// for the drivers drawn their pit stops and a retirement ([[lap, 'pit' |
// 'out', driver]], the driver its place in `names`), and every change of
// leader ([lap, 'lead', its place in names, or the name of one not drawn]).
export async function raceEvents(start, getJson, laps, names) {
  const race = await raceSession(start, getJson);
  if (!race || !laps?.length) return null;
  const q = `session_key=${race.session_key}`;
  const sec = d => Date.parse(d) / 1000;
  const last = laps.at(-1).lap;
  // The lap running at a moment.
  const lapAt = t => Math.min(last, Math.max(1, laps.filter(l => l.t <= t).length));
  // One at a time, a second apart (OpenF1 turns away a burst); a read refused is no answer, never "none".
  const gap = () => new Promise(r => setTimeout(r, 1000));
  const read = async (k, more = '') => (await gap(), getJson(`${OPENF1}/${k}?${q}${more}`, { kind: 'laps' }).catch(() => null).then(x => (Array.isArray(x) ? x : null)));
  const control = await read('race_control');
  const drivers = await read('drivers');
  const pits = await read('pit');
  const result = await read('session_result');
  if (!control || !drivers || !pits || !result) return null;
  const sorted = [...control].sort((a, b) => sec(a.date) - sec(b.date));
  // A car's driver, by name ("Valtteri Bottas": the app shows it its own way, with the face).
  const nameOf = n => {
    const d = drivers.find(x => x.driver_number === Number(n));
    return d ? [d.first_name, d.last_name].filter(Boolean).join(' ') : '';
  };
  // Why each came out: a car out of the race in the laps before, a car stopped, a collision just before.
  const bands = controlBands(sorted, m => m.lap_number || lapAt(sec(m.date)), last).map(([from, to, kind, m]) => {
    const why = causeOf(
      sorted.map(x => ({ t: sec(x.date), message: x.message })),
      m ? sec(m.date) : null,
      result.filter(r => (r.dnf || r.dns) && r.number_of_laps >= from - 4 && r.number_of_laps <= from).map(r => nameOf(r.driver_number)),
      nameOf
    );
    return why ? [from, to, kind, why.kind, why.who] : [from, to, kind];
  });
  // The drawn drivers' numbers, by the family name.
  const flat = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const numbers = names.map(n => drivers.find(d => d.last_name && flat(n).endsWith(flat(d.last_name)))?.driver_number);
  const ev = [];
  for (const p of pits) {
    const k = numbers.indexOf(p.driver_number);
    if (k >= 0 && p.lap_number) ev.push([p.lap_number, 'pit', k]);
  }
  for (const r of result) {
    const k = numbers.indexOf(r.driver_number);
    if (k >= 0 && (r.dnf || r.dns) && r.number_of_laps < last) ev.push([Math.max(1, r.number_of_laps), 'out', k]);
  }
  // Who led at each lap's end, whoever it was (every car's places, one read): a drawn
  // driver by its place in names, another by name ([lap, 'lead', k | name]).
  const places = await read('position');
  if (!places) return null;
  const byTime = [...places].sort((x, y) => sec(x.date) - sec(y.date));
  const leaderAt = t => {
    let car = null;
    for (const x of byTime) {
      if (sec(x.date) > t) break;
      if (x.position === 1) car = x.driver_number;
    }
    return car;
  };
  const who = car => (numbers.includes(car) ? numbers.indexOf(car) : nameOf(car) || null);
  let leader = leaderAt(laps[0].t);
  if (leader != null && who(leader) != null) ev.push([0, 'lead', who(leader)]);
  for (const l of laps.slice(1)) {
    const now = leaderAt(l.t);
    if (now != null && now !== leader && who(now) != null) ev.push([l.lap, 'lead', who(now)]);
    if (now != null) leader = now;
  }
  return { bands, events: ev.sort((a, b) => a[0] - b[0]) };
}

// A driver's price at a moment: the last one by then (the first, before any).
const priceAt = (series, t) => {
  let p = series[0]?.p ?? 0;
  for (const x of series) {
    if (x.t > t) break;
    p = x.p;
  }
  return p;
};
// The most traded drivers read (the rest never had a chance), and of them
// those whose chance ever reached a tenth drawn, five at most.
const READ = 8;
const SHOWN = 5;
// The race's line: each shown driver's chance at each lap's end (laps, from
// raceLaps), else every two minutes from the start while the laps aren't in
// (a race on now): { source, market, drivers: [names], by: 'lap' | 'time',
// points: [{ lap | t, c: [chance per driver] }] }.
export async function raceLine(start, getJson, laps = null) {
  const market = await findRaceMarket(start, getJson);
  if (!market) return null;
  const from = Math.floor(Date.parse(start) / 60_000) * 60;
  // The most traded few; where the market no longer says (an older one's
  // volume is gone: China 2026 read Gasly and Alonso, never Antonelli), all.
  const traded = market.drivers.filter(d => d.volume > 0);
  const read = traded.length >= READ ? [...traded].sort((a, b) => b.volume - a.volume).slice(0, READ) : market.drivers;
  const series = await Promise.all(
    read.map(d =>
      getJson(`${CLOB}?market=${d.token}&startTs=${from - 1800}&endTs=${from + LONGEST}&fidelity=1`, { kind: 'history' })
        .then(x => (x?.history || []).map(p => ({ t: p.t, p: Number(p.p) })).filter(p => Number.isFinite(p.p)))
        .catch(() => [])
    )
  );
  const until = laps?.length ? laps.at(-1).t : Math.max(0, ...series.map(s => s.at(-1)?.t || 0));
  // Each driver's best chance where the chart is drawn (each lap's end, else every two minutes):
  // a stray trade between them (a thin market's 0.5 for Lawson) puts no one on it.
  const times = laps?.length ? laps.map(l => l.t) : Array.from({ length: Math.floor((until - from) / 120) + 1 }, (_, k) => from + k * 120);
  const peak = series.map(s => Math.max(0, ...times.map(t => priceAt(s, t))));
  const shown = read
    .map((d, i) => ({ name: d.name, i, peak: peak[i] }))
    .filter(d => d.peak >= 0.1)
    .sort((a, b) => b.peak - a.peak)
    .slice(0, SHOWN);
  if (!shown.length) return null;
  const at = t => shown.map(d => Math.round(priceAt(series[d.i], t) * 1000) / 1000);
  let points;
  if (laps?.length) points = laps.map(l => ({ lap: l.lap, c: at(l.t) }));
  else {
    points = [];
    for (let t = from; t <= until; t += 120) points.push({ t, c: at(t) });
    // Settled (a driver at 99%+ to the end): only the first such point.
    const settled = p => p.c.some(c => c >= 0.99);
    while (points.length > 1 && settled(points.at(-1)) && settled(points.at(-2))) points.pop();
  }
  // A race over is won by someone: a line with no one near it at the end missed the winner (a failed read, never kept).
  if (laps?.length && points.length && Math.max(...points.at(-1).c) < 0.5) throw new Error(`${market.slug}: the winner isn't in the line`);
  return points.length > 3 ? { source: 'polymarket', market: market.slug, drivers: shown.map(d => d.name), by: laps?.length ? 'lap' : 'time', points } : null;
}
// A race to come: the drivers' chances now, the likeliest first (five).
export async function raceNow(start, getJson) {
  const market = await findRaceMarket(start, getJson);
  if (!market) return null;
  // The most traded few; where the market no longer says (an older one's
  // volume is gone: China 2026 read Gasly and Alonso, never Antonelli), all.
  const traded = market.drivers.filter(d => d.volume > 0);
  const read = traded.length >= READ ? [...traded].sort((a, b) => b.volume - a.volume).slice(0, READ) : market.drivers;
  const last = await Promise.all(read.map(d => getJson(nowUrl(d.token), { kind: 'now' }).then(x => Number((x?.history || []).at(-1)?.p)).catch(() => NaN)));
  const drivers = read
    .map((d, i) => ({ name: d.name, chance: last[i] }))
    .filter(d => Number.isFinite(d.chance) && d.chance >= 0.005)
    .sort((a, b) => b.chance - a.chance)
    .slice(0, SHOWN);
  return drivers.length ? { source: 'polymarket', market: market.slug, drivers } : null;
}
// A finished race's line as kept in R2 (winprob/f1/<YYYY-MM>.json,
// keyed by the race's UTC day): { m, d: [names], by, t0?, b?, e?, p: [[lap | minutes, ‰…]] }
// (b, e: raceEvents' bands and events).
export const raceKey = start => new Date(start).toISOString().slice(0, 10);
export function packRace(line) {
  const t0 = line.points[0].t;
  return { m: line.market, d: line.drivers, by: line.by, ...(line.by === 'time' ? { t0 } : {}), ...(line.bands ? { b: line.bands, e: line.events } : {}), p: line.points.map(x => [line.by === 'lap' ? x.lap : Math.round((x.t - t0) / 60), ...x.c.map(c => Math.round(c * 1000))]) };
}
export function unpackRace(kept) {
  if (!Array.isArray(kept?.p) || kept.p.length < 4 || !Array.isArray(kept.d)) return null;
  return { source: 'polymarket', market: kept.m, drivers: kept.d, by: kept.by, ...(kept.b ? { bands: kept.b, events: kept.e || [] } : {}), points: kept.p.map(([x, ...c]) => ({ ...(kept.by === 'lap' ? { lap: x } : { t: kept.t0 + x * 60 }), c: c.map(v => v / 1000) })) };
}
