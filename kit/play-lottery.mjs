// 彩券: Taiwan Lottery's computer-drawn games, played with Quadra money and
// settled against the real draws (Taiwan Lottery's public results API,
// which sends CORS headers, so the browser reads it directly).
//
//   威力彩       6 of 1-38 + 1 of 1-8      NT$100   Mon, Thu 20:30
//   大樂透       6 of 1-49 (+ special)     NT$50    Tue, Fri 20:30
//   今彩539      5 of 1-39                 NT$50    Mon-Sat 20:30
//   3星彩        3 digits, in order        NT$25    Mon-Sat 20:30
//   4星彩        4 digits, in order        NT$25    Mon-Sat 20:30
//   39樂合彩     2-4 of 1-39, on 今彩539's draw          NT$25 a combination
//   49樂合彩     2-4 of 1-49, on 大樂透's six numbers    NT$25 a combination
//   賓果賓果     1-10 stars of 1-80, 20 drawn every 5 minutes 07:05-23:55, NT$25
//
// Prizes follow Taiwan Lottery's tables: fixed prizes as printed, pool
// prizes (威力彩's first two tiers, 大樂透's first four) from what that draw
// actually paid per winner, shared with the real winners (a pool tier nobody
// won pays its whole pool). The 樂合彩 tables are Taiwan Lottery's own (45/450/8,500 times the NT$25
// on 39, 50/500/8,000 on 49; 38樂合彩 is gone, last drawn 2023-12-28).
// 今彩539's fixed prizes have a cap per draw (台灣彩券 獎金分配方式: each
// tier NT$24,000,000; past it the tier is shared, rounded down to the NT$).

import { choose, prizeAfterTax } from '#kit/play-odds.mjs';

export const API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery';
const TPE = 8 * 3_600_000;
const DAY = 86_400_000;

// ---- The games -------------------------------------------------------------------

export const GAMES = {
  super638: {
    zh: '威力彩', en: 'Super Lotto', price: 100, days: [1, 4], color: '#dc2626',
    zones: [{ n: 6, max: 38 }, { n: 1, max: 8 }],
    api: { path: 'SuperLotto638Result', list: 'superLotto638Res' },
    tiers: [
      { key: 'jackpot', zh: '頭獎', en: 'Jackpot', m: [6, 1], pool: 'super638JackpotAssign' },
      { key: 'second', zh: '貳獎', en: '2nd', m: [6, 0], pool: 'super638SecondAssign' },
      { key: 'third', zh: '參獎', en: '3rd', m: [5, 1], prize: 150_000 },
      { key: 'fourth', zh: '肆獎', en: '4th', m: [5, 0], prize: 20_000 },
      { key: 'fifth', zh: '伍獎', en: '5th', m: [4, 1], prize: 4_000 },
      { key: 'sixth', zh: '陸獎', en: '6th', m: [4, 0], prize: 800 },
      { key: 'seventh', zh: '柒獎', en: '7th', m: [3, 1], prize: 400 },
      { key: 'eighth', zh: '捌獎', en: '8th', m: [2, 1], prize: 200 },
      { key: 'ninth', zh: '玖獎', en: '9th', m: [3, 0], prize: 100 },
      { key: 'normal', zh: '普獎', en: 'Consolation', m: [1, 1], prize: 100 }
    ]
  },
  lotto649: {
    zh: '大樂透', en: 'Lotto 6/49', price: 50, days: [2, 5], color: '#d97706',
    zones: [{ n: 6, max: 49 }],
    special: true,
    api: { path: 'Lotto649Result', list: 'lotto649Res' },
    tiers: [
      { key: 'jackpot', zh: '頭獎', en: 'Jackpot', hits: 6, pool: 'jackpotAssign' },
      { key: 'second', zh: '貳獎', en: '2nd', hits: 5, sp: true, pool: 'secondAssign' },
      { key: 'third', zh: '參獎', en: '3rd', hits: 5, sp: false, pool: 'thirdAssign' },
      { key: 'fourth', zh: '肆獎', en: '4th', hits: 4, sp: true, pool: 'fourthAssign' },
      { key: 'fifth', zh: '伍獎', en: '5th', hits: 4, sp: false, prize: 2_000 },
      { key: 'sixth', zh: '陸獎', en: '6th', hits: 3, sp: true, prize: 1_000 },
      { key: 'seventh', zh: '柒獎', en: '7th', hits: 2, sp: true, prize: 400 },
      { key: 'normal', zh: '普獎', en: 'Consolation', hits: 3, sp: false, prize: 400 }
    ]
  },
  daily539: {
    zh: '今彩539', en: 'Daily Cash 539', price: 50, days: [1, 2, 3, 4, 5, 6], color: '#059669',
    zones: [{ n: 5, max: 39 }],
    api: { path: 'Daily539Result', list: 'daily539Res' },
    // `cap`: the tier's total a draw (4 jackpots: NT$6,000,000 each, 2026-04-18).
    tiers: [
      { key: 'jackpot', zh: '頭獎', en: 'Jackpot', hits: 5, prize: 8_000_000, cap: 24_000_000, shared: 'd539JackpotAssign' },
      { key: 'second', zh: '貳獎', en: '2nd', hits: 4, prize: 20_000, cap: 24_000_000, shared: 'd539SecondAssign' },
      { key: 'third', zh: '參獎', en: '3rd', hits: 3, prize: 300, cap: 24_000_000, shared: 'd539ThirdAssign' },
      { key: 'fourth', zh: '肆獎', en: '4th', hits: 2, prize: 50, cap: 24_000_000, shared: 'd539FourthAssign' }
    ]
  },
  star3: {
    zh: '3星彩', en: '3 Star', price: 25, days: [1, 2, 3, 4, 5, 6], color: '#7c3aed',
    digits: 3,
    api: { path: '3DResult', list: 'lotto3DRes' },
    // Since 2024-01-01 one play, the digits in order, paid by how many of
    // the last digits match (壹獎 all, 貳獎 the last two, 參獎 the last
    // one); 組彩 and 對彩 are gone.
    tiers: [
      { key: 'first', zh: '壹獎', en: '1st', hits: 3, prize: 5_000 },
      { key: 'second', zh: '貳獎', en: '2nd', hits: 2, prize: 500 },
      { key: 'third', zh: '參獎', en: '3rd', hits: 1, prize: 50 }
    ],
    // (The one play, as Play's picker lists them.)
    plays: { straight: { zh: '正彩', en: 'Straight', prize: 5_000 } }
  },
  star4: {
    zh: '4星彩', en: '4 Star', price: 25, days: [1, 2, 3, 4, 5, 6], color: '#0891b2',
    digits: 4,
    api: { path: '4DResult', list: 'lotto4DRes' },
    tiers: [
      { key: 'first', zh: '壹獎', en: '1st', hits: 4, prize: 50_000 },
      { key: 'second', zh: '貳獎', en: '2nd', hits: 3, prize: 5_000 },
      { key: 'third', zh: '參獎', en: '3rd', hits: 2, prize: 500 }
    ],
    plays: { straight: { zh: '正彩', en: 'Straight', prize: 50_000 } }
  },
  m39: {
    zh: '39樂合彩', en: '39 Combo', price: 25, days: [1, 2, 3, 4, 5, 6], color: '#047857', of: 'daily539',
    combo: { max: 39, drawn: 5, sizes: { 2: 1_125, 3: 11_250, 4: 212_500 } }
  },
  m49: {
    zh: '49樂合彩', en: '49 Combo', price: 25, days: [2, 5], color: '#b45309', of: 'lotto649',
    combo: { max: 49, drawn: 6, sizes: { 2: 1_250, 3: 12_500, 4: 200_000 } }
  },
  bingo: {
    zh: '賓果賓果', en: 'BINGO BINGO', price: 25, color: '#e11d48', every: 5,
    // Prize multiples of the NT$25 stake, by stars picked and numbers hit.
    stars: {
      1: { 1: 2 },
      2: { 2: 3, 1: 1 },
      3: { 3: 20, 2: 2 },
      4: { 4: 40, 3: 4, 2: 1 },
      5: { 5: 300, 4: 20, 3: 2 },
      6: { 6: 1_000, 5: 40, 4: 8, 3: 1 },
      7: { 7: 3_200, 6: 120, 5: 12, 4: 2, 3: 1 },
      8: { 8: 20_000, 7: 800, 6: 40, 5: 8, 4: 1, 0: 1 },
      9: { 9: 40_000, 8: 4_000, 7: 120, 6: 20, 5: 4, 4: 1, 0: 1 },
      10: { 10: 200_000, 9: 10_000, 8: 1_000, 7: 100, 6: 10, 5: 1, 0: 1 }
    },
    // 猜大小 / 猜單雙: 13 or more of the 20 drawn are big (41-80) / small,
    // odd / even; 超級獎號: the last number drawn.
    sides: { size: 6, parity: 6, bullseye: 48 }
  }
};
export const GAME_ORDER = ['super638', 'lotto649', 'daily539', 'bingo', 'star3', 'star4', 'm39', 'm49'];
export const gameName = (id, lang = 'zh') => GAMES[id]?.[lang === 'en' ? 'en' : 'zh'] || id;

// ---- Draw times ----------------------------------------------------------------------

export const taipeiDate = t => new Date(t + TPE).toISOString().slice(0, 10);
const taipeiDow = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`);
// Sales for an evening draw close half an hour before it.
export const CLOSE_MS = 30 * 60_000;
export const BINGO_FIRST = '07:05';
export const BINGO_DRAWS = 203;
const BINGO_STEP = 5 * 60_000;

// The draw a ticket bought now goes into: { date, slot? (BINGO), at (ms) }.
export function nextDraw(gameId, now = Date.now()) {
  const g = GAMES[gameId];
  if (gameId === 'bingo') {
    for (let d = 0; d < 3; d++) {
      const date = taipeiDate(now + d * DAY);
      const first = at(date, BINGO_FIRST);
      const slot = Math.max(0, Math.ceil((now + 60_000 - first) / BINGO_STEP));
      if (slot < BINGO_DRAWS) return { date, slot, at: first + slot * BINGO_STEP };
    }
    return null;
  }
  for (let d = 0; d < 8; d++) {
    const date = taipeiDate(now + d * DAY);
    if (!g.days.includes(taipeiDow(date))) continue;
    const draw = at(date, '20:30');
    if (draw - CLOSE_MS > now) return { date, at: draw };
  }
  return null;
}

// ---- Picks ----------------------------------------------------------------------------

export function randomInt(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
export function quickPick(n, max) {
  const out = new Set();
  while (out.size < n) out.add(1 + randomInt(max));
  return [...out].sort((a, b) => a - b);
}
// (The slip's own: one copy of the arithmetic.)
export { choose };

// How many bets a selection makes (a 樂合彩 pick of 5 numbers as 二合 is
// C(5,2) = 10 combinations; any other selection is one bet).
export function betCount(gameId, sel) {
  const g = GAMES[gameId];
  return g.combo ? choose(sel.numbers.length, sel.size) : 1;
}

// A selection is valid for its game: { ok } or { error }.
export function checkSelection(gameId, sel) {
  const g = GAMES[gameId];
  const uniq = arr => new Set(arr).size === arr.length;
  const inRange = (arr, max) => arr.every(n => Number.isInteger(n) && n >= 1 && n <= max);
  if (g.digits) {
    if (!Array.isArray(sel.digits) || sel.digits.length !== g.digits || !sel.digits.every(d => Number.isInteger(d) && d >= 0 && d <= 9)) return { error: 'digits' };
    if (sel.play != null && !g.plays[sel.play]) return { error: 'play' };
    return { ok: true };
  }
  if (g.combo) {
    if (!g.combo.sizes[sel.size]) return { error: 'size' };
    if (!Array.isArray(sel.numbers) || sel.numbers.length < sel.size || sel.numbers.length > 12 || !uniq(sel.numbers) || !inRange(sel.numbers, g.combo.max)) return { error: 'numbers' };
    return { ok: true };
  }
  if (gameId === 'bingo') {
    if (sel.side) return ['big', 'small', 'odd', 'even'].includes(sel.side) || (sel.side === 'bullseye' && inRange([sel.bull], 80)) ? { ok: true } : { error: 'side' };
    if (!Array.isArray(sel.numbers) || sel.numbers.length < 1 || sel.numbers.length > 10 || !uniq(sel.numbers) || !inRange(sel.numbers, 80)) return { error: 'numbers' };
    return { ok: true };
  }
  const zones = sel.zones || [];
  if (zones.length !== g.zones.length) return { error: 'numbers' };
  for (const [i, z] of g.zones.entries()) if (zones[i]?.length !== z.n || !uniq(zones[i]) || !inRange(zones[i], z.max)) return { error: 'numbers' };
  return { ok: true };
}

// ---- Results --------------------------------------------------------------------------
//
// A draw as the app keeps it: { numbers: [...], special?, zone2?, digits?,
// pools?: { tierKey: { perPrize, winners, pool } }, order? }.

export function parseDraw(gameId, record) {
  const g = GAMES[gameId];
  if (!record) return null;
  const size = record.drawNumberSize || [];
  const pools = {};
  for (const t of g.tiers || []) {
    const a = record[t.pool ?? t.shared];
    if (!a) continue;
    pools[t.key] = { perPrize: Number(a.perPrize) || 0, winners: Number(a.winnerCount) || 0, pool: (Number(a.prize) || 0) + (Number(a.lastPrize) || 0) };
  }
  // (Its 期別, the draw's number: 第 N 期 on a ticket and its result.)
  const term = record.period ?? record.drawTerm;
  const t = term != null ? { term } : {};
  if (g.digits) return { digits: (record.drawNumberAppear || []).map(Number), ...t };
  if (gameId === 'super638') return { numbers: size.slice(0, 6).map(Number), zone2: Number(size[6]), pools, ...t };
  if (gameId === 'lotto649') return { numbers: size.slice(0, 6).map(Number), special: Number(size[6]), pools, ...t };
  if (gameId === 'daily539') return { numbers: size.slice(0, 5).map(Number), pools, ...t };
  return null;
}

export function parseBingo(record) {
  if (!record?.openShowOrder) return null;
  const order = record.openShowOrder.map(Number);
  return { numbers: [...order].sort((a, b) => a - b), order, bull: Number(record.bullEyeTop) || order.at(-1), term: record.drawTerm };
}

// ---- Prizes ---------------------------------------------------------------------------

const hits = (a, b) => a.filter(x => b.includes(x)).length;

// A capped fixed prize with `winners` real bets on it and `ours` more: the
// printed prize, or the cap shared equally, rounded down (今彩539 獎金分配方式).
export function cappedPrize(tier, winners = 0, ours = 1) {
  if (!tier.cap) return tier.prize;
  return Math.min(tier.prize, Math.floor(tier.cap / (Math.max(0, winners) + ours)));
}

// What one ticket wins on its draw: { prize, tier, detail }. Tickets are
// { game, sel, bets } (bets: combinations or multiples bought).
export function ticketPrize(ticket, draw) {
  const g = GAMES[ticket.game];
  const sel = ticket.sel;
  const pool = (tier, key) => {
    const p = draw.pools?.[key];
    if (!p) return tier.prize || 0;
    // Shared with the real winners: our ticket makes one more.
    return p.winners ? Math.round((p.perPrize * p.winners) / (p.winners + 1)) || p.perPrize : p.pool;
  };
  if (ticket.game === 'super638') {
    const m = [hits(sel.zones[0], draw.numbers), sel.zones[1][0] === draw.zone2 ? 1 : 0];
    const tier = g.tiers.find(t => t.m[0] === m[0] && t.m[1] === m[1]);
    return tier ? { prize: tier.pool ? pool(tier, tier.key) : tier.prize, tier: tier.key, detail: m } : { prize: 0, tier: null, detail: m };
  }
  if (ticket.game === 'lotto649' || ticket.game === 'daily539') {
    const h = hits(sel.zones[0], draw.numbers);
    const sp = draw.special != null && sel.zones[0].includes(draw.special);
    const tier = g.tiers.find(t => t.hits === h && (t.sp == null || t.sp === sp));
    // A capped tier: the draw's real winners and this ticket's bets share it.
    const fixed = t => (t.cap ? cappedPrize(t, draw.pools?.[t.key]?.winners ?? 0, ticket.multiple || 1) : t.prize);
    return tier ? { prize: tier.pool ? pool(tier, tier.key) : fixed(tier), tier: tier.key, detail: [h, sp ? 1 : 0] } : { prize: 0, tier: null, detail: [h, sp ? 1 : 0] };
  }
  if (g.digits) {
    // How many of the last digits match, in place (a ticket from before
    // 組彩 and 對彩 went is checked the same way).
    const d = draw.digits;
    const s = sel.digits;
    let h = 0;
    while (h < s.length && s.at(-1 - h) === d.at(-1 - h)) h++;
    const tier = g.tiers.find(t => t.hits === h);
    return tier ? { prize: tier.prize, tier: tier.key, detail: [h] } : { prize: 0, tier: null, detail: [h] };
  }
  if (g.combo) {
    // Every combination of `size` among the numbers chosen is a bet; each
    // wholly inside the draw wins the size's prize.
    const inside = hits(sel.numbers, draw.numbers);
    const wins = choose(inside, sel.size);
    return { prize: wins * g.combo.sizes[sel.size], tier: wins ? `x${wins}` : null, detail: [inside] };
  }
  if (ticket.game === 'bingo') {
    const unit = g.price * (ticket.multiple || 1);
    if (sel.side) {
      const big = draw.numbers.filter(n => n > 40).length;
      const odd = draw.numbers.filter(n => n % 2).length;
      const won =
        sel.side === 'big' ? big >= 13 : sel.side === 'small' ? big <= 7 : sel.side === 'odd' ? odd >= 13 : sel.side === 'even' ? odd <= 7 : sel.side === 'bullseye' ? draw.bull === sel.bull : false;
      const mult = sel.side === 'bullseye' ? g.sides.bullseye : g.sides.size;
      return { prize: won ? unit * mult : 0, tier: won ? sel.side : null };
    }
    const h = hits(sel.numbers, draw.numbers);
    const mult = g.stars[sel.numbers.length]?.[h] || 0;
    return { prize: unit * mult, tier: mult ? `${h}` : null, detail: [h] };
  }
  return { prize: 0, tier: null };
}

// The average back per NT$ spent on a fixed-prize table (tests check each
// game pays roughly what a real lottery does: 40-80%).
export function expectedReturn(gameId, extra = {}) {
  const g = GAMES[gameId];
  const hyper = (N, K, n, k) => (choose(K, k) * choose(N - K, n - k)) / choose(N, n);
  if (gameId === 'daily539') {
    const { n, max } = g.zones[0];
    return g.tiers.reduce((s, t) => s + hyper(max, n, n, t.hits) * t.prize, 0) / g.price;
  }
  if (g.combo) {
    const { max, drawn, sizes } = g.combo;
    const size = extra.size || 2;
    return (hyper(max, drawn, size, size) * sizes[size]) / g.price;
  }
  if (gameId === 'bingo') {
    const stars = extra.stars || 1;
    let s = 0;
    for (let h = 0; h <= stars; h++) s += hyper(80, 20, stars, h) * (g.stars[stars][h] || 0);
    return s;
  }
  if (g.digits) {
    // The last `hits` digits match and (short of all) the one before misses.
    return g.tiers.reduce((s, t) => s + (10 ** -t.hits) * (t.hits < g.digits ? 0.9 : 1) * t.prize, 0) / g.price;
  }
  return null;
}

// ---- Fetching draws ---------------------------------------------------------------------

const cache = new Map();
async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url, { signal: AbortSignal.timeout(20_000) })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch(error => {
      cache.delete(url);
      throw error;
    });
  cache.set(url, p);
  setTimeout(() => cache.delete(url), 60_000);
  return p;
}

// The official draws of a month: date -> record.
export async function monthDraws(gameId, month) {
  const g = GAMES[gameId];
  const data = await getJson(`${API}/${g.api.path}?period&month=${month}&pageNum=1&pageSize=40`);
  const out = new Map();
  for (const r of data?.content?.[g.api.list] || []) out.set(String(r.lotteryDate).slice(0, 10), r);
  return out;
}

// One day's BINGO draws in order (slot 0 is 07:05).
export async function bingoDay(date) {
  const data = await getJson(`${API}/BingoResult?openDate=${date}&pageNum=1&pageSize=${BINGO_DRAWS}`);
  const list = (data?.content?.bingoQueryResult || []).slice().sort((a, b) => a.drawTerm - b.drawTerm);
  return list;
}

// The draw for a ticket's game and date (and slot), or null while there's none.
export async function drawFor(gameId, draw) {
  const g = GAMES[gameId];
  if (gameId === 'bingo') {
    const day = await bingoDay(draw.date);
    return parseBingo(day[draw.slot]);
  }
  const source = g.of || gameId;
  const record = (await monthDraws(source, draw.date.slice(0, 7))).get(draw.date);
  return parseDraw(source, record);
}

// The latest official results, for the lottery page's header.
export async function latestResults() {
  const data = await getJson(`${API}/LatestResult`);
  const c = data?.content || {};
  return {
    super638: parseDraw('super638', c.superLotto638Result) && { ...parseDraw('super638', c.superLotto638Result), date: String(c.superLotto638Result.lotteryDate).slice(0, 10), jackpot: poolOf(c.superLotto638Result.super638JackpotAssign) },
    lotto649: parseDraw('lotto649', c.lotto649Result) && { ...parseDraw('lotto649', c.lotto649Result), date: String(c.lotto649Result.lotteryDate).slice(0, 10), jackpot: poolOf(c.lotto649Result.jackpotAssign) },
    daily539: parseDraw('daily539', c.daily539Result) && { ...parseDraw('daily539', c.daily539Result), date: String(c.daily539Result.lotteryDate).slice(0, 10) },
    star3: c.lotto3DResult && { ...parseDraw('star3', c.lotto3DResult), date: String(c.lotto3DResult.lotteryDate).slice(0, 10) },
    star4: c.lotto4DResult && { ...parseDraw('star4', c.lotto4DResult), date: String(c.lotto4DResult.lotteryDate).slice(0, 10) }
  };
}
// A jackpot as it stands for the next draw: nobody won it, so it carries over.
const poolOf = a => (a ? (Number(a.winnerCount) ? Number(a.prize) || 0 : (Number(a.prize) || 0) + (Number(a.lastPrize) || 0)) : null);

// ---- Tickets on the account -------------------------------------------------------------
//
// account.tickets: [{ id, t, game, draw: { date, slot?, at }, sel, bets,
// multiple, cost, status: 'open' | 'settled', prize, tier }], with ledger
// entries 'lotto-<id>' (the cost) and 'prize-<id>' (a prize).

export function buyTicket(account, { id, game, sel, multiple = 1 }, now = new Date(), { extra = 0 } = {}) {
  const g = GAMES[game];
  if (!g) return { error: 'game' };
  const check = checkSelection(game, sel);
  if (check.error) return check;
  const draw = nextDraw(game, now.getTime());
  if (!draw) return { error: 'closed' };
  const bets = betCount(game, sel);
  const mult = Math.max(1, Math.min(50, Math.round(multiple)));
  const cost = g.price * bets * mult;
  const own = account.ledger.reduce((s, e) => s + e.amount, 0);
  if (cost > own + extra) return { error: 'funds' };
  const t = now.toISOString();
  const ticket = { id, t, game, draw, sel, bets, multiple: mult, cost, status: 'open' };
  const entry = { id: `lotto-${id}`, t, kind: 'lottery', amount: -cost };
  return { account: { ...account, updated: t, ledger: [...account.ledger, entry], tickets: [ticket, ...(account.tickets || [])] }, ticket };
}

// A drawn ticket settled: its prize (every bet and multiple) paid in. Tax is
// withheld bet by bet (注), as Taiwan Lottery does: each bet's prize over
// NT$5,000 loses 20% income tax and 0.4% stamp duty; bets of NT$5,000 or less
// are paid whole, however many the ticket won (a 樂合彩 combination and each
// of a multiple is a bet of its own).
export function settleTicket(account, ticketId, draw, now = new Date()) {
  const ticket = (account.tickets || []).find(x => x.id === ticketId);
  if (!ticket || ticket.status !== 'open' || !draw) return account;
  const g = GAMES[ticket.game];
  const r = ticketPrize(ticket, draw);
  const multiple = ticket.multiple || 1;
  // BINGO's prize already counts its multiple (it's a multiple of the stake).
  const gross = r.prize * (ticket.game === 'bingo' ? 1 : multiple);
  // One bet's prize, and how many bets won it.
  const each = g.combo ? g.combo.sizes[ticket.sel.size] : ticket.game === 'bingo' ? r.prize / multiple : r.prize;
  const net = each ? Math.round(gross / each) * prizeAfterTax(each) : 0;
  const t = now.toISOString();
  const settled = { ...ticket, status: 'settled', prize: net, gross, tier: r.tier, detail: r.detail, drawn: summarize(draw), settledAt: t };
  const ledger = net > 0 && !account.ledger.some(e => e.id === `prize-${ticketId}`) ? [...account.ledger, { id: `prize-${ticketId}`, t, kind: 'prize', amount: net }] : account.ledger;
  return { ...account, updated: t, ledger, tickets: account.tickets.map(x => (x.id === ticketId ? settled : x)) };
}
const summarize = d => ({ numbers: d.numbers, special: d.special, zone2: d.zone2, digits: d.digits, bull: d.bull, ...(d.term != null ? { term: d.term } : {}) });

// Tickets whose draw is due: open, and past their draw time (plus a little
// for the results to appear).
export const dueTickets = (account, now = Date.now()) => (account.tickets || []).filter(x => x.status === 'open' && x.draw?.at + 3 * 60_000 <= now);

export function mergeTickets(a = [], b = []) {
  const map = new Map();
  for (const x of [...a, ...b]) {
    const had = map.get(x.id);
    if (!had || (had.status !== 'settled' && x.status === 'settled')) map.set(x.id, x);
  }
  return [...map.values()].sort((x, y) => y.t.localeCompare(x.t));
}

// ---- Odds --------------------------------------------------------------------------------

// "1 in 8.5", "1 in 22,085,448".
export const oneIn = p => (p > 0 ? (1 / p < 100 ? Math.round((1 / p) * 10) / 10 : Math.round(1 / p)) : null);

// Tickets sold by the Worker (Shared-Proxy lotto.js: its draw, its cost) put
// on the account as buyTicket would: newest first, each with its
// 'lotto-<id>' cost; a ticket already there is left as it is.
export function addTickets(account, tickets, now = new Date()) {
  const have = new Set((account.tickets || []).map(x => x.id));
  const fresh = tickets.filter(x => x?.id && !have.has(x.id));
  if (!fresh.length) return account;
  const paid = new Set(account.ledger.map(e => e.id));
  const entries = fresh.filter(x => !paid.has(`lotto-${x.id}`)).map(x => ({ id: `lotto-${x.id}`, t: x.t, kind: 'lottery', amount: -x.cost }));
  return { ...account, updated: now.toISOString(), ledger: [...account.ledger, ...entries], tickets: [...[...fresh].reverse(), ...(account.tickets || [])] };
}
