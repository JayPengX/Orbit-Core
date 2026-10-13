// The hard stop on Cloudflare's bill (the owner, 2026-10-13: "not a penny
// more" than the $5 Workers Paid plan). Cloudflare has no spending cap of its
// own: budget alerts only send an email, and past the plan's included amounts
// every request, CPU millisecond and KV operation is billed. So this Worker
// (`quota-guard`, its own cron, no public address) reads the account's real
// use this billing period from Cloudflare's analytics every five minutes and,
// once anything reaches STOP_AT of what the plan includes, takes both proxies
// off the air until the next period:
//   - each one's workers.dev address is turned off (a request that never
//     reaches a Worker isn't a Worker request: nothing billed);
//   - each one's crons are emptied (a cron run is a billed request too),
//     the schedules kept in KV and put back with the address when the new
//     period starts.
// While stopped it looks again every run, so a deploy that turned the address
// back on is turned off again within five minutes (and deploy.yml does it at
// once). The apps' own pages (GitHub Pages) and the nightly packs stay up:
// they open on what the phone has, as on a failed read.
//
// The plan's included amounts (developers.cloudflare.com/workers/platform/
// pricing, read 2026-10-13): 10M requests and 30M CPU ms a month; KV 10M
// reads, 1M writes, 1M deletes, 1M lists, 1 GB stored; Durable Objects 1M
// requests, 400,000 GB-s, 25B rows read, 50M rows written, 5 GB stored;
// Workers Logs 20M events (kept under it by the tomls' head_sampling_rate,
// not counted here: analytics has no count of them). A Durable Object's
// duration and rows aren't counted either: the one there is (F1Log, one
// object) can't reach them in a month even running all of it (31 d × 128 MB
// = 334,800 GB-s).
//
// Analytics' adaptive datasets are sampled estimates, so the stop is at 90%,
// and the period is counted from a day before it starts (UTC midnight of the
// day before PERIOD_DAY): an earlier start only counts more.
//
// Needs CF_GUARD_TOKEN (an API token: Account Analytics Read, Workers Scripts
// Edit) and CF_ACCOUNT_ID, set by deploy.yml from the repo's secrets. Without
// them it is unarmed and says so (the admin panel's 容量).

export const PLAN = {
  requests: 10_000_000,
  cpuMs: 30_000_000,
  kvRead: 10_000_000,
  kvWrite: 1_000_000,
  kvDelete: 1_000_000,
  kvList: 1_000_000,
  kvBytes: 1_000_000_000,
  doRequests: 1_000_000,
  doBytes: 5_000_000_000
};
export const PLAN_ZH = {
  requests: 'Workers 請求',
  cpuMs: 'Workers CPU（毫秒）',
  kvRead: 'KV 讀取',
  kvWrite: 'KV 寫入',
  kvDelete: 'KV 刪除',
  kvList: 'KV 列出',
  kvBytes: 'KV 儲存（位元組）',
  doRequests: 'Durable Objects 請求',
  doBytes: 'Durable Objects 儲存（位元組）'
};
export const STOP_AT = 0.9;
export const WORKERS = ['orbit-workers-proxy', 'sports-proxy'];
export const STATE_KEY = 'guard:state';
// Unreadable this long while armed: stopped too (a bill can't be watched blind).
export const BLIND_MS = 6 * 3_600_000;
const DAY = 86_400_000;
const API = 'https://api.cloudflare.com/client/v4';

// This billing period, [start, end), from the day of the month it renews
// (a 31st in a 30-day month is its last day), counted from the day before.
export function period(now, day) {
  const d = new Date(now);
  const at = (y, m) => Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  let start = at(y, m);
  if (start > now) {
    m -= 1;
    if (m < 0) (m = 11), (y -= 1);
    start = at(y, m);
  }
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12;
  return { start, end: at(ny, nm), from: start - DAY };
}

// Whole UTC days from `from` to `to`, in pieces of at most `n` days (the
// analytics API takes about a month in one ask).
export function chunks(from, to, n = 7) {
  const out = [];
  for (let s = from; s < to; s += n * DAY) out.push([s, Math.min(to, s + n * DAY)]);
  return out;
}
const isoDay = t => new Date(t).toISOString().slice(0, 10);
const isoTime = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

const USE_Q = cpu => `query($a: string!, $s: Time!, $e: Time!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) {
  w: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests${cpu ? ' cpuTimeUs' : ''} } ${cpu ? '' : 'quantiles { cpuTimeP99 } '}dimensions { scriptName } }
  kv: kvOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { requests } dimensions { actionType } }
  d: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { requests } }
} } }`;
const STORE_Q = `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) {
  ks: kvStorageAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { max { byteCount } dimensions { date } }
  ds: durableObjectsStorageGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { max { storedBytes } dimensions { date } }
} } }`;

async function graphql(env, fetcher, query, variables) {
  const res = await fetcher(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`analytics ${res.status}`);
  if (body.errors?.length) {
    const e = new Error(`analytics: ${body.errors.map(x => x.message).join('; ').slice(0, 300)}`);
    e.fields = body.errors.some(x => /cpuTimeUs|unknown field|cannot query field/i.test(x.message || ''));
    throw e;
  }
  const acc = body.data?.viewer?.accounts?.[0];
  if (!acc) throw new Error('analytics: no account (CF_ACCOUNT_ID?)');
  return acc;
}

// The period's use, every count the plan bills that analytics has. CPU
// is the sum of each invocation's own (`cpuTimeUs`); where the API lacks it,
// each day's requests × that day's 99th-percentile CPU (more than it was).
export async function readUse(env, fetcher, now) {
  const day = Number(env.PERIOD_DAY) || 1;
  const p = period(now, day);
  const use = { requests: 0, cpuMs: 0, kvRead: 0, kvWrite: 0, kvDelete: 0, kvList: 0, kvBytes: 0, doRequests: 0, doBytes: 0 };
  let cpuWay = 'sum';
  for (const [s, e] of chunks(p.from, now + 60_000)) {
    const vars = { a: env.CF_ACCOUNT_ID, s: isoTime(s), e: isoTime(e), ds: isoDay(s), de: isoDay(e - 1) };
    let acc;
    try {
      acc = await graphql(env, fetcher, USE_Q(cpuWay === 'sum'), vars);
    } catch (err) {
      if (!err.fields || cpuWay !== 'sum') throw err;
      cpuWay = 'p99';
      acc = await graphql(env, fetcher, USE_Q(false), vars);
    }
    for (const r of acc.w || []) {
      const n = r.sum?.requests || 0;
      use.requests += n;
      use.cpuMs += cpuWay === 'sum' ? (r.sum?.cpuTimeUs || 0) / 1000 : (n * (r.quantiles?.cpuTimeP99 || 0)) / 1000;
    }
    for (const r of acc.kv || []) {
      const k = { read: 'kvRead', write: 'kvWrite', delete: 'kvDelete', list: 'kvList' }[r.dimensions?.actionType];
      if (k) use[k] += r.sum?.requests || 0;
    }
    for (const r of acc.d || []) use.doRequests += r.sum?.requests || 0;
  }
  // What's stored now: the latest day's (summed over namespaces and objects).
  const st = await graphql(env, fetcher, STORE_Q, { a: env.CF_ACCOUNT_ID, ds: isoDay(now - 2 * DAY), de: isoDay(now) });
  const latest = (rows, f) => {
    const last = rows.reduce((m, r) => (r.dimensions?.date > m ? r.dimensions.date : m), '');
    return rows.filter(r => r.dimensions?.date === last).reduce((n, r) => n + (r.max?.[f] || 0), 0);
  };
  use.kvBytes = latest(st.ks || [], 'byteCount');
  use.doBytes = latest(st.ds || [], 'storedBytes');
  use.cpuMs = Math.round(use.cpuMs);
  return { use, period: p, cpuWay };
}

// Each count's share of the plan, the largest, and what's over the stop.
export function judge(use, stopAt = STOP_AT) {
  const share = {};
  for (const k of Object.keys(PLAN)) share[k] = (use[k] || 0) / PLAN[k];
  const over = Object.keys(share).filter(k => share[k] >= stopAt);
  const top = Object.keys(share).reduce((a, b) => (share[b] > share[a] ? b : a));
  return { share, over, top };
}

// Where the period ends up at this pace (the panel's 預估).
export function projected(use, p, now) {
  const f = (p.end - p.from) / Math.max(DAY / 24, now - p.from);
  const out = {};
  for (const k of Object.keys(PLAN)) out[k] = /Bytes$/.test(k) ? use[k] : Math.round((use[k] || 0) * f);
  return out;
}

// ---- Cloudflare's API: a Worker's address and crons ----
async function cf(env, fetcher, method, path, body) {
  const res = await fetcher(`${API}/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(`${method} ${path}: ${res.status} ${(j.errors || []).map(e => e.message).join('; ')}`.slice(0, 300));
  return j.result;
}

// Off the air: the address off, the crons emptied (theirs kept in `saved`).
export async function stopWorker(env, fetcher, name, saved) {
  const sub = await cf(env, fetcher, 'GET', `${name}/subdomain`);
  if (sub?.enabled) await cf(env, fetcher, 'DELETE', `${name}/subdomain`);
  const sch = await cf(env, fetcher, 'GET', `${name}/schedules`);
  const crons = (sch?.schedules || []).map(s => s.cron).filter(Boolean);
  if (crons.length) {
    saved[name] = crons;
    await cf(env, fetcher, 'PUT', `${name}/schedules`, []);
  }
  return { addressWasOn: !!sub?.enabled, crons: crons.length };
}
// Back on: the address, and the crons it had.
export async function startWorker(env, fetcher, name, saved) {
  await cf(env, fetcher, 'POST', `${name}/subdomain`, { enabled: true });
  if (saved?.[name]?.length) await cf(env, fetcher, 'PUT', `${name}/schedules`, saved[name].map(cron => ({ cron })));
}

// One run: read, judge, stop or start, keep the state (KV written only
// when something changed, or hourly for the panel: KV's 1M writes a month).
export async function guardRun(env, { fetcher = fetch, now = Date.now(), kv = env.RATE_LIMIT_KV } = {}) {
  const prev = JSON.parse((await kv.get(STATE_KEY).catch(() => null)) || 'null') || {};
  const armed = !!(env.CF_GUARD_TOKEN && env.CF_ACCOUNT_ID);
  const stopAt = Number(env.STOP_AT) || STOP_AT;
  const state = { ...prev, at: now, armed, stopAt, plan: PLAN };
  if (!armed) {
    state.error = 'CF_GUARD_TOKEN / CF_ACCOUNT_ID not set: not watching the bill';
  } else {
    try {
      const { use, period: p, cpuWay } = await readUse(env, fetcher, now);
      const j = judge(use, stopAt);
      Object.assign(state, { use, period: p, cpuWay, share: j.share, top: j.top, projected: projected(use, p, now), error: null, blindSince: null });
      if (j.over.length && !prev.stopped) state.stopped = { at: now, why: j.over, periodStart: p.start, saved: {} };
      else if (prev.stopped && p.start > prev.stopped.periodStart && !j.over.length) state.restart = true;
    } catch (e) {
      state.error = String(e.message || e).slice(0, 300);
      state.blindSince = prev.blindSince || now;
      if (now - state.blindSince > BLIND_MS && !prev.stopped) state.stopped = { at: now, why: ['blind'], periodStart: prev.period?.start || period(now, Number(env.PERIOD_DAY) || 1).start, saved: {} };
    }
  }
  const acts = [];
  if (armed && state.restart) {
    for (const name of WORKERS)
      try {
        await startWorker(env, fetcher, name, prev.stopped.saved);
        acts.push(`${name} on`);
      } catch (e) {
        acts.push(`${name} on failed: ${e.message}`);
      }
    if (!acts.some(a => a.includes('failed'))) state.stopped = null;
    delete state.restart;
  } else if (armed && state.stopped) {
    // Every run while stopped: a deploy turns the address and crons back on.
    const saved = { ...(state.stopped.saved || {}) };
    for (const name of WORKERS)
      try {
        const r = await stopWorker(env, fetcher, name, saved);
        if (r.addressWasOn || r.crons) acts.push(`${name} off`);
      } catch (e) {
        acts.push(`${name} off failed: ${e.message}`);
      }
    state.stopped = { ...state.stopped, saved };
  }
  state.acts = acts;
  const changed = acts.length || !!prev.stopped !== !!state.stopped || prev.error !== state.error || prev.armed !== armed;
  if (changed || !prev.at || now - (prev.saved || 0) >= 3_600_000) {
    state.saved = now;
    await kv.put(STATE_KEY, JSON.stringify(state));
  }
  return state;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      guardRun(env, { now: event.scheduledTime || Date.now() })
        .then(s => (s.acts.length || s.error) && console.log('guard', JSON.stringify({ top: s.top, share: s.share?.[s.top], stopped: !!s.stopped, acts: s.acts, error: s.error })))
        .catch(e => console.log('guard failed', String(e)))
    );
  },
  // No address (workers_dev = false): nothing to answer.
  async fetch() {
    return new Response('', { status: 404 });
  }
};
