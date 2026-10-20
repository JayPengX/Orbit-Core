// One-off (2026-10-20): which one-time wallet fixes would still do anything
// if every Pass were read now. Prints counts only (the log is public).
//   node tools/once/wallet-markers.mjs <d1-json-export>
import { readFileSync } from 'node:fs';
import { parseWallet, paydayEntries, REBASE, LOCK_SINCE } from '../../eco.js';
import { WEEKLY_FROM } from '../../kit/loan.mjs';

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')).flatMap(r => r.results || []);
const now = Date.now();
const by = coll => rows.filter(r => r.coll === coll);
const n = {};
const add = (k, v = 1) => (n[k] = (n[k] || 0) + v);
const OLD = new Set(['saver', 'steady', 'comfort', 'wealthy', 'rich', 'multi', 'tycoon'].map(id => `eco:rank:${id}`));
const NEW = { thrifty: 3_000, solid: 5_000, welloff: 10_000, affluent: 20_000, tenmil: 50_000, hundredmil: 100_000 };
for (const r of by('eco-wallets')) {
  const w = parseWallet(r.payload);
  if (!w) { add('wallets unreadable'); continue; }
  add('wallets');
  const ids = new Set(w.entries.map(e => e.id));
  const last = Math.max(0, ...Object.values(w.apps || {}).map(a => a.last || 0));
  if (last < Date.UTC(2026, 9, 19, 16)) add('wallets not used since 2026-10-20 00:00 TPE');
  if (!w.entries.length && !Object.keys(w.apps || {}).length) add('wallets never used');
  let due;
  try { due = paydayEntries(w, now); } catch (e) { add(`paydayEntries threw: ${e.message}`); continue; }
  const pend = id => due.some(e => (typeof id === 'string' ? e.id === id : id.test(e.id)));
  if (pend(REBASE.id)) add('PENDING eco:rebase:v3');
  if (pend('eco:rebase:v3fix')) add('PENDING eco:rebase:v3fix');
  if (pend('eco:odback:v3')) add('PENDING eco:odback:v3');
  if (pend('eco:topup:v12')) add('PENDING eco:topup:v12');
  if (pend('eco:plusrefund:v1')) add('PENDING eco:plusrefund:v1');
  if (pend(/^odds:tax-|^eco:untax-/)) add('PENDING back-tax');
  if (pend(/^eco:pay:/)) add('PENDING pre-weekly monthly pay');
  if (pend(/^eco:od:/)) add('PENDING overdraft interest (ongoing)');
  if (due.some(e => /^eco:rank:/.test(e.id) && e.amount < (NEW[e.note] || 0))) add('PENDING rank reward reduced by old-level credit');
  if (ids.has(REBASE.id)) add('has eco:rebase:v3 (reset-owed overdraft rule applies)');
  if ([...ids].some(id => /^eco:untax-/.test(id))) add('has eco:untax marks');
  if ([...ids].some(id => /^eco:plus:|^eco:plusrefund/.test(id))) add('has Plus history');
  if (w.created < WEEKLY_FROM) add('created before weekly pay');
  // Old-level credit still to use: what old levels paid, less what new ones took.
  let credit = w.entries.filter(e => OLD.has(e.id)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  for (const [id, reward] of Object.entries(NEW)) { const e = w.entries.find(x => x.id === `eco:rank:${id}`); if (e) credit -= reward - (Number(e.amount) || 0); }
  if (credit > 0) add('old-level credit left (would cut a future level reward)');
  // A pre-lock-down Play stake never paid nor refunded.
  for (const e of w.entries) {
    const slip = /^odds:stake-(.+)$/.exec(e.id)?.[1];
    if (slip && e.t < LOCK_SINCE && !ids.has(`odds:payout-${slip}`) && !ids.has(`odds:refund-${slip}`)) { add('pre-lock-down unpaid stakes'); break; }
  }
}
// Open Play slips that still carry Plus's 1.5 boost.
for (const r of by('odds-open')) {
  let d; try { d = JSON.parse(r.payload); } catch { continue; }
  const slip = d?.slip || d;
  if (d?.state === 'open' && Number(slip?.boost) > 1) add('open slips with Plus boost');
}
const verified = new Set(by('stock-verified').map(r => r.id));
for (const r of by('stock-study-accounts')) if (!verified.has(r.id)) add('stock accounts never checked (pre-lock-down carve-out)');
console.log(JSON.stringify(n, null, 1));
