// ---- ops.js: the proxy watching itself ----
// What the admin panel's 系統 shows and what tells the owner when the bill
// moves (the owner, 2026-10-14: more monitoring; alerts; pace it out).
//
//   - Heartbeats: every cron job (the builders, settling, the lottery,
//     Kambi's watch, the notices, Weather's scoring, the capacity check, F1's
//     lap log) leaves one row in D1 (`beats`: when it last ran, whether it
//     worked, how long it took, a short note, how many failures in a row).
//     One small write a run, far inside D1's 50M rows a month.
//   - The bill's alerts: the guard (guard.js) records the highest of 50%,
//     75%, 90% reached this period, its pace and whether it stopped the
//     proxy. Every ten minutes the cron compares that with what the owner was
//     last told (`guard:told` in KV, written only when there's news) and
//     sends a notice to the account set in the admin panel (`quadra-config`
//     `ops`: { alertAccount }), on the first of its apps with notices on.
//   - The system report (POST /eco admin `system`, and /ops for the repo's
//     workflow): the guard, the pace, the heartbeats, the store's
//     collections, R2's folders, which secrets and bindings are set (never
//     their values).

import { STATE_KEY as GUARD_STATE } from './guard.js';
import { paceOf } from './pace.js';
import { notifyNow } from './push.js';
import { ECO_APPS } from './eco.js';

export const TOLD_KEY = 'guard:told';
export const OPS_DOC = ['quadra-config', 'ops'];
const BEATS = 'CREATE TABLE IF NOT EXISTS beats (job TEXT PRIMARY KEY, at INTEGER NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL, note TEXT NOT NULL, ok_at INTEGER, fails INTEGER NOT NULL DEFAULT 0)';
const made = new WeakSet();
async function beatsTable(db) {
  if (made.has(db)) return;
  await db.prepare(BEATS).run();
  made.add(db);
}

// What a job's result says, short (its counts; never a document).
const noteOf = r => {
  if (r == null) return '';
  try {
    return (typeof r === 'string' ? r : JSON.stringify(r)).slice(0, 160);
  } catch {
    return '';
  }
};
// A failed step inside a job that otherwise ran (a builder's `{ failed }`).
const failedIn = r => !!r && typeof r === 'object' && Object.values(r).some(v => v && typeof v === 'object' && 'failed' in v);

// `fn` run and its heartbeat kept; its result (or its error) passed on.
export async function beat(env, job, fn, now = () => Date.now()) {
  const t = now();
  let r;
  let err = null;
  try {
    r = await fn();
  } catch (e) {
    err = e;
  }
  const ok = !err && !failedIn(r);
  if (env.STORE)
    try {
      await beatsTable(env.STORE);
      const at = now();
      await env.STORE.prepare('INSERT INTO beats (job, at, ok, ms, note, ok_at, fails) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (job) DO UPDATE SET at = ?2, ok = ?3, ms = ?4, note = ?5, ok_at = COALESCE(?6, ok_at), fails = CASE WHEN ?3 = 1 THEN 0 ELSE fails + 1 END')
        .bind(job, at, ok ? 1 : 0, at - t, err ? `error: ${String(err?.message || err)}`.slice(0, 160) : noteOf(r), ok ? at : null, ok ? 0 : 1)
        .run();
    } catch (e) {
      console.log('beat failed', job, String(e?.message || e).slice(0, 120));
    }
  if (err) throw err;
  return r;
}
export async function beats(env) {
  if (!env.STORE) return [];
  await beatsTable(env.STORE);
  const { results } = await env.STORE.prepare('SELECT job, at, ok, ms, note, ok_at, fails FROM beats ORDER BY job').all();
  return results.map(r => ({ job: r.job, at: r.at, ok: !!r.ok, ms: r.ms, note: r.note, okAt: r.ok_at, fails: r.fails }));
}

// ---- The bill's alerts ----
const PCT = v => `${Math.round(v * 100)}%`;
const ZH = { requests: 'Workers 請求', cpuMs: 'Workers CPU', kvRead: 'KV 讀取', kvWrite: 'KV 寫入', kvDelete: 'KV 刪除', kvList: 'KV 列出', kvBytes: 'KV 儲存', doRequests: 'Durable Objects 請求', doBytes: 'Durable Objects 儲存', r2ClassA: 'R2 寫入', r2ClassB: 'R2 讀取', r2Bytes: 'R2 儲存', d1RowsRead: 'D1 讀取', d1RowsWritten: 'D1 寫入', d1Bytes: 'D1 儲存' };
export function billNotice(g, lang) {
  const en = lang === 'en';
  const top = g.top || 'requests';
  const share = g.share?.[top] || 0;
  const pace = g.pace || 0;
  const title = g.stopped
    ? en ? 'Cloudflare: the proxy is stopped until the next period' : 'Cloudflare：代理已停到下個週期'
    : en ? `Cloudflare: ${top} at ${PCT(share)} of the $5 plan` : `Cloudflare：${ZH[top] || top} 已用 ${PCT(share)}`;
  const body = en
    ? `Pace ${pace}${pace ? ` (live refreshes ×${[1, 2, 4, 8][pace]} slower)` : ' (as configured)'}; nothing is billed past $5.`
    : `節流 ${pace}${pace ? `（即時更新放慢 ×${[1, 2, 4, 8][pace]}）` : '（照設定）'}；不會超過 $5。`;
  return { title, body, tag: 'ops:bill', kind: 'bill', url: 'https://jaypengx.github.io/Shared-Proxy/admin/' };
}
// What's news: a higher alert, a stop, or a pace that changed (this period).
export function news(g, told) {
  if (!g?.period) return null;
  const mark = { period: g.period.start, alert: g.alert || 0, pace: g.pace || 0, stopped: !!g.stopped };
  const same = told && told.period === mark.period;
  const before = same ? told : { alert: 0, pace: 0, stopped: false };
  const isNews = mark.alert > before.alert || (mark.stopped && !before.stopped) || mark.pace !== before.pace;
  return isNews ? mark : null;
}
export async function alertAccount(env, deps) {
  const doc = await deps.fsGet(env, ...OPS_DOC).catch(() => null);
  try {
    return doc?.exists ? JSON.parse(doc.payload).alertAccount || '' : '';
  } catch {
    return '';
  }
}
// The account's first app with notices on: told there. 'sent', 'none' (no
// device), 'off'.
export async function tell(env, account, message) {
  let last = 'none';
  for (const app of Object.keys(ECO_APPS)) {
    last = await notifyNow(env, account, app, 'bill', message).catch(e => `failed ${e?.message || e}`);
    if (last === 'sent') return last;
  }
  return last;
}
export async function tellOwner(env, deps) {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { off: 'no KV' };
  const g = JSON.parse((await kv.get(GUARD_STATE).catch(() => null)) || 'null');
  const told = JSON.parse((await kv.get(TOLD_KEY).catch(() => null)) || 'null');
  const mark = news(g, told);
  if (!mark) return { news: false };
  const account = await alertAccount(env, deps);
  if (!account) return { news: true, told: 'no account set' };
  const r = await tell(env, account, lang => billNotice(g, lang));
  if (r === 'sent' || r === 'none' || r === 'off') await kv.put(TOLD_KEY, JSON.stringify({ ...mark, at: Date.now(), r }));
  return { news: true, told: r, mark };
}

// ---- The system report ----
// The secrets and bindings the proxy runs on: set or not (never a value).
export const SECRETS = ['ECO_TOKEN_SECRET', 'ECO_ADMIN_TOKEN', 'DATA_PUSH_SECRET', 'GEMINI_API_KEY', 'GOOGLE_MAPS_KEY', 'GOOGLE_MAPS_BROWSER_KEY', 'GOOGLE_WEATHER_KEY', 'CWA_KEY', 'MOENV_KEY', 'TDX_CLIENT_ID', 'TDX_CLIENT_SECRET', 'FIREBASE_PRIVATE_KEY'];
export const BINDINGS = ['STORE', 'DATA', 'RATE_LIMIT_KV', 'F1_LOG', 'GEMINI_RELAY', 'GUARD'];
// R2's folders: files and bytes under each top folder (one list a 1,000).
export async function dataFolders(bucket, { pages = 30 } = {}) {
  const out = {};
  let cursor;
  let n = 0;
  do {
    const r = await bucket.list({ cursor, limit: 1000 });
    for (const o of r.objects) {
      const top = o.key.includes('/') ? o.key.slice(0, o.key.indexOf('/')) : '(top)';
      const f = (out[top] ||= { files: 0, bytes: 0, newest: 0 });
      f.files++;
      f.bytes += o.size || 0;
      f.newest = Math.max(f.newest, o.uploaded ? Date.parse(o.uploaded) || +o.uploaded : 0);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor && ++n < pages);
  return { folders: out, more: !!cursor };
}
// (Listing is R2's dearer kind of operation: kept an hour in the edge cache.)
async function foldersKept(env) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request('https://ops.quadra/data-folders');
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  const out = { ...(await dataFolders(env.DATA)), at: Date.now() };
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=3600' } }));
  return out;
}
export async function systemReport(env, deps) {
  const kv = env.RATE_LIMIT_KV;
  const g = kv ? JSON.parse((await kv.get(GUARD_STATE).catch(() => null)) || 'null') : null;
  const told = kv ? JSON.parse((await kv.get(TOLD_KEY).catch(() => null)) || 'null') : null;
  const [pace, rows, store, data, account] = await Promise.all([
    paceOf(env),
    beats(env).catch(e => ({ error: String(e?.message || e) })),
    deps.count ? deps.count(env).catch(e => ({ error: String(e?.message || e) })) : null,
    env.DATA ? foldersKept(env).catch(e => ({ error: String(e?.message || e) })) : null,
    alertAccount(env, deps)
  ]);
  return {
    at: deps.now(),
    guard: g && { at: g.at, armed: g.armed, error: g.error, share: g.share, projected: g.projected, plan: g.plan, top: g.top, pace: g.pace || 0, paceTop: g.paceTop, paceSince: g.paceSince, alert: g.alert || 0, stopped: g.stopped ? { at: g.stopped.at, why: g.stopped.why } : null, period: g.period, partial: g.partial },
    pace,
    told,
    // (Its reference: the first 8 of its id, as the panel shows accounts.)
    alertAccount: account ? account.slice(0, 8) : '',
    beats: rows,
    store,
    data,
    secrets: Object.fromEntries(SECRETS.map(k => [k, !!env[k]])),
    bindings: Object.fromEntries(BINDINGS.map(k => [k, !!env[k]]))
  };
}
