// The hard stop on Cloudflare's bill (the owner, 2026-10-13: "not a penny
// more" than the $5 Workers Paid plan). Cloudflare has no spending cap of its
// own: budget alerts only send an email, and past the plan's included amounts
// every request, CPU millisecond and KV operation is billed. So this Worker
// (`quota-guard`, its own cron, no public address) reads the account's real
// use this billing period from Cloudflare's analytics every five minutes and,
// once anything reaches STOP_AT of what the plan includes, takes both proxies
// off the air until the next period:
//   - each one's workers.dev address, custom domains (api.<domain>, the
//     site on the family's domain) and routes (orbit.<domain>/api/…) are
//     turned off (a request that never
//     reaches a Worker isn't a Worker request: nothing billed);
//   - each one's crons are emptied (a cron run is a billed request too),
//     the schedules kept in KV and put back with the address when the new
//     period starts.
// R2 is only ever reached through the proxy (data.js; no S3 token exists),
// so stopping it stops R2's use too.
// While stopped it looks again every run, so a deploy that turned the address
// back on is turned off again within five minutes (and deploy.yml does it at
// once). The apps' own pages (GitHub Pages) and the nightly packs stay up:
// they open on what the phone has, as on a failed read.
//
// The plan's included amounts (developers.cloudflare.com/workers/platform/
// pricing, read 2026-10-13): 10M requests and 30M CPU ms a month; KV 10M
// reads, 1M writes, 1M deletes, 1M lists, 1 GB stored; Durable Objects 1M
// requests, 400,000 GB-s, 25B rows read, 50M rows written, 5 GB stored;
// R2 (its own allowance, not the plan's, read 2026-10-13: 10 GB stored,
// 1M Class A and 10M Class B operations a month); Workers Logs 20M events
// (kept under it by the tomls' head_sampling_rate,
// not counted here: analytics has no count of them). A Durable Object's
// duration and rows aren't counted either: the one there is (F1Log, one
// object) can't reach them in a month even running all of it (31 d × 128 MB
// = 334,800 GB-s).
//
// Analytics' adaptive datasets are sampled estimates, so the stop is at 90%,
// and the period is counted from a day before it starts (UTC midnight of the
// day before PERIOD_DAY): an earlier start only counts more.
//
// Pacing (the owner, 2026-10-14: "pace it out greatly"; 2026-11-05: "It
// should be realistic so a estimate of this month exceeding should not
// immediately resulting in rate limiting"): only what was really used
// paces, never a forecast. A count is paced once its real share of the plan
// has passed a mark AND, at the rate of the last days, what's left would
// reach the stop before the period ends. The rate: from `marks`, a copy of
// the counts every 6 hours, the oldest of the last 3½ days that's at least
// 12 hours old (before there is one, the period's own, its first three days
// counted as three). So a busy day (a school's demo) with most of the month
// left slows nobody, and a count that lasts the period is never paced however
// high it is. The pace goes to the proxy (`guard:pace` in KV, written only
// when it changes; pace.js):
//   0  as configured;
//   1  60% used: live refreshes ×2 slower, the background builders that can
//      wait (photos, cutouts, buses, win probability) and the hourly extras off;
//   2  75%: ×4, every builder off, each session's reads halved;
//   3  85%, basics first: ×8, reads quartered, and nobody new let in
//      (`newcomers: false`, for the door that seats people); sign-in, sync
//      and notices go on for everyone already in.
// A pace goes up at once, and down only 5 points under its mark or once the
// period would end 10 points under the stop (the slower pace itself lowers
// the rate). The stop at STOP_AT of what's been used stays the last word.
// The forecast (`forecast`: where the top count ends at the last days'
// rate, and when it would reach the stop) is the panel's warning, nothing else.
//
// Alerts: `alert` is the highest of 50%, 75%, 90% any count has reached this
// period; the proxy's cron tells the owner's phone when it or the pace rises
// (worker.js, the account set in the admin panel).
//
// Needs CF_GUARD_TOKEN (an API token: Account Analytics Read, Workers Scripts
// Edit; Workers Observability Edit for who calls, useByHour), set by deploy-guard.yml from the repo's secret; the account is the
// one the token belongs to (asked once, kept in the state). Without the
// token it is unarmed and says so (the admin panel's 容量).

import { DOMAIN } from './kit/domain.mjs';

export const PLAN = {
  requests: 10_000_000,
  cpuMs: 30_000_000,
  kvRead: 10_000_000,
  kvWrite: 1_000_000,
  kvDelete: 1_000_000,
  kvList: 1_000_000,
  kvBytes: 1_000_000_000,
  doRequests: 1_000_000,
  doDuration: 400_000,
  doBytes: 5_000_000_000,
  r2ClassA: 1_000_000,
  r2ClassB: 10_000_000,
  r2Bytes: 10_000_000_000,
  d1RowsRead: 25_000_000_000,
  d1RowsWritten: 50_000_000,
  d1Bytes: 5_000_000_000
};
// The Workers Free plan (from FREE_FROM, wrangler.guard.toml: Jay ended the
// $5 plan on 2026-11-13; developers.cloudflare.com, read 2026-11-10): its
// amounts are a UTC day's, reset at 00:00 UTC, and past one Cloudflare
// refuses that kind of call (nothing is ever billed). CPU has no daily sum,
// only 10 ms a request (runner.js). R2 keeps its own month (a thirtieth a
// day here). Durable Objects: 100,000 requests a day and 13,000 GB-s
// (their active time, durableObjectsPeriodicGroups). So on Free the period is the UTC day, the
// pace works as before on these amounts, nothing is ever stopped (a stop
// saves no money), and the owner hears only of 90%.
export const FREE_PLAN = {
  requests: 100_000,
  cpuMs: 1e12,
  kvRead: 100_000,
  kvWrite: 1_000,
  kvDelete: 1_000,
  kvList: 1_000,
  kvBytes: 1_000_000_000,
  doRequests: 100_000,
  doDuration: 13_000,
  doBytes: 5_000_000_000,
  r2ClassA: 33_000,
  r2ClassB: 330_000,
  r2Bytes: 10_000_000_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
  d1Bytes: 5_000_000_000
};
export const isFree = (env, now) => !!env.FREE_FROM && now >= Date.parse(env.FREE_FROM);
export const dayPeriod = now => {
  const start = Math.floor(now / DAY) * DAY;
  return { start, end: start + DAY, from: start };
};
// R2's operations by class (developers.cloudflare.com/r2/pricing): reads
// are Class B, deletes free, anything else counted as Class A (the dearer).
export const R2_CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);
export const R2_FREE = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);
export const STOP_AT = 0.9;
export const PACE_KEY = 'guard:pace';
// A pace's mark (the share of the plan really used) and what it does
// (pace.js hands on `slow`, `reads` and `newcomers`).
export const PACES = [
  { at: 0, slow: 1, reads: 1, newcomers: true },
  { at: 0.6, slow: 2, reads: 1, newcomers: true },
  { at: 0.75, slow: 4, reads: 0.5, newcomers: true },
  { at: 0.85, slow: 8, reads: 0.25, newcomers: false }
];
export const ALERTS = [0.5, 0.75, 0.9];
// orbit-site mirrors the apps onto the family's own domain (site.js; none
// until kit/domain.mjs has one: a 404 here is nothing to stop or start).
// (The old sports-proxy forwarder was deleted 2026-10-20: no longer watched.)
export const WORKERS = ['orbit-workers-proxy', 'orbit-site'];
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

// Each count is its own query, so a field the API doesn't know (its schema
// shifts) loses that count alone, never the bill: only the Workers'
// requests and CPU are needed to watch it at all (`core`); the rest, when
// unread, are reported (state.partial) and the stop still guards the rest.
const WORKERS_Q = cpu => `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) {
  w: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests${cpu ? ' cpuTimeUs' : ''} } ${cpu ? '' : 'quantiles { cpuTimeP99 } '}dimensions { scriptName } }
} } }`;
const PART_Q = {
  kv: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: kvOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { requests } dimensions { actionType } } } } }`,
  do: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { requests } } } } }`,
  // Durable Objects' duration in GB-s: their active time (µs) × 128 MB (the Free plan's 13,000 a day).
  dodur: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: durableObjectsPeriodicGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { activeTime } } } } }`,
  r2: `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) { x: r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests } dimensions { actionType } } } } }`,
  d1: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { sum { rowsRead rowsWritten } } } } }`
};
const STORE_Q = {
  kv: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: kvStorageAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { max { byteCount } dimensions { date } } } } }`,
  do: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: durableObjectsStorageGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { max { storedBytes } dimensions { date } } } } }`,
  r2: `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) { x: r2StorageAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }, orderBy: [datetime_DESC]) { max { payloadSize metadataSize } dimensions { bucketName datetime } } } } }`,
  d1: `query($a: string!, $ds: Date!, $de: Date!) { viewer { accounts(filter: { accountTag: $a }) { x: d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $ds, date_leq: $de }) { max { databaseSizeBytes } dimensions { date databaseId } } } } }`
};

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
  if (!acc) throw new Error('analytics: no account');
  return acc;
}

// The period's use, every count the plan bills that analytics has. CPU
// is the sum of each invocation's own (`cpuTimeUs`); where the API lacks it,
// each Worker's requests × its 99th-percentile CPU (more than it was).
export async function readUse(env, fetcher, now, p = period(now, Number(env.PERIOD_DAY) || 1)) {
  const use = { requests: 0, cpuMs: 0, kvRead: 0, kvWrite: 0, kvDelete: 0, kvList: 0, kvBytes: 0, doRequests: 0, doDuration: 0, doBytes: 0, r2ClassA: 0, r2ClassB: 0, r2Bytes: 0, d1RowsRead: 0, d1RowsWritten: 0, d1Bytes: 0 };
  const partial = {};
  let cpuWay = 'sum';
  const add = {
    kv: rows => {
      for (const r of rows) {
        const k = { read: 'kvRead', write: 'kvWrite', delete: 'kvDelete', list: 'kvList' }[r.dimensions?.actionType];
        if (k) use[k] += r.sum?.requests || 0;
      }
    },
    do: rows => rows.forEach(r => (use.doRequests += r.sum?.requests || 0)),
    dodur: rows => rows.forEach(r => (use.doDuration += ((r.sum?.activeTime || 0) / 1e6) * 0.128)),
    r2: rows => {
      for (const r of rows) {
        const t = r.dimensions?.actionType;
        if (!R2_FREE.has(t)) use[R2_CLASS_B.has(t) ? 'r2ClassB' : 'r2ClassA'] += r.sum?.requests || 0;
      }
    },
    d1: rows => rows.forEach(r => ((use.d1RowsRead += r.sum?.rowsRead || 0), (use.d1RowsWritten += r.sum?.rowsWritten || 0)))
  };
  for (const [s, e] of chunks(p.from, now + 60_000)) {
    const vars = { a: env.CF_ACCOUNT_ID, s: isoTime(s), e: isoTime(e), ds: isoDay(s), de: isoDay(e - 1) };
    // The core: unread, the bill can't be watched (the run's error).
    let acc;
    try {
      acc = await graphql(env, fetcher, WORKERS_Q(cpuWay === 'sum'), vars);
    } catch (err) {
      if (!err.fields || cpuWay !== 'sum') throw err;
      cpuWay = 'p99';
      acc = await graphql(env, fetcher, WORKERS_Q(false), vars);
    }
    for (const r of acc.w || []) {
      const n = r.sum?.requests || 0;
      use.requests += n;
      use.cpuMs += cpuWay === 'sum' ? (r.sum?.cpuTimeUs || 0) / 1000 : (n * (r.quantiles?.cpuTimeP99 || 0)) / 1000;
    }
    for (const [name, q] of Object.entries(PART_Q)) {
      if (partial[name]) continue;
      try {
        add[name]((await graphql(env, fetcher, q, vars)).x || []);
      } catch (err) {
        partial[name] = String(err.message || err).slice(0, 160);
      }
    }
  }
  // What's stored now: each kind's latest (summed over its namespaces, objects, buckets, databases).
  const sv = { a: env.CF_ACCOUNT_ID, ds: isoDay(now - 2 * DAY), de: isoDay(now), s: isoTime(now - 2 * DAY), e: isoTime(now) };
  const latest = (rows, f, by = 'date') => {
    const seen = new Map();
    for (const r of rows) {
      const key = by === 'date' ? '' : r.dimensions?.bucketName || r.dimensions?.databaseId || '';
      const at = r.dimensions?.date || r.dimensions?.datetime || '';
      if (!seen.has(key) || at > seen.get(key).at) seen.set(key, { at, rows: [] });
      if (seen.get(key).at === at) seen.get(key).rows.push(r);
    }
    let n = 0;
    for (const { rows: list } of seen.values()) for (const r of list) n += [].concat(f).reduce((m, k) => m + (r.max?.[k] || 0), 0);
    return n;
  };
  const stored = { kv: ['kvBytes', 'byteCount', 'date'], do: ['doBytes', 'storedBytes', 'date'], r2: ['r2Bytes', ['payloadSize', 'metadataSize'], 'bucket'], d1: ['d1Bytes', 'databaseSizeBytes', 'db'] };
  for (const [name, [k, f, by]] of Object.entries(stored)) {
    try {
      use[k] = latest((await graphql(env, fetcher, STORE_Q[name], sv)).x || [], f, by);
    } catch (err) {
      partial[`${name}Bytes`] = String(err.message || err).slice(0, 160);
    }
  }
  use.cpuMs = Math.round(use.cpuMs);
  use.doDuration = Math.round(use.doDuration);
  return { use, period: p, cpuWay, partial };
}

// Each count's share of the plan, the largest, and what's over the stop.
export function judge(use, stopAt = STOP_AT, plan = PLAN) {
  const share = {};
  for (const k of Object.keys(plan)) share[k] = (use[k] || 0) / plan[k];
  const over = Object.keys(share).filter(k => share[k] >= stopAt);
  const top = Object.keys(share).reduce((a, b) => (share[b] > share[a] ? b : a));
  return { share, over, top };
}

// Where the period ends up at the period's own pace (the panel's 預估, a
// count at a time). `floor`: the least time counted as gone.
export function projected(use, p, now, floor = DAY / 24, plan = PLAN) {
  const f = (p.end - p.from) / Math.max(floor, now - p.from);
  const out = {};
  for (const k of Object.keys(plan)) out[k] = /Bytes$/.test(k) ? use[k] : Math.round((use[k] || 0) * f);
  return out;
}

// The counts that pace (storage isn't paced: it doesn't run out in a month).
const RATE_KEYS = Object.keys(PLAN).filter(k => !/Bytes$/.test(k));
const r4 = x => Math.round(x * 1e4) / 1e4;
// The marks the last days' rate is read from: a copy of the counts every
// MARK_EVERY, none older than MARK_SPAN, none from another period.
export const MARK_EVERY = 6 * 3_600_000;
export const MARK_MIN = 12 * 3_600_000;
export const MARK_SPAN = 3.5 * DAY;
export function marksAfter(marks, use, now, newPeriod = false) {
  const kept = newPeriod ? [] : (marks || []).filter(([at]) => now - at <= MARK_SPAN && at <= now);
  if (!kept.length || now - kept[kept.length - 1][0] >= MARK_EVERY) kept.push([now, Object.fromEntries(RATE_KEYS.map(k => [k, Math.round(use[k] || 0)]))]);
  return kept;
}
// Each count's rate of the last days (a ms): since the oldest mark at
// least MARK_MIN old; with none, the period's own (three days at least).
export function rateOf(use, marks, p, now, floor = 3 * DAY) {
  const m = (marks || []).find(([at]) => now - at >= MARK_MIN && now - at <= MARK_SPAN);
  const out = {};
  for (const k of RATE_KEYS) out[k] = m ? Math.max(0, ((use[k] || 0) - (m[1][k] || 0)) / (now - m[0])) : (use[k] || 0) / Math.max(floor, now - p.from);
  return out;
}

// The pace for what's been used (`use`), at `rate` (a ms) for the `left` of
// the period (ms), with the last pace for the way down. `why`: the count
// that set it, its share used and where it would end.
export function paceFor(use, { rate = {}, left = 0, last = 0, stopAt = STOP_AT, plan = PLAN } = {}) {
  let pace = 0;
  let why = null;
  for (const k of RATE_KEYS) {
    const share = (use[k] || 0) / plan[k];
    const end = ((use[k] || 0) + (rate[k] || 0) * Math.max(0, left)) / plan[k];
    for (let i = PACES.length - 1; i > pace; i--) {
      const held = i <= last;
      if (share >= PACES[i].at - (held ? 0.05 : 0) && end >= stopAt - (held ? 0.1 : 0)) {
        pace = i;
        why = { key: k, share: r4(share), end: r4(end) };
        break;
      }
    }
  }
  return { pace, why };
}

// The panel's warning (never a pace): the count that ends the period
// highest at the last days' rate, its share then, and when it would reach
// the stop (null if it doesn't).
export function forecastOf(use, rate, p, now, stopAt = STOP_AT, plan = PLAN) {
  let top = null;
  for (const k of RATE_KEYS) {
    const end = ((use[k] || 0) + (rate[k] || 0) * Math.max(0, p.end - now)) / plan[k];
    if (!top || end > top.end) top = { key: k, end };
  }
  if (!top) return null;
  const r = rate[top.key] || 0;
  const at = top.end >= stopAt && r > 0 ? Math.round(now + Math.max(0, plan[top.key] * stopAt - (use[top.key] || 0)) / r) : null;
  return { key: top.key, end: r4(top.end), at, warn: top.end >= stopAt };
}
export const alertFor = share => ALERTS.filter(a => Object.values(share).some(v => v >= a)).length;

// The account the token belongs to (one: the guard's own token).
async function accountOf(env, fetcher) {
  if (env.CF_ACCOUNT_ID) return env.CF_ACCOUNT_ID;
  const res = await fetcher(`${API}/accounts`, { headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}` } });
  const j = await res.json().catch(() => ({}));
  const id = j.result?.[0]?.id;
  if (!id) throw new Error(`no account for the token (${res.status})`);
  return id;
}

// ---- Cloudflare's API: a Worker's addresses and crons ----
async function cf(env, fetcher, method, path, body) {
  return cfAt(env, fetcher, method, `workers/scripts/${path}`, body);
}
async function cfAt(env, fetcher, method, path, body) {
  const res = await fetcher(`${API}/accounts/${env.CF_ACCOUNT_ID}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${(j.errors || []).map(e => e.message).join('; ')}`.slice(0, 300)), { status: res.status });
  return j.result;
}

// Off the air: the workers.dev address and any custom domain (api.<domain>,
// the site's) off, the crons emptied (domains and crons kept in `saved`).
const DOMAINS = name => `${name}@domains`;
const ROUTES = name => `${name}@routes`;
// A zone's Worker routes (/zones/<id>/workers/routes[/<route id>]).
async function cfZone(env, fetcher, method, zone, rest = '', body) {
  const res = await fetcher(`${API}/zones/${zone}/workers/routes${rest}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw Object.assign(new Error(`${method} routes: ${res.status} ${(j.errors || []).map(e => e.message).join('; ')}`.slice(0, 300)), { status: res.status });
  return j.result;
}
export async function stopWorker(env, fetcher, name, saved) {
  const sub = await cf(env, fetcher, 'GET', `${name}/subdomain`);
  if (sub?.enabled) await cf(env, fetcher, 'DELETE', `${name}/subdomain`);
  const sch = await cf(env, fetcher, 'GET', `${name}/schedules`);
  const crons = (sch?.schedules || []).map(s => s.cron).filter(Boolean);
  if (crons.length) {
    saved[name] = crons;
    await cf(env, fetcher, 'PUT', `${name}/schedules`, []);
  }
  // (Last: a token that can't reach the domains still stopped the rest.)
  const doms = (await cfAt(env, fetcher, 'GET', `workers/domains?service=${encodeURIComponent(name)}`)) || [];
  for (const d of doms) await cfAt(env, fetcher, 'DELETE', `workers/domains/${d.id}`);
  if (doms.length) saved[DOMAINS(name)] = [...new Map([...(saved[DOMAINS(name)] || []), ...doms.map(d => ({ hostname: d.hostname, zone_id: d.zone_id }))].map(d => [d.hostname, d])).values()];
  // Its routes on those zones (the proxy at orbit.<domain>/api/…).
  const zones = [...new Set((saved[DOMAINS(name)] || []).map(d => d.zone_id).filter(Boolean))];
  const gone = [];
  for (const zone of zones) {
    const routes = (await cfZone(env, fetcher, 'GET', zone)) || [];
    for (const r of routes.filter(r => r.script === name)) {
      await cfZone(env, fetcher, 'DELETE', zone, `/${r.id}`);
      gone.push({ pattern: r.pattern, zone_id: zone });
    }
  }
  if (gone.length) saved[ROUTES(name)] = [...new Map([...(saved[ROUTES(name)] || []), ...gone].map(r => [r.pattern, r])).values()];
  return { addressWasOn: !!sub?.enabled || doms.length > 0 || gone.length > 0, crons: crons.length };
}
// Back on: the address, and the crons it had.
export async function startWorker(env, fetcher, name, saved) {
  await cf(env, fetcher, 'POST', `${name}/subdomain`, { enabled: true });
  for (const d of saved?.[DOMAINS(name)] || []) await cfAt(env, fetcher, 'PUT', 'workers/domains', { environment: 'production', hostname: d.hostname, service: name, zone_id: d.zone_id });
  for (const r of saved?.[ROUTES(name)] || []) await cfZone(env, fetcher, 'POST', r.zone_id, '', { pattern: r.pattern, script: name }).catch(e => { if (!/exist|duplicate/i.test(e.message)) throw e; });
  if (saved?.[name]?.length) await cf(env, fetcher, 'PUT', `${name}/schedules`, saved[name].map(cron => ({ cron })));
}

// One run: read, judge, stop or start, keep the state (KV written only
// when something changed, or hourly for the panel: KV's 1M writes a month).
export async function guardRun(env, { fetcher = fetch, now = Date.now(), kv = env.RATE_LIMIT_KV } = {}) {
  const prev = JSON.parse((await kv.get(STATE_KEY).catch(() => null)) || 'null') || {};
  let armed = !!env.CF_GUARD_TOKEN;
  const stopAt = Number(env.STOP_AT) || STOP_AT;
  const free = isFree(env, now);
  const plan = free ? FREE_PLAN : PLAN;
  const state = { ...prev, at: now, armed, stopAt, plan, free, paces: PACES };
  if (armed && !prev.account && !env.CF_ACCOUNT_ID)
    try {
      state.account = await accountOf(env, fetcher);
    } catch (e) {
      state.error = String(e.message || e).slice(0, 300);
    }
  env = { ...env, CF_ACCOUNT_ID: env.CF_ACCOUNT_ID || state.account };
  armed = state.armed = armed && !!env.CF_ACCOUNT_ID;
  if (!armed) {
    state.error = state.error || 'CF_GUARD_TOKEN not set: not watching the bill';
  } else {
    try {
      const { use, period: p, cpuWay, partial } = await readUse(env, fetcher, now, free ? dayPeriod(now) : undefined);
      const j = judge(use, stopAt, plan);
      const newPeriod = !!prev.period && (p.start > prev.period.start || !!prev.free !== free);
      // (On Free a day's own rate, two hours at least: the marks are for a month.)
      const marks = free ? [] : marksAfter(prev.marks, use, now, newPeriod);
      const rate = rateOf(use, marks, p, now, free ? 2 * 3_600_000 : undefined);
      const pace = paceFor(use, { rate, left: p.end - now, last: newPeriod ? 0 : prev.pace || 0, stopAt, plan });
      const forecast = forecastOf(use, rate, p, now, stopAt, plan);
      // (`paceTop`, the panel's 推估到月底: the forecast's share at the period's end.)
      Object.assign(state, { use, period: p, cpuWay, partial, share: j.share, top: j.top, projected: projected(use, p, now, undefined, plan), marks, forecast, pace: pace.pace, paceWhy: pace.why, paceTop: forecast?.end ?? null, alert: free ? (j.over.length ? ALERTS.length : 0) : alertFor(j.share), error: null, blindSince: null });
      // (On Free nothing is stopped: no bill to keep under; a stop from the paid plan ends.)
      if (free) {
        if (prev.stopped) state.restart = true;
      } else if (j.over.length && !prev.stopped) state.stopped = { at: now, why: j.over, periodStart: p.start, saved: {} };
      else if (prev.stopped && p.start > prev.stopped.periodStart && !j.over.length) state.restart = true;
    } catch (e) {
      state.error = String(e.message || e).slice(0, 300);
      state.blindSince = prev.blindSince || now;
      if (!free && now - state.blindSince > BLIND_MS && !prev.stopped) state.stopped = { at: now, why: ['blind'], periodStart: prev.period?.start || period(now, Number(env.PERIOD_DAY) || 1).start, saved: {} };
    }
  }
  const acts = [];
  if (armed && state.restart) {
    for (const name of WORKERS)
      try {
        await startWorker(env, fetcher, name, prev.stopped.saved);
        acts.push(`${name} on`);
      } catch (e) {
        // A Worker that isn't there (orbit-site without a domain) has nothing to start.
        if (e.status !== 404) acts.push(`${name} on failed: ${e.message}`);
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
        if (e.status !== 404) acts.push(`${name} off failed: ${e.message}`);
      }
    state.stopped = { ...state.stopped, saved };
  }
  state.acts = acts;
  // The pace for the proxy (pace.js), only when it changes.
  if ((state.pace || 0) !== (prev.pace || 0)) {
    state.paceSince = now;
    await kv.put(PACE_KEY, JSON.stringify({ pace: state.pace || 0, ...PACES[state.pace || 0], at: now, why: state.paceWhy || null }));
  }
  const changed = acts.length || !!prev.stopped !== !!state.stopped || prev.error !== state.error || prev.armed !== armed || (state.pace || 0) !== (prev.pace || 0) || (state.alert || 0) !== (prev.alert || 0) || state.account !== prev.account || prev.pace === undefined;
  if (changed || !prev.at || now - (prev.saved || 0) >= 3_600_000) {
    state.saved = now;
    await kv.put(STATE_KEY, JSON.stringify(state));
  }
  return state;
}

// ---- Each Worker's errors in the last 24 hours (the admin panel's 錯誤) ----
// From the same analytics as the bill: requests and errors by Worker and the
// way an invocation ended (`status`: scriptThrewException, exceededResources…).
const ERRORS_Q = `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) { x: workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests errors } dimensions { scriptName status } } } } }`;
export async function workerErrors(env, { fetcher = fetch, now = Date.now(), kv = env.RATE_LIMIT_KV } = {}) {
  if (!env.CF_GUARD_TOKEN) return { off: true };
  const state = JSON.parse((await kv?.get(STATE_KEY).catch(() => null)) || 'null') || {};
  const a = env.CF_ACCOUNT_ID || state.account || (await accountOf(env, fetcher));
  const acc = await graphql(env, fetcher, ERRORS_Q, { a, s: new Date(now - DAY).toISOString(), e: new Date(now).toISOString() });
  const workers = {};
  for (const r of acc.x || []) {
    const name = r.dimensions?.scriptName;
    if (!WORKERS.includes(name)) continue;
    const w = (workers[name] ||= { requests: 0, errors: 0, by: {} });
    w.requests += r.sum?.requests || 0;
    w.errors += r.sum?.errors || 0;
    const st = r.dimensions.status;
    if (st && st !== 'success' && r.sum?.requests) w.by[st] = (w.by[st] || 0) + r.sum.requests;
  }
  return { at: now, workers };
}

// The last 7 days hour by hour (every Worker of the account, as the plan
// counts them): [hour start (ms), requests, CPU ms, people's requests,
// people's CPU ms], for capacity.js to tell what people use from the rest.
// People's: requests (not crons) answered in Cloudflare's colos in and near
// Taiwan, where the family's phones come in; the rest is the crons and the
// builders, and our own tools and checks, which run on machines in the US
// (2026-11-06, the last 7 days: Taiwan's colo 4% of the CPU, Ashburn's 52%).
// Kept an hour in KV (the panel and the proxy's 6-hourly check ask;
// analytics is asked once).
export const HOURS_KEY = 'guard:hours';
export const NEAR_TAIWAN = ['TPE', 'KHH', 'RMQ', 'HKG', 'MFM', 'NRT', 'KIX', 'FUK', 'OKA', 'ICN', 'PUS', 'SIN', 'KUL', 'BKK', 'MNL', 'CGK', 'SGN', 'HAN'];
// (People's part by hour and kind, the proxy's only (phones call nothing
// else): 'near', its colos near Taiwan; 'proxy', all of it, for the share its
// pages called. Crons are left out by their kind, which analytics has named
// only since 2026-11-04, "unknown" before.)
const HOURS_Q = (cpu, part = '') => `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $a }) {
  x: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e${part ? `, scriptName: "${WORKERS[0]}"` : ''}${part === 'near' ? `, coloCode_in: ${JSON.stringify(NEAR_TAIWAN)}` : ''} }) { sum { requests${cpu ? ' cpuTimeUs' : ''} } ${cpu ? '' : 'quantiles { cpuTimeP99 } '}dimensions { datetimeHour ${part ? 'eventType' : 'scriptName'} } }
} } }`;

// People's share of the proxy by who called (the Workers Logs, the same 7
// days): a page on the family's domain (orbit.<DOMAIN>/api/…, the showcase's
// <DOMAIN>/api/…) is a person, in any country; any other host (our own tools
// and checks on api.<DOMAIN> or workers.dev) is not, nor is a cron. The logs
// are a sample (the proxy's head_sampling_rate), so only the share is taken
// from them and analytics has the counts. Needs Workers Observability Edit on
// the token (the query API takes nothing less); without it, by place.
export const PAGE_HOSTS = [`orbit.${DOMAIN}`, DOMAIN];
export async function pageShare(env, fetcher, account, from, to) {
  const res = await fetcher(`${API}/accounts/${account}/workers/observability/telemetry/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryId: 'orbit-page-share',
      timeframe: { from, to },
      view: 'calculations',
      limit: 200,
      parameters: {
        calculations: [{ operator: 'sum', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'cpu' }],
        filters: [{ key: '$workers.scriptName', operation: 'eq', type: 'string', value: WORKERS[0] }],
        groupBys: [{ type: 'string', value: '$workers.event.request.headers.host' }],
        limit: 200
      }
    })
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(`logs ${res.status}: ${(j?.errors || []).map(e => e.message).join('; ').slice(0, 200)}`);
  const rows = (j.result?.calculations?.find(c => c.alias === 'cpu')?.aggregates || []).map(r => ({ host: String(r.groups?.[0]?.value ?? r.groupKey ?? '').toLowerCase(), cpu: Number(r.value) || 0, n: Number(r.count) || 0 })).filter(r => r.host);
  const sum = (list, f) => list.reduce((t, r) => t + r[f], 0);
  const pages = rows.filter(r => PAGE_HOSTS.includes(r.host));
  const cpu = sum(rows, 'cpu');
  const n = sum(rows, 'n');
  if (!(cpu > 0 && n > 0)) throw new Error('logs: no request logged');
  return { cpu: sum(pages, 'cpu') / cpu, n: sum(pages, 'n') / n, hosts: rows.sort((x, y) => y.cpu - x.cpu).slice(0, 8).map(r => [r.host, Math.round(r.cpu), r.n]) };
}
export async function useByHour(env, { fetcher = fetch, now = Date.now(), kv = env.RATE_LIMIT_KV } = {}) {
  if (!env.CF_GUARD_TOKEN) return { off: true };
  const kept = JSON.parse((await kv?.get(HOURS_KEY).catch(() => null)) || 'null');
  // (A copy kept before people's part was read by who called is read again.)
  if (kept?.at && now - kept.at < 3_600_000 && 'who' in kept) return kept;
  const state = JSON.parse((await kv?.get(STATE_KEY).catch(() => null)) || 'null') || {};
  const a = env.CF_ACCOUNT_ID || state.account || (await accountOf(env, fetcher));
  const end = Math.floor(now / 3_600_000) * 3_600_000;
  const vars = { a, s: isoTime(end - 7 * DAY), e: isoTime(end - 1000) };
  let cpuWay = 'sum';
  let acc;
  try {
    acc = await graphql(env, fetcher, HOURS_Q(true), vars);
  } catch (err) {
    if (!err.fields) throw err;
    cpuWay = 'p99';
    acc = await graphql(env, fetcher, HOURS_Q(false), vars);
  }
  // (People's part asked apart: without it, every hour's use counts as theirs.
  // By who called where the logs answer: the proxy's hours × the share its
  // pages called; else by place: the proxy's hours in the colos near Taiwan.)
  const errors = [];
  const share = await pageShare(env, fetcher, a, end - 7 * DAY, end).catch(err => (errors.push(err.message), null));
  const who = share ? 'caller' : 'place';
  const near = await graphql(env, fetcher, HOURS_Q(cpuWay === 'sum', share ? 'proxy' : 'near'), vars).catch(err => (errors.push(err.message), null));
  const by = new Map();
  const add = (rows, at, part = { n: 1, cpu: 1 }) => {
    for (const r of rows || []) {
      const t = Date.parse(r.dimensions?.datetimeHour);
      if (!Number.isFinite(t) || r.dimensions?.eventType === 'cron') continue;
      const n = r.sum?.requests || 0;
      const row = by.get(t) || [t, 0, 0, 0, 0];
      row[at] += n * part.n;
      row[at + 1] += (cpuWay === 'sum' ? (r.sum?.cpuTimeUs || 0) / 1000 : (n * (r.quantiles?.cpuTimeP99 || 0)) / 1000) * part.cpu;
      by.set(t, row);
    }
  };
  add(acc.x, 1);
  if (near) add(near.x, 3, share || undefined);
  const peopleError = errors.join('; ');
  const out = { at: now, from: end - 7 * DAY, to: end, cpuWay, people: !!near, who, ...(share && { share }), ...(peopleError && { peopleError: peopleError.slice(0, 300) }), hours: [...by.values()].sort((x, y) => x[0] - y[0]).map(([t, n, c, pn, pc]) => (near ? [t, n, Math.round(c), Math.round(pn), Math.round(pc)] : [t, n, Math.round(c)])) };
  await kv?.put(HOURS_KEY, JSON.stringify(out)).catch(() => {});
  return out;
}

// CPU by route (the Workers Logs, sampled): which requests and crons would
// pass the Workers Free plan's 10 ms a request (2026-11-13 on). `group` is
// the logs' key to group by (default the request's path); `keys=1` lists
// the logs' keys instead. Asked by the proxy's /ops?check=cpu (build.yml).
export async function cpuByRoute(env, { fetcher = fetch, now = Date.now(), hours = 24, group = '', keys = false, script = '', where = '' } = {}) {
  if (!env.CF_GUARD_TOKEN) return { off: true };
  const state = JSON.parse((await env.RATE_LIMIT_KV?.get(STATE_KEY).catch(() => null)) || 'null') || {};
  const a = env.CF_ACCOUNT_ID || state.account || (await accountOf(env, fetcher));
  const from = now - Math.min(72, Math.max(0.1, hours)) * 3_600_000;
  const call = (path, body) =>
    fetcher(`${API}/accounts/${a}/workers/observability/telemetry/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_GUARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(async r => {
      const t = await r.text();
      let j = null;
      try {
        j = JSON.parse(t);
      } catch {}
      if (!r.ok || !j?.success) throw new Error(`logs ${r.status}: ${(j?.errors || []).map(e => e.message).join('; ') || t}`.slice(0, 600));
      return j.result;
    });
  if (keys) {
    const r = await call('keys', { timeframe: { from, to: now }, limit: 500 });
    return { keys: (Array.isArray(r) ? r : r?.keys || []).map(k => k.key || k).filter(k => /request|path|url|cron|event|cpu|wall|outcome|script|entry/i.test(String(k))) };
  }
  const by = group || '$workers.event.path';
  const r = await call('query', {
    queryId: 'orbit-cpu-routes',
    timeframe: { from, to: now },
    view: 'calculations',
    limit: 200,
    parameters: {
      calculations: [
        { operator: 'count', alias: 'n' },
        { operator: 'median', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'p50' },
        { operator: 'p90', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'p90' },
        { operator: 'p99', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'p99' },
        { operator: 'max', key: '$workers.cpuTimeMs', keyType: 'number', alias: 'max' }
      ],
      // ?where=key,operation,value;… more filters (e.g. $workers.entrypoint,neq,Runner).
      filters: [
        { key: '$workers.scriptName', operation: 'eq', type: 'string', value: script || WORKERS[0] },
        ...String(where || '')
          .split(';')
          .filter(Boolean)
          .map(w => {
            const [key, operation, value] = w.split(',');
            return { key, operation, type: 'string', ...(value != null ? { value } : {}) };
          })
      ],
      groupBys: by.split(',').map(value => ({ type: 'string', value })),
      limit: 200
    }
  });
  const rows = new Map();
  for (const c of r?.calculations || []) {
    for (const g of c.aggregates || []) {
      const k = (g.groups || []).map(x => String(x?.value ?? '')).join(' ') || String(g.groupKey ?? '');
      const row = rows.get(k) || { route: k };
      row[c.alias] = c.alias === 'n' ? Number(g.value ?? g.count) || 0 : Math.round((Number(g.value) || 0) * 10) / 10;
      rows.set(k, row);
    }
  }
  return { from, to: now, by, script: script || WORKERS[0], rows: [...rows.values()].sort((x, y) => (y.p90 || 0) - (x.p90 || 0)) };
}
