// The weekly pay and 急難紓困, the rules alone (no page, no storage): one
// copy for the kit (orbit.mjs re-exports them) and the Worker (eco.js),
// which alone writes the entries.
//
// 急難紓困 (one-off relief, RELIEF): NT$5,000 for someone with nothing:
// cash and stocks at cost together under NT$2,000, and the next payday
// more than 2 days away. At most once every 13 weeks and 3 times a Taiwan
// year, and it stays on the record (`eco:relief:<Monday>`).
//
// There's no lending here: a broker doesn't make personal loans, so the
// only borrowing is 融資 against the shares it buys (Securities).

const TPE = 8 * 3_600_000;
const DAY = 86_400_000;
export const WEEK = 7 * DAY;

// The weekly pay (eco.js pays it each Monday, Taipei time).
export const PAY_WEEK = 10_000;

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

// Can this account get relief now (`worth`: cash and stocks at cost).
export function reliefCheck(wallet, worth, now = Date.now()) {
  const got = (wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'relief').sort((a, b) => a.t - b.t);
  const year = new Date(now + TPE).toISOString().slice(0, 4);
  const last = got.at(-1);
  if (got.some(e => e.id === `eco:relief:${mondayId(now)}`) || (last && now - last.t < RELIEF.everyWeeks * WEEK)) return { ok: false, why: 'cooldown', until: last ? last.t + RELIEF.everyWeeks * WEEK : null };
  if (got.filter(e => new Date(e.t + TPE).toISOString().slice(0, 4) === year).length >= RELIEF.perYear) return { ok: false, why: 'year' };
  if (nextPayday(now) - now <= RELIEF.paydayDays * DAY) return { ok: false, why: 'payday', until: nextPayday(now) };
  if (!(worth < RELIEF.under)) return { ok: false, why: 'worth' };
  return { ok: true };
}
export const reliefEntry = now => ({ id: `eco:relief:${mondayId(now)}`, t: now, app: 'eco', kind: 'relief', amount: RELIEF.amount });
