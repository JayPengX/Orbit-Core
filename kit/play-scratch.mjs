// 刮刮樂: twelve instant scratch cards (two at each price) in the style of Taiwan Lottery's, played
// with Quadra money. What a card wins is fixed the moment it's bought (the
// device's crypto random number, by the card's prize table, like a printed
// run of tickets); scratching only reveals it. The card's face is then laid
// out to show exactly that result, the way its game reads.
//
// Each price has its own table, set to what Taiwan Lottery's cards on sale in
// 2026 pay (今周刊's list of every card: payback, win rate, top prize): the
// dearer the card, the more it pays back and the more often it wins.
//
//   price    pays back   wins   top prize
//   100      63%         33%    NT$50萬
//   200      65%         33%    NT$200萬
//   300      66%         36%    NT$300萬
//   500      70%         41%    NT$500萬
//   1000     74%         70%    NT$1,200萬   (half the price back is a prize)
//   2000     75%         69%    NT$2,000萬
import { randomInt } from '#kit/play-lottery.mjs';

// Prize tiers by price: multiples of the price and their odds (1 in N tickets).
const TABLES = {
  100: [[1, 5.05], [2, 10.12], [5, 40], [10, 150], [20, 700], [100, 12_000], [1_000, 300_000], [5_000, 2_000_000]],
  200: [[1, 5.57], [2, 8.53], [5, 40], [10, 150], [20, 700], [100, 12_000], [1_000, 300_000], [10_000, 2_500_000]],
  300: [[1, 4.36], [2, 10.28], [5, 40], [10, 150], [20, 700], [100, 12_000], [1_000, 300_000], [10_000, 2_500_000]],
  500: [[1, 3.12], [2, 19.55], [5, 35], [10, 120], [20, 600], [100, 10_000], [1_000, 250_000], [10_000, 2_500_000]],
  1000: [[0.5, 2.85], [1, 3.93], [2, 14], [5, 60], [10, 200], [20, 900], [100, 20_000], [1_000, 400_000], [12_000, 3_000_000]],
  2000: [[0.5, 3.23], [1, 3.5], [2, 14], [5, 60], [10, 200], [20, 900], [100, 20_000], [1_000, 400_000], [10_000, 3_000_000]]
};
const tableOf = id => TABLES[CARDS[id].price];

export const CARDS = {
  lucky7: { icon: '7️⃣', zh: '幸運7', en: 'Lucky 7', price: 100, color: '#dc2626', layout: 'symbol', symbol: '7', spots: 6, how: { zh: '刮出「7」就贏得它下面的獎金。', en: 'Uncover a 7 to win the prize under it.' } },
  triple: { icon: '🎯', zh: '三個一樣', en: 'Match 3', price: 200, color: '#d97706', layout: 'match3', how: { zh: '刮出三個相同金額，就贏得該金額。', en: 'Uncover three of the same amount to win it.' } },
  numbers: { icon: '🔢', zh: '對中發財', en: 'Lucky Numbers', price: 300, color: '#059669', layout: 'numbers', winning: 3, yours: 10, how: { zh: '「你的號碼」和「中獎號碼」任一相同，就贏得旁邊的獎金。', en: 'Any of your numbers matching a winning number wins the prize beside it.' } },
  bingo: { icon: '🎱', zh: '賓果連線', en: 'Bingo Line', price: 500, color: '#7c3aed', layout: 'bingo', how: { zh: '開出的號碼在卡上連成一線（橫、直、斜），就贏得該線的獎金。', en: 'Called numbers making a line (across, down or diagonal) win that line’s prize.' } },
  gold: { icon: '💰', zh: '金幣翻倍', en: 'Golden Coins', price: 1000, color: '#ca8a04', layout: 'symbol', symbol: '💰', spots: 10, multiplier: true, how: { zh: '刮出💰贏得它的獎金，再乘上左上角的倍數。', en: 'Each 💰 wins its prize, times the multiplier in the corner.' } },
  million: { icon: '💵', zh: '億萬富翁', en: 'Millionaire', price: 2000, color: '#1d4ed8', layout: 'numbers', winning: 5, yours: 20, how: { zh: '「你的號碼」和「中獎號碼」任一相同，就贏得旁邊的獎金。頭獎 2,000 萬。', en: 'Match any winning number to win the prize beside it. Top prize NT$20 million.' } },
  fruit: { icon: '🍒', zh: '水果盤', en: 'Fruit Slots', price: 100, color: '#e11d48', layout: 'slots', lines: 4, symbols: ['🍒', '🍋', '🍇', '🍉', '🍊', '🔔'], how: { zh: '任一橫排出現三個相同圖案，就贏得該排右邊的獎金。', en: 'Three of the same picture across a row wins that row’s prize.' } },
  beat: { icon: '🃏', zh: '比大小', en: 'Beat It', price: 200, color: '#0284c7', layout: 'beat', rows: 6, how: { zh: '你的號碼比「莊家號碼」大，就贏得旁邊的獎金（一樣大不算）。', en: 'Any of your numbers bigger than the dealer’s wins the prize beside it (a tie doesn’t).' } },
  treasure: { icon: '🗺️', zh: '尋寶地圖', en: 'Treasure Map', price: 300, color: '#b45309', layout: 'treasure', how: { zh: '挖出三個相同的寶物，就贏得圖例上它的獎金。', en: 'Dig up three of the same treasure to win its prize on the key.' } },
  dice: { icon: '🎲', zh: '骰子對決', en: 'Dice Duel', price: 500, color: '#16a34a', layout: 'dice', rounds: 5, how: { zh: '每一局你的兩顆骰子點數加起來比莊家大，就贏得該局的獎金。', en: 'In each round, if your two dice add up to more than the dealer’s, you win that round’s prize.' } },
  wheel: { icon: '🎡', zh: '幸運轉盤', en: 'Lucky Wheel', price: 1000, color: '#9333ea', layout: 'wheel', how: { zh: '刮開看指針停在哪一格，就贏得那一格的獎金。', en: 'See where the pointer stops: you win that slice.' } },
  palace: { icon: '🏯', zh: '金殿老虎機', en: 'Palace Slots', price: 2000, color: '#a16207', layout: 'slots', lines: 5, symbols: ['7️⃣', '💎', '👑', '🔔', '⭐', '🍀'], how: { zh: '任一橫排出現三個相同圖案，就贏得該排右邊的獎金。頭獎 2,000 萬。', en: 'Three of the same picture across a row wins that row’s prize. Top prize NT$20 million.' } }
};
// By price, the classic card first.
export const CARD_ORDER = ['lucky7', 'fruit', 'triple', 'beat', 'numbers', 'treasure', 'bingo', 'dice', 'gold', 'wheel', 'million', 'palace'];
// Treasures on the map's key, cheapest tier first.
const TREASURES = ['🐚', '🪙', '🗝️', '🏺', '📿', '💍', '👑', '💎', '🏆'];

export const tiersOf = id => tableOf(id).map(([mult, odds]) => ({ prize: mult * CARDS[id].price, odds }));
export const topPrize = id => tableOf(id).at(-1)[0] * CARDS[id].price;
export const expectedReturn = id => tiersOf(id).reduce((s, t) => s + t.prize / t.odds, 0) / CARDS[id].price;

// The prize a new card holds: one uniform draw against the table.
export function drawPrize(id, rand = Math.random) {
  let r = rand();
  for (const t of tiersOf(id)) {
    if (r < 1 / t.odds) return t.prize;
    r -= 1 / t.odds;
  }
  return 0;
}
const cryptoRand = () => randomInt(2 ** 30) / 2 ** 30;

// A small seeded generator, so a card's face is the same every time it's drawn.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOf = (rand, list) => list[Math.floor(rand() * list.length)];
const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// The amounts a face shows (losing ones as decoys too).
const amounts = id => [...new Set(tiersOf(id).map(t => t.prize))];

// Splits a prize into up to `n` shown amounts that add up to it.
function split(rand, prize, list, n) {
  const parts = [];
  let left = prize;
  const usable = list.filter(a => a <= prize).sort((a, b) => b - a);
  while (left > 0 && parts.length < n - 1 && rand() < 0.45) {
    const a = usable.find(x => x < left && rand() < 0.7);
    if (!a) break;
    parts.push(a);
    left -= a;
  }
  parts.push(left);
  return parts;
}

// The card's face for its prize: what's under the scratch-off.
export function face(id, prize, seed) {
  const c = CARDS[id];
  const rand = seeded(seed);
  const list = amounts(id);
  if (c.layout === 'symbol') {
    const decoys = c.symbol === '7' ? ['🍒', '🔔', '🍋', '⭐', '🍀', '💎'] : ['🪙', '💎', '👑', '🏆', '⭐', '🍀'];
    let mult = 1;
    let base = prize;
    if (c.multiplier && prize) {
      const options = [1, 2, 5, 10].filter(m => prize % m === 0 && list.some(a => a <= prize / m));
      mult = pickOf(rand, options);
      base = prize / mult;
    } else if (c.multiplier) mult = pickOf(rand, [1, 2, 5, 10]);
    const wins = prize ? split(rand, base, list, 3) : [];
    const spots = [...wins.map(a => ({ s: c.symbol, a, win: true }))];
    while (spots.length < c.spots) spots.push({ s: pickOf(rand, decoys), a: pickOf(rand, list), win: false });
    return { kind: 'symbol', mult: c.multiplier ? mult : null, spots: shuffle(rand, spots) };
  }
  if (c.layout === 'match3') {
    // Nine amounts; the prize three times, nothing else three times.
    const cells = prize ? [prize, prize, prize] : [];
    const counts = new Map(cells.length ? [[prize, 3]] : []);
    while (cells.length < 9) {
      const a = pickOf(rand, list);
      if ((counts.get(a) || 0) >= 2) continue;
      counts.set(a, (counts.get(a) || 0) + 1);
      cells.push(a);
    }
    return { kind: 'match3', cells: shuffle(rand, cells) };
  }
  if (c.layout === 'numbers') {
    const pool = shuffle(rand, Array.from({ length: 60 }, (_, i) => i + 1));
    const winning = pool.slice(0, c.winning);
    const others = pool.slice(c.winning);
    const wins = prize ? split(rand, prize, list, 3) : [];
    const yours = wins.map((a, i) => ({ n: winning[i % winning.length], a, win: true }));
    let k = 0;
    while (yours.length < c.yours) yours.push({ n: others[k++], a: pickOf(rand, list), win: false });
    return { kind: 'numbers', winning, yours: shuffle(rand, yours) };
  }
  if (c.layout === 'bingo') {
    // A 5×5 card of 1-75 (free centre), 24 called numbers; the prize's line
    // complete (a row, a column or a diagonal) and no other.
    const cols = [0, 1, 2, 3, 4].map(col => shuffle(rand, Array.from({ length: 15 }, (_, i) => col * 15 + i + 1)).slice(0, 5));
    const grid = Array.from({ length: 5 }, (_, r) => cols.map(col => col[r]));
    grid[2][2] = 0;
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(grid[i].map((_, j) => [i, j]), grid.map((_, j) => [j, i]));
    lines.push([0, 1, 2, 3, 4].map(i => [i, i]), [0, 1, 2, 3, 4].map(i => [i, 4 - i]));
    const complete = called => lines.filter(line => line.every(([r, c2]) => !grid[r][c2] || called.has(grid[r][c2])));
    for (let attempt = 0; attempt < 400; attempt++) {
      const called = new Set();
      let line = null;
      if (prize) {
        line = pickOf(rand, lines);
        for (const [r, c2] of line) if (grid[r][c2]) called.add(grid[r][c2]);
      }
      const all = shuffle(rand, Array.from({ length: 75 }, (_, i) => i + 1));
      for (const n of all) {
        if (called.size >= 24) break;
        if (called.has(n)) continue;
        called.add(n);
        if (complete(called).length > (prize ? 1 : 0)) called.delete(n);
      }
      if (called.size === 24 && complete(called).length === (prize ? 1 : 0)) return { kind: 'bingo', grid, called: shuffle(rand, [...called]), line, prize };
    }
    return { kind: 'bingo', grid, called: [], line: null, prize };
  }
  if (c.layout === 'slots') {
    // Rows of three pictures and a prize each: the prize's rows three alike,
    // no other row.
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rows = wins.map(a => ({ s: Array(3).fill(pickOf(rand, c.symbols)), a, win: true }));
    while (rows.length < c.lines) {
      const s = [pickOf(rand, c.symbols), pickOf(rand, c.symbols), pickOf(rand, c.symbols)];
      if (s[0] === s[1] && s[1] === s[2]) continue;
      rows.push({ s, a: pickOf(rand, list), win: false });
    }
    return { kind: 'slots', rows: shuffle(rand, rows) };
  }
  if (c.layout === 'beat') {
    // The dealer's number (6-17 of 1-20); winning rows above it, the rest at or under.
    const dealer = 6 + Math.floor(rand() * 12);
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rows = wins.map(a => ({ n: dealer + 1 + Math.floor(rand() * (20 - dealer)), a }));
    while (rows.length < c.rows) rows.push({ n: 1 + Math.floor(rand() * dealer), a: pickOf(rand, list) });
    return { kind: 'beat', dealer, rows: shuffle(rand, rows) };
  }
  if (c.layout === 'treasure') {
    // Twelve digs; the prize's treasure three times, every other at most twice.
    const key = tiersOf(id).map((t, i) => ({ s: TREASURES[i], a: t.prize }));
    const hit = key.find(k => k.a === prize);
    const cells = hit ? [hit.s, hit.s, hit.s] : [];
    const counts = new Map(hit ? [[hit.s, 3]] : []);
    const pool = [...TREASURES, '🪨', '🦴'];
    while (cells.length < 12) {
      const s = pickOf(rand, pool);
      if ((counts.get(s) || 0) >= 2) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
      cells.push(s);
    }
    return { kind: 'treasure', key, cells: shuffle(rand, cells) };
  }
  if (c.layout === 'dice') {
    const pair = total => {
      const a = Math.max(1, total - 6) + Math.floor(rand() * (Math.min(6, total - 1) - Math.max(1, total - 6) + 1));
      return [a, total - a];
    };
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rounds = wins.map(a => {
      const them = 2 + Math.floor(rand() * 10);
      return { you: pair(them + 1 + Math.floor(rand() * (12 - them))), them: pair(them), a };
    });
    while (rounds.length < c.rounds) {
      const you = 2 + Math.floor(rand() * 11);
      rounds.push({ you: pair(you), them: pair(you + Math.floor(rand() * (13 - you))), a: pickOf(rand, list) });
    }
    return { kind: 'dice', rounds: shuffle(rand, rounds) };
  }
  if (c.layout === 'wheel') {
    // Twelve slices: every prize once and four 0s; the pointer on the prize's.
    const slices = shuffle(rand, [...list, 0, 0, 0, 0]);
    const at = prize ? slices.indexOf(prize) : pickOf(rand, slices.map((v, i) => (v ? -1 : i)).filter(i => i >= 0));
    return { kind: 'wheel', slices, at };
  }
  return null;
}

// What a face pays, read from the face alone (the tests check it equals the
// prize the card was bought with).
export function facePays(id, f) {
  if (f.kind === 'symbol') return f.spots.filter(s => s.win).reduce((s, x) => s + x.a, 0) * (f.mult || 1);
  if (f.kind === 'match3') {
    const counts = new Map();
    for (const a of f.cells) counts.set(a, (counts.get(a) || 0) + 1);
    return [...counts].filter(([, n]) => n >= 3).reduce((s, [a]) => s + a, 0);
  }
  if (f.kind === 'numbers') return f.yours.filter(y => f.winning.includes(y.n)).reduce((s, y) => s + y.a, 0);
  if (f.kind === 'bingo') return f.line ? f.prize : 0;
  if (f.kind === 'slots') return f.rows.filter(r => r.s[0] === r.s[1] && r.s[1] === r.s[2]).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'beat') return f.rows.filter(r => r.n > f.dealer).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'treasure') {
    const counts = new Map();
    for (const s of f.cells) counts.set(s, (counts.get(s) || 0) + 1);
    return f.key.filter(k => (counts.get(k.s) || 0) >= 3).reduce((s, k) => s + k.a, 0);
  }
  if (f.kind === 'dice') return f.rounds.filter(r => r.you[0] + r.you[1] > r.them[0] + r.them[1]).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'wheel') return f.slices[f.at] || 0;
  return 0;
}

// Buying: the cost now; the prize goes in once it's scratched (revealScratch).
export function buyScratch(account, { id, card }, now = new Date(), { extra = 0, rand = cryptoRand, seed = randomInt(2 ** 31) } = {}) {
  const c = CARDS[card];
  if (!c) return { error: 'game' };
  const own = account.ledger.reduce((s, e) => s + e.amount, 0);
  if (c.price > own + extra) return { error: 'funds' };
  const t = now.toISOString();
  const ticket = { id, t, game: `scratch:${card}`, card, cost: c.price, prize: drawPrize(card, rand), seed, status: 'open' };
  return { account: { ...account, updated: t, ledger: [...account.ledger, { id: `lotto-${id}`, t, kind: 'lottery', amount: -c.price }], tickets: [ticket, ...(account.tickets || [])] }, ticket };
}

// Scratched: the prize paid in (taxed like any lottery prize over NT$5,000).
export function revealScratch(account, ticketId, now = new Date()) {
  const ticket = (account.tickets || []).find(x => x.id === ticketId);
  if (!ticket || ticket.status !== 'open' || !ticket.card) return account;
  const net = ticket.prize > 5_000 ? Math.round(ticket.prize * 0.796) : ticket.prize;
  const t = now.toISOString();
  const ledger = net > 0 && !account.ledger.some(e => e.id === `prize-${ticketId}`) ? [...account.ledger, { id: `prize-${ticketId}`, t, kind: 'prize', amount: net }] : account.ledger;
  return { ...account, updated: t, ledger, tickets: account.tickets.map(x => (x.id === ticketId ? { ...x, status: 'settled', gross: x.prize, prize: net, settledAt: t } : x)) };
}
