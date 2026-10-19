// 信貸 and 急難紓困, the rules alone (no page, no storage): one copy for the
// kit (quadra.mjs re-exports them) and the Worker (eco.js), which alone
// writes the entries. Modelled on how a Taiwan bank and a 社會局 work:
//
// 信貸 (an unsecured personal loan, LOAN):
//   - Who: an account at least 4 weeks old (one from before weekly pay
//     counts), one loan at a time, no 催收 now and none settled in the last
//     52 weeks (a 聯徵 record).
//   - Limit: NT$100,000 to start, +NT$50,000 per loan repaid with no late
//     week, up to 22× monthly pay (the DBR 22 rule) ≈ NT$950,000. Its
//     installment can't take more than half the weekly pay (收支比).
//   - Price: 12% a year to start, 1 point less per clean loan (6% at best),
//     1 point more per late week ever (16% at most, the legal cap); after a
//     default, 16%. A NT$3,000 開辦費 comes out of the money lent. Shown as
//     總費用年百分率 before you sign.
//   - Repayment: equal weekly installments over 1, 2, 3 or 5 years, taken
//     every Monday right after the pay, and whenever money comes in while one
//     is overdue (a 薪轉戶's auto-debit). Paying it all off early in the
//     first year costs 2% of what's left (提前清償違約金).
//   - Late: an installment the balance can't cover is late: 違約金 at 10% of
//     the rate plus 遲延利息 on what's overdue, once for each late installment.
//   - Default: 3 installments overdue → 催收. The whole loan falls due
//     (喪失期限利益), the cash in the account is taken toward it (抵銷), then
//     a third of every weekly pay (強制執行, 1/3 of wages) until it's paid,
//     with interest running at the loan's rate. Paying it all off ends it.
//
// 急難紓困 (one-off relief, RELIEF): NT$5,000 for someone with nothing:
// cash, stocks at cost and open bets together under NT$2,000, nothing owed
// in 催收, and the next payday more than 2 days away. At most once every
// 13 weeks and 3 times a Taiwan year, and it stays on the record.
//
// Entries (app 'eco', ids fixed so nothing counts twice), for loan id L:
//   eco:loan:L           +principal   note `principal|apr bp|weeks`
//   eco:loanfee:L        −開辦費
//   eco:loanpay:L:n      −installment n
//   eco:loanlate:L:w     −違約金 and 遲延利息 for week w (a missed week)
//   eco:loanbad:L        −cash taken at default   note what's still owed
//   eco:loangar:L:Monday −a third of that week's pay   note what's still owed
//   eco:loanoff:L        −everything left (paid off, early or in 催收)
//   eco:relief:Monday    +relief

const TPE = 8 * 3_600_000;
const DAY = 86_400_000;
export const WEEK = 7 * DAY;

// The weekly pay (eco.js pays it each Monday, Taipei time), from the week of
// WEEKLY_FROM (Monday 2026-10-19).
export const PAY_WEEK = 10_000;
export const WEEKLY_FROM = Date.parse('2026-10-18T16:00:00Z');
// An account from before weekly pay (raised to the new opening money, or
// made before it): it can borrow without the 4 weeks' wait.
export const veteran = wallet => (wallet?.entries || []).some(e => e.id === 'eco:topup:v12') || (Number.isFinite(wallet?.created) && wallet.created < WEEKLY_FROM);

export const LOAN = {
  min: 50_000,
  base: 100_000,
  step: 50_000,
  cap: 950_000,
  fee: 3_000,
  // Terms in weeks: 1, 2, 3 and 5 years.
  terms: [52, 104, 156, 260],
  apr: { start: 0.12, best: 0.06, max: 0.16 },
  // 收支比: an installment can take at most this share of the weekly pay.
  shareOfPay: 0.5,
  minAgeDays: 28,
  // 提前清償違約金: paying off within `earlyWeeks` costs `earlyFee` of what's left.
  earlyWeeks: 52,
  earlyFee: 0.02,
  // 違約金: this share of the rate on what's overdue, on top of 遲延利息.
  lateShare: 0.1,
  missesToDefault: 3,
  garnish: 1 / 3,
  banWeeks: 52
};

export const RELIEF = { amount: 5_000, under: 2_000, everyWeeks: 13, perYear: 3, paydayDays: 2 };

// The Monday (Taipei) a moment's week starts, as a UTC timestamp.
export function weekStart(t) {
  const d = new Date(t + TPE);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - TPE;
}
export const mondayId = t => new Date(weekStart(t) + TPE).toISOString().slice(0, 10);
// The next weekly payday: next Monday 00:00 Taipei.
export const nextPayday = (now = Date.now()) => weekStart(now) + WEEK;

const round = x => Math.round(x);

// The weekly installment and the schedule: balance after each installment.
export function schedule(principal, apr, weeks) {
  const r = apr / 52;
  const pay = r ? Math.ceil((principal * r) / (1 - (1 + r) ** -weeks)) : Math.ceil(principal / weeks);
  const out = [];
  let bal = principal;
  for (let n = 1; n <= weeks; n++) {
    const interest = bal * r;
    const amount = n === weeks ? round(bal + interest) : pay;
    bal = Math.max(0, bal + interest - amount);
    out.push({ n, amount, interest: round(interest), balance: round(bal) });
  }
  return { installment: pay, rows: out };
}

// 總費用年百分率: the yearly rate at which what you get (principal less the
// 開辦費) equals every installment, discounted weekly.
export function totalApr(principal, apr, weeks, fee = LOAN.fee) {
  const rows = schedule(principal, apr, weeks).rows;
  const got = principal - fee;
  const pv = r => rows.reduce((sum, row) => sum + row.amount / (1 + r) ** row.n, 0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > got) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 52 * 10_000) / 10_000;
}

const ecoEntries = wallet => (wallet?.entries || []).filter(e => e.app === 'eco' && typeof e.id === 'string');
const parseTerms = note => {
  const [p, bp, w] = String(note || '').split('|').map(Number);
  return Number.isFinite(p) && Number.isFinite(bp) && Number.isFinite(w) && w > 0 ? { principal: p, apr: bp / 10_000, weeks: w } : null;
};

// Every loan the wallet holds, oldest first, with where each stands.
export function loans(wallet) {
  const eco = ecoEntries(wallet);
  const out = [];
  for (const e of eco) {
    if (e.kind !== 'loan' || !e.id.startsWith('eco:loan:')) continue;
    const id = e.id.slice(9);
    const terms = parseTerms(e.note);
    if (!terms) continue;
    const mine = eco.filter(x => x.id.startsWith(`eco:loanpay:${id}:`) || x.id.startsWith(`eco:loanlate:${id}:`) || x.id.startsWith(`eco:loangar:${id}:`) || x.id === `eco:loanbad:${id}` || x.id === `eco:loanoff:${id}`);
    const paid = mine.filter(x => x.kind === 'loanpay').length;
    const lates = mine.filter(x => x.kind === 'loanlate');
    const bad = mine.find(x => x.kind === 'loanbad') || null;
    const gars = mine.filter(x => x.kind === 'loangar').sort((a, b) => (a.id < b.id ? -1 : 1));
    const off = mine.find(x => x.kind === 'loanoff') || null;
    const owedAfterBad = bad ? Number(gars.at(-1)?.note ?? bad.note) || 0 : 0;
    const settled = Boolean(off) || paid >= terms.weeks || (bad && owedAfterBad <= 0);
    const settledAt = !settled ? null : off ? off.t : bad ? (gars.at(-1)?.t ?? bad.t) : (mine.filter(x => x.kind === 'loanpay').at(-1)?.t ?? e.t);
    out.push({ id, t: e.t, ...terms, ...schedule(terms.principal, terms.apr, terms.weeks), paid, lates: lates.length, lateWeeks: new Set(lates.map(x => Number(x.id.split(':').at(-1)))), bad, gars, owedAfterBad, settled, settledAt });
  }
  return out.sort((a, b) => a.t - b.t);
}
export const activeLoan = wallet => loans(wallet).find(l => !l.settled) || null;

// Installments due by `now` (the nth on the nth Monday after the loan).
export const dueCount = (loan, now) => Math.max(0, Math.min(loan.weeks, Math.floor((weekStart(now) - weekStart(loan.t)) / WEEK)));
const balanceAfter = (loan, k) => (k <= 0 ? loan.principal : loan.rows[Math.min(k, loan.weeks) - 1].balance);
const overdueOf = (loan, now) => loan.rows.slice(loan.paid, dueCount(loan, now)).reduce((sum, r) => sum + r.amount, 0);

// What the loan still costs to clear now: overdue installments in full and
// the principal not yet due (in 催收, what's owed).
export function loanOwed(loan, now = Date.now()) {
  if (!loan || loan.settled) return 0;
  if (loan.bad) return loan.owedAfterBad;
  return round(overdueOf(loan, now) + balanceAfter(loan, Math.max(loan.paid, dueCount(loan, now))));
}
// Paying it all off now: what's owed, plus 2% of the principal left in the first year.
export function payoffAmount(loan, now = Date.now()) {
  const owed = loanOwed(loan, now);
  if (!owed || loan.bad) return owed;
  const early = now - loan.t < LOAN.earlyWeeks * WEEK ? round(balanceAfter(loan, Math.max(loan.paid, dueCount(loan, now))) * LOAN.earlyFee) : 0;
  return owed + early;
}
// Everything owed across the wallet's loans (net worth counts it against you).
export const debtOf = (wallet, now = Date.now()) => loans(wallet).reduce((sum, l) => sum + loanOwed(l, now), 0);

// The account's credit, from its record: the rate and the limit it gets now.
export function credit(wallet, now = Date.now()) {
  const all = loans(wallet);
  const clean = all.filter(l => l.settled && !l.bad && !l.lates).length;
  const lates = all.reduce((sum, l) => sum + l.lates, 0);
  const bads = all.filter(l => l.bad);
  const lastBad = bads.filter(l => l.settled).map(l => l.settledAt).sort((a, b) => b - a)[0];
  const apr = bads.length ? LOAN.apr.max : Math.min(LOAN.apr.max, Math.max(LOAN.apr.best, LOAN.apr.start - 0.01 * clean + 0.01 * lates));
  const limit = bads.length ? LOAN.base : Math.min(LOAN.cap, LOAN.base + LOAN.step * clean);
  const bannedUntil = lastBad ? lastBad + LOAN.banWeeks * WEEK : null;
  return { apr: Math.round(apr * 10_000) / 10_000, limit, clean, lates, defaults: bads.length, bannedUntil: bannedUntil && bannedUntil > now ? bannedUntil : null, inCollection: all.some(l => l.bad && !l.settled) };
}

// The most a term allows: the limit, and an installment of at most half the pay.
export function maxFor(apr, weeks, limit) {
  const r = apr / 52;
  const cap = LOAN.shareOfPay * PAY_WEEK;
  const byPay = r ? (cap * (1 - (1 + r) ** -weeks)) / r : cap * weeks;
  return Math.max(0, Math.min(limit, Math.floor(byPay / 1_000) * 1_000));
}

// Can this account borrow now, and why not.
export function canBorrow(wallet, now = Date.now(), { old = veteran(wallet) } = {}) {
  const c = credit(wallet, now);
  if (activeLoan(wallet)) return { ok: false, why: 'active', credit: c };
  if (c.inCollection) return { ok: false, why: 'collection', credit: c };
  if (c.bannedUntil) return { ok: false, why: 'record', until: c.bannedUntil, credit: c };
  const age = Number.isFinite(wallet?.created) ? now - wallet.created : 0;
  if (!old && age < LOAN.minAgeDays * DAY) return { ok: false, why: 'new', until: wallet.created + LOAN.minAgeDays * DAY, credit: c };
  return { ok: true, credit: c };
}
// A loan offer for `amount` over `weeks`: the terms, or why it's refused.
export function loanOffer(wallet, amount, weeks, now = Date.now(), opts = {}) {
  const can = canBorrow(wallet, now, opts);
  if (!can.ok) return { ok: false, why: can.why, until: can.until };
  if (!LOAN.terms.includes(weeks)) return { ok: false, why: 'term' };
  const principal = Math.round(Number(amount) / 1_000) * 1_000;
  const max = maxFor(can.credit.apr, weeks, can.credit.limit);
  if (!(principal >= LOAN.min) || principal > max) return { ok: false, why: 'amount', min: LOAN.min, max };
  const plan = schedule(principal, can.credit.apr, weeks);
  const total = plan.rows.reduce((sum, r) => sum + r.amount, 0);
  return { ok: true, principal, weeks, apr: can.credit.apr, fee: LOAN.fee, installment: plan.installment, total, cost: total - principal + LOAN.fee, totalApr: totalApr(principal, can.credit.apr, weeks), max };
}
export const loanEntries = (offer, now, id = now.toString(36)) => [
  { id: `eco:loan:${id}`, t: now, app: 'eco', kind: 'loan', amount: offer.principal, note: `${offer.principal}|${Math.round(offer.apr * 10_000)}|${offer.weeks}` },
  { id: `eco:loanfee:${id}`, t: now, app: 'eco', kind: 'loanfee', amount: -offer.fee }
];

// What falls due on the loan now, given the pool's balance (the Worker runs
// it with the payday, after the pay): installments collected while the
// balance covers them, a late week for each one missed, 催收 at the third
// overdue, then a third of each week's pay. Entries dated `now`.
export function loanDue(wallet, pool, now = Date.now()) {
  const loan = activeLoan(wallet);
  if (!loan) return [];
  const out = [];
  const have = new Set(ecoEntries(wallet).map(e => e.id));
  if (loan.bad) {
    // 催收: each Monday since the default, a third of the pay; interest runs.
    let owed = loan.owedAfterBad;
    const r = loan.apr / 52;
    const take = round(PAY_WEEK * LOAN.garnish);
    for (let m = weekStart(loan.bad.t) + WEEK, n = 0; m <= now && owed > 0 && n < 520; m += WEEK, n++) {
      const id = `eco:loangar:${loan.id}:${mondayId(m)}`;
      if (have.has(id)) {
        owed = Number(loan.gars.find(g => g.id === id)?.note) || owed;
        continue;
      }
      owed = round(owed * (1 + r));
      const paid = Math.min(owed, take);
      owed -= paid;
      out.push({ id, t: now, app: 'eco', kind: 'loangar', amount: -paid, note: String(owed) });
    }
    return out;
  }
  const due = dueCount(loan, now);
  let paid = loan.paid;
  // Collected in order while the balance covers the next one.
  while (paid < due && pool >= loan.rows[paid].amount) {
    const row = loan.rows[paid];
    out.push({ id: `eco:loanpay:${loan.id}:${row.n}`, t: now, app: 'eco', kind: 'loanpay', amount: -row.amount });
    pool -= row.amount;
    paid++;
  }
  // A late week for each due week still unpaid and not yet marked.
  const overdue = loan.rows.slice(paid, due).reduce((sum, r) => sum + r.amount, 0);
  for (let w = paid + 1; w <= due; w++) {
    if (loan.lateWeeks.has(w)) continue;
    const fee = Math.max(1, round((overdue * loan.apr * (1 + LOAN.lateShare)) / 52));
    out.push({ id: `eco:loanlate:${loan.id}:${w}`, t: now, app: 'eco', kind: 'loanlate', amount: -fee });
    pool -= fee;
  }
  if (due - paid >= LOAN.missesToDefault) {
    // 喪失期限利益: all of it falls due; the cash in the account goes toward it.
    const owed = round(overdue + balanceAfter(loan, due));
    const seized = Math.max(0, Math.min(owed, Math.floor(pool)));
    out.push({ id: `eco:loanbad:${loan.id}`, t: now, app: 'eco', kind: 'loanbad', amount: -seized, note: String(owed - seized) });
  }
  return out;
}

// ---- 急難紓困 ------------------------------------------------------------------------------

// Can this account get relief now (`worth`: cash, stocks at cost and open
// bets, less nothing: debts don't count, as at a 社會局).
export function reliefCheck(wallet, worth, now = Date.now()) {
  const got = ecoEntries(wallet).filter(e => e.kind === 'relief').sort((a, b) => a.t - b.t);
  const year = new Date(now + TPE).toISOString().slice(0, 4);
  const last = got.at(-1);
  if (got.some(e => e.id === `eco:relief:${mondayId(now)}`) || (last && now - last.t < RELIEF.everyWeeks * WEEK)) return { ok: false, why: 'cooldown', until: last ? last.t + RELIEF.everyWeeks * WEEK : null };
  if (got.filter(e => new Date(e.t + TPE).toISOString().slice(0, 4) === year).length >= RELIEF.perYear) return { ok: false, why: 'year' };
  if (credit(wallet, now).inCollection) return { ok: false, why: 'collection' };
  if (nextPayday(now) - now <= RELIEF.paydayDays * DAY) return { ok: false, why: 'payday', until: nextPayday(now) };
  if (!(worth < RELIEF.under)) return { ok: false, why: 'worth' };
  return { ok: true };
}
export const reliefEntry = now => ({ id: `eco:relief:${mondayId(now)}`, t: now, app: 'eco', kind: 'relief', amount: RELIEF.amount });

// Play's money in bets still open (a stake with no payout or refund yet).
export function openStakes(wallet) {
  const entries = wallet?.entries || [];
  const ids = new Set(entries.map(e => e.id));
  return entries.filter(e => e.kind === 'stake' && typeof e.id === 'string' && e.id.startsWith('odds:stake-') && !ids.has(`odds:payout-${e.id.slice(11)}`) && !ids.has(`odds:refund-${e.id.slice(11)}`)).reduce((sum, e) => sum - e.amount, 0);
}
