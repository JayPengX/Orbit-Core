// ---- mail-alerts.js: what the admin panel would tell the owner, by mail ----
// (Jay 2026-11-14: "send emails … when there is admin panel related alert
// that I need to know".) The cron (worker.js, every 10 minutes) looks at the
// same things the panel's 健康 and 額度 judge, with the panel's own rules
// (site/admin/ops-watch.mjs, kit/sources.mjs), and mails the owner (mail.js) what
// needs him:
//   - the bill: the proxy stopped, a free amount past 75% (90% red), the
//     forecast to pass it, the guard not running;
//   - a cron job failing 3 times in a row, or 3 times its time late;
//   - a key or binding gone;
//   - an outside source broken (red in 外部來源);
//   - errors: a Worker failing more than 5% of requests, a route's 100
//     server errors in a Taiwan day;
//   - AI: a feature at its day cap (someone was refused), a maker's
//     balance at 25% (10% red);
//   - TDX's month past 80% (95% red).
// Amber in the panel that fixes itself (a slow source, a late job) is never
// mailed: only what's red, and the few ambers above that cost money.
//
// Not spam: a problem must be seen twice in a row (20 minutes) before it's
// mailed (once for the slow checks and a stopped proxy); each is mailed
// once, again only if it turns red or is still there 24 hours later;
// everything due goes in one mail; at most 6 a Taiwan day and one each 30
// minutes (a stopped proxy goes at once); 00:00–07:00 Taiwan waits for 7 AM
// (the panel's 安靜時段, on unless turned off); what was mailed and is fixed
// goes in the next mail, or one 全部恢復正常 when everything mailed is.
// A failed send is tried again 6 hours later. State: kept `mail:alerts`.

import { keptRead, keptPut } from './kept-store.js';
import { STATE_KEY as GUARD_STATE } from './guard.js';
import { paceOf } from './pace.js';
import { beats, SECRETS, BINDINGS } from './ops.js';
import { ADMIN_TOOLS, readDev } from './eco-admin.js';
import { callsSince } from './gemini-use.js';
import { moneyLeft, PROVIDERS } from './ai.js';
import { DEV } from './kit/devconfig.mjs';
import { tdxUse, tdxPoints, tdxPlan } from './transit.js';
import { SOURCES, freshAt, sourceState } from './kit/sources.mjs';
import { JOBS, isLate, errTone } from './site/admin/ops-watch.mjs';
import { alertMail } from './site/admin/mail-look.mjs';
import { mailSettings, sendMail } from './mail.js';
import { SITE } from './kit/domain.mjs';

export const STATE = 'mail:alerts';
export const DAY_MAX = 6;
const GAP = 30 * 60_000;
const AGAIN = 24 * 3_600_000;
const RETRY = 6 * 3_600_000;
const HOUR = 3_600_000;
const twHour = ms => new Date(ms + 8 * HOUR).getUTCHours();
const twDay = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
const pct = v => `${Math.round(v * 100)}%`;
const PROV = { anthropic: 'Claude', openai: 'GPT', google: 'Gemini' };

// Which checks run on this tick: 'fast' every time, 'mid' each half hour, 'slow' each 6 hours.
export function groupsAt(ms) {
  const d = new Date(ms);
  const min = d.getUTCMinutes();
  const out = ['fast'];
  if (min % 30 < 10) out.push('mid');
  if (min < 10 && d.getUTCHours() % 6 === 0) out.push('slow');
  return out;
}

// ---- The checks: [{ id, group, tone, title, detail, go, confirm, now }] ----
// (`mail`: amber worth a mail; red always is.)
async function fast(env, deps, now) {
  const out = [];
  const g = env.RATE_LIMIT_KV ? JSON.parse((await env.RATE_LIMIT_KV.get(GUARD_STATE).catch(() => null)) || 'null') : null;
  const pace = (await paceOf(env).catch(() => ({ pace: 0 }))).pace || 0;
  if (g?.stopped) out.push({ id: 'guard:stopped', tone: 'bad', now: true, title: '代理已停（帳單保護）', detail: `${g.stopped.why || '免費額度快用完'}，所有 App 讀不到資料，直到下個週期。`, go: 'usage' });
  else if (g && !g.armed) out.push({ id: 'guard:off', tone: 'bad', title: '帳單保護沒在運作', detail: '它停了就沒人在額度用完前把代理停下來。', go: 'usage' });
  if (g && (g.alert || 0) >= 2 && !g.stopped) {
    const top = g.top || 'requests';
    out.push({ id: 'guard:alert', tone: g.alert >= 3 ? 'bad' : 'warn', mail: true, title: `Cloudflare 用量過 ${g.alert >= 3 ? '90' : '75'}%`, detail: `用得最多的是 ${top}（${pct(g.share?.[top] || 0)}）${pace ? `，已節流 ${pace} 級` : ''}。`, go: 'usage' });
  }
  if (g?.paceTop >= 0.9 && !g.stopped) out.push({ id: 'guard:forecast', tone: 'bad', title: `Cloudflare 照這速度會用到 ${pct(g.paceTop)}`, detail: g.free ? '推估到今天結束（台灣早上 8 點重算）。' : '推估到月底。', go: 'usage' });
  for (const b of await beats(env).catch(() => [])) {
    if (!JOBS[b.job]) continue;
    const name = JOBS[b.job][0];
    if (!b.ok && b.fails >= 3) out.push({ id: `job:${b.job}`, tone: 'bad', title: `排程「${name}」一直失敗`, detail: `連續 ${b.fails} 次${b.note ? `：${String(b.note).slice(0, 120)}` : ''}`, go: 'health' });
    else if (!pace && isLate(b, now, 3)) out.push({ id: `late:${b.job}`, tone: 'bad', title: `排程「${name}」停了`, detail: `上次跑是 ${Math.round((now - b.at) / 60_000)} 分鐘前。`, go: 'health' });
  }
  const gone = [...SECRETS.filter(k => k !== 'FIREBASE_PRIVATE_KEY' && !env[k]), ...BINDINGS.filter(k => !env[k])];
  if (gone.length) out.push({ id: `secrets:${gone.sort().join(',')}`, tone: 'bad', title: `${gone.length} 個金鑰或綁定沒設定`, detail: gone.join('、'), go: 'health' });
  return out;
}
async function mid(env, deps, now) {
  const out = [];
  const tools = ADMIN_TOOLS;
  const [src, errs, calls, dev, tdx] = await Promise.all([
    tools.sources({ env, deps, body: { days: 1 } }).catch(() => null),
    tools.errors({ env, deps }).catch(() => null),
    callsSince(env, Date.parse(`${twDay(now)}T00:00:00+08:00`)).catch(() => null),
    readDev(env, deps).catch(() => null),
    tdxUse(env, now).catch(() => null)
  ]);
  if (src && !src.rows?.error)
    for (const s of SOURCES) {
      if (sourceState(s, src.rows?.[s.id], freshAt(s, src), src.at) !== 'bad') continue;
      const r = src.rows?.[s.id];
      out.push({ id: `src:${s.id}`, tone: 'bad', confirm: 2, title: `${s.zh.replace(/（.*）/, '')} 壞了`, detail: [s.feeds, r?.err ? `最後的錯誤：${String(r.err).slice(0, 100)}` : ''].filter(Boolean).join(' · '), go: 'health' });
    }
  for (const [name, w] of Object.entries(errs?.workers?.workers || {}))
    if (errTone(w) === 'bad') out.push({ id: `err:${name}`, tone: 'bad', title: `${name} 的錯誤變多`, detail: `24 小時 ${w.errors.toLocaleString()} / ${w.requests.toLocaleString()} 次失敗（${pct(w.errors / w.requests)}）`, go: 'health' });
  for (const [route, n] of Object.entries(errs?.routes || {})) if (n.today >= 100) out.push({ id: `route:${route}`, tone: 'bad', title: `代理 ${route} 今天 ${n.today} 次伺服器錯誤`, detail: `昨天 ${n.yesterday} 次。`, go: 'health' });
  if (calls && dev) {
    const today = {};
    for (const c of calls) today[c.feature] = (today[c.feature] || 0) + 1;
    for (const [key, d] of Object.entries(DEV)) {
      if (!d.ai || !dev[key]) continue;
      const n = d.ai.reduce((a, f) => a + (today[f] || 0), 0);
      if (n >= dev[key]) out.push({ id: `ai-cap:${key}`, tone: 'warn', mail: true, title: `AI「${String(d.zh || key).replace(/（.*）/, '')}」今天的上限用完了`, detail: `${n} / ${dev[key]} 次，之後的人今天用不到。用量突然變多的話，看看是誰在用。`, go: 'usage' });
    }
  }
  if (tdx) {
    const share = tdxPoints(tdx, now).month / tdxPlan(now).month;
    if (share >= 0.8) out.push({ id: 'tdx', tone: share >= 0.95 ? 'bad' : 'warn', mail: true, title: `TDX 這個月的點數用了 ${pct(share)}`, detail: '用完之後公車與鐵路的即時資料會停到下個月。', go: 'usage' });
  }
  return out;
}
async function slow(env, deps, now) {
  const doc = await deps.fsGet(env, 'orbit-config', 'ai-money').catch(() => null);
  let saved = {};
  try {
    if (doc?.exists) saved = JSON.parse(doc.payload);
  } catch {}
  const typed = PROVIDERS.filter(p => saved[p]?.at);
  if (!typed.length) return [];
  const calls = await callsSince(env, Math.max(now - 70 * 86_400_000, Math.min(now - 7 * 86_400_000, ...typed.map(p => saved[p].at)))).catch(() => null);
  if (!calls) return [];
  const left = moneyLeft(saved, calls, now);
  return typed
    .filter(p => left[p].tone)
    .map(p => ({ id: `ai-money:${p}`, tone: left[p].tone, mail: true, title: `${PROV[p]} 的預付餘額剩 ${pct(left[p].left / saved[p].usd)}`, detail: `約 US$${Math.max(0, left[p].left).toFixed(2)}${left[p].days != null ? `，照最近 7 天的速度約 ${left[p].days} 天用完` : ''}。`, go: 'usage' }));
}
const CHECKS = { fast, mid, slow };
const CONFIRM = { fast: 2, mid: 1, slow: 1 };

// ---- What to mail, from what was seen (pure: tests/mail-alerts.test.mjs) ----
// state: { open: { id: { group, tone, title, detail, go, seen, miss, sent, sentTone } }, fixed: [{ id, title }],
//          day, n, last, failAt }
export function plan(prev, seen, ran, now, { quiet = true } = {}) {
  const s = { open: {}, fixed: [], day: '', n: 0, last: 0, failAt: 0, ...structuredClone(prev || {}) };
  const ids = new Set(seen.map(i => i.id));
  // Gone: twice in a row (for a check that ran this time); mailed ones are said to be fixed.
  for (const [id, r] of Object.entries(s.open)) {
    if (ids.has(id) || !ran.includes(r.group)) continue;
    if (++r.miss < 2) continue;
    delete s.open[id];
    if (r.sent) s.fixed.push({ id, title: r.title });
  }
  for (const i of seen) {
    const r = (s.open[i.id] ||= { seen: 0, sent: 0 });
    Object.assign(r, { group: i.group, tone: i.tone, title: i.title, detail: i.detail || '', go: i.go || '', now: !!i.now, miss: 0, seen: r.seen + 1, need: i.now ? 1 : i.confirm || CONFIRM[i.group] || 2 });
  }
  const worse = r => r.sentTone === 'warn' && r.tone === 'bad';
  const due = Object.entries(s.open).filter(([, r]) => r.seen >= r.need && (!r.sent || worse(r) || now - r.sent >= AGAIN));
  const allClear = !Object.values(s.open).some(r => r.sent) && s.fixed.length;
  if (!due.length && !allClear) return { state: s, mail: null };
  const urgent = due.some(([, r]) => r.now && !r.sent);
  if (s.day !== twDay(now)) Object.assign(s, { day: twDay(now), n: 0 });
  const hold = !urgent && ((quiet && twHour(now) < 7) || s.n >= DAY_MAX || now - s.last < GAP || now - s.failAt < RETRY);
  if (hold) return { state: s, mail: null };
  const issues = due.map(([id, r]) => ({ id, tone: r.tone, title: r.title, detail: r.detail, go: r.go, again: !!r.sent && !worse(r) })).sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1));
  return { state: s, mail: { issues, fixed: s.fixed.slice() } };
}
// After the mail went (or didn't).
export function settle(state, mail, ok, now) {
  const s = structuredClone(state);
  if (!ok) return { ...s, failAt: now };
  for (const i of mail.issues) Object.assign(s.open[i.id], { sent: now, sentTone: s.open[i.id].tone });
  return { ...s, fixed: [], n: s.n + 1, last: now, failAt: 0 };
}

// What's wrong right now, every check (the panel's 現在檢查 and the cron's).
export async function gather(env, deps, groups, now = deps.now()) {
  const out = [];
  for (const g of groups) for (const i of await CHECKS[g](env, deps, now).catch(e => (console.log('mail-alerts', g, String(e?.message || e).slice(0, 120)), []))) out.push({ ...i, group: g });
  // Amber that isn't worth a mail stays out.
  return out.filter(i => i.tone === 'bad' || i.mail);
}

// The cron's: look, and mail what's due.
export async function mailAlerts(env, deps, now = deps.now()) {
  const set = await mailSettings(env, deps);
  if (!set.to || !set.on) return { off: !set.to ? 'no address' : 'off' };
  const ran = groupsAt(now);
  const seen = await gather(env, deps, ran, now);
  const { state, mail } = plan(await keptRead(env, STATE), seen, ran, now, set);
  let next = state;
  let sent = null;
  if (mail) {
    const m = alertMail({ ...mail, admin: `${SITE}/Orbit-Core/admin/` });
    try {
      sent = await sendMail(env, { to: set.to, ...m, from: { name: 'Orbit 警示', user: 'alerts' }, kind: 'alert' }, { now });
      next = settle(state, mail, true, now);
    } catch (e) {
      sent = { failed: e.why || String(e?.message || e) };
      next = settle(state, mail, false, now);
    }
  }
  await keptPut(env, STATE, next, 30 * 86_400);
  return { seen: seen.length, mailed: mail ? mail.issues.length + mail.fixed.length : 0, ...(sent?.failed ? { failed: sent.failed } : {}) };
}
// The panel's 郵件 card: what's open now and what was mailed.
export async function alertState(env) {
  const s = (await keptRead(env, STATE)) || {};
  return { open: Object.entries(s.open || {}).map(([id, r]) => ({ id, tone: r.tone, title: r.title, sent: r.sent || 0 })), n: s.n || 0, day: s.day || '', last: s.last || 0, failAt: s.failAt || 0 };
}
