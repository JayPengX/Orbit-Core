// The hard stop on Cloudflare's bill (the owner, 2026-10-13: "not a penny
// more" than the $5 Workers Paid plan). Cloudflare has no spending cap of its
// own: budget alerts only send an email, and past the plan's included amounts
// every request, CPU millisecond and KV operation is billed. So this Worker
// (`quota-guard`, its own cron, no public address) reads the account's real
// use this billing period from Cloudflare's analytics every five minutes and,
// once anything reaches STOP_AT of what the plan includes, takes both proxies
// off the air until the next period:
//   - each one's workers.dev address and custom domains (api.<domain>, the
//     site on the family's domain) are turned off (a request that never
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
// Pacing (the owner, 2026-10-14: "pace it out greatly"): before any stop,
// the month is paced. From the period's use so far the guard projects where
// each count ends (the first three days counted as three, so a busy first
// day isn't read as a month of them) and sets a pace the proxy follows
// (`guard:pace` in KV, written only when it changes; pace.js):
//   0  under 60% projected: as configured;
//   1  60%: live refreshes ×2 slower, the background builders that can wait
//      (photos, cutouts, buses, win probability) and the hourly extras off;
//   2  80%: ×4, every builder off, each session's reads halved;
//   3  90% (the stop's own mark, reached before the month ends): ×8, reads
//      quartered.
// A pace goes up at once and down only 10 points under its mark. The stop at
// STOP_AT of what's been used stays the last word.
//
// Alerts: `alert` is the highest of 50%, 75%, 90% any count has reached this
// period; the proxy's cron tells the owner's phone when it or the pace rises
// (worker.js, the account set in the admin panel).
//
// Needs CF_GUARD_TOKEN (an API token: Account Analytics Read, Workers Scripts
// Edit), set by deploy-guard.yml from the repo's secret; the account is the
// one the token belongs to (asked once, kept in the state). Without the
// token it is unarmed and says so (the admin panel's 容量).

export const PLAN = {
  requests: 10_000_000,
  cpuMs: 30_000_000,
  kvRead: 10_000_000,
  kvWrite: 1_000_000,
  kvDelete: 1_000_000,
  kvList: 1_000_000,
  kvBytes: 1_000_000_000,
  doRequests: 1_000_000,
  doBytes: 5_000_000_000,
  r2ClassA: 1_000_000,
  r2ClassB: 10_000_000,
  r2Bytes: 10_000_000_000,
  d1RowsRead: 25_000_000_000,
  d1RowsWritten: 50_000_000,
  d1Bytes: 5_000_000_000
};
// R2's operations by class (developers.cloudflare.com/r2/pricing): reads
// are Class B, deletes free, anything else counted as Class A (the dearer).
export const R2_CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);
export const R2_FREE = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);
export const STOP_AT = 0.9;
export const PACE_KEY = 'guard:pace';
// A pace's mark (projected share of the plan) and what it does (pace.js reads `slow`, `reads`).
export const PACES = [
  { at: 0, slow: 1, reads: 1 },
  { at: 0.6, slow: 2, reads: 1 },
  { at: 0.8, slow: 4, reads: 0.5 },
  { at: 0.9, slow: 8, reads: 0.25 }
];
export const ALERTS = [0.5, 0.75, 0.9];
// (sports-proxy, the old forwarder, is deleted from 2026-10-20: a 404 for it is
// nothing to stop or start. Stopped with the proxy until then: it reaches the
// proxy through a service binding, not its address.) orbit-site mirrors the
// apps onto the family's own domain (site.js; none until kit/domain.mjs has
// one, a 404 here like the forwarder's).
export const WORKERS = ['orbit-workers-proxy', 'orbit-site', 'sports-proxy'];
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
export async function readUse(env, fetcher, now) {
  const day = Number(env.PERIOD_DAY) || 1;
  const p = period(now, day);
  const use = { requests: 0, cpuMs: 0, kvRead: 0, kvWrite: 0, kvDelete: 0, kvList: 0, kvBytes: 0, doRequests: 0, doBytes: 0, r2ClassA: 0, r2ClassB: 0, r2Bytes: 0, d1RowsRead: 0, d1RowsWritten: 0, d1Bytes: 0 };
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
  return { use, period: p, cpuWay, partial };
}

// Each count's share of the plan, the largest, and what's over the stop.
export function judge(use, stopAt = STOP_AT) {
  const share = {};
  for (const k of Object.keys(PLAN)) share[k] = (use[k] || 0) / PLAN[k];
  const over = Object.keys(share).filter(k => share[k] >= stopAt);
  const top = Object.keys(share).reduce((a, b) => (share[b] > share[a] ? b : a));
  return { share, over, top };
}

// Where the period ends up at this pace (the panel's 預估). `floor`: the
// least time counted as gone (pacing counts three days at least).
export function projected(use, p, now, floor = DAY / 24) {
  const f = (p.end - p.from) / Math.max(floor, now - p.from);
  const out = {};
  for (const k of Object.keys(PLAN)) out[k] = /Bytes$/.test(k) ? use[k] : Math.round((use[k] || 0) * f);
  return out;
}

// The pace for a projection (each rate count's projected share; storage
// isn't paced), with the last pace for the way down.
export function paceFor(proj, last = 0) {
  let top = 0;
  for (const k of Object.keys(PLAN)) if (!/Bytes$/.test(k)) top = Math.max(top, (proj[k] || 0) / PLAN[k]);
  let pace = 0;
  for (let i = PACES.length - 1; i > 0; i--)
    if (top >= PACES[i].at || (i <= last && top >= PACES[i].at - 0.1)) {
      pace = i;
      break;
    }
  return { pace, top };
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
  return { addressWasOn: !!sub?.enabled || doms.length > 0, crons: crons.length };
}
// Back on: the address, and the crons it had.
export async function startWorker(env, fetcher, name, saved) {
  await cf(env, fetcher, 'POST', `${name}/subdomain`, { enabled: true });
  for (const d of saved?.[DOMAINS(name)] || []) await cfAt(env, fetcher, 'PUT', 'workers/domains', { environment: 'production', hostname: d.hostname, service: name, zone_id: d.zone_id });
  if (saved?.[name]?.length) await cf(env, fetcher, 'PUT', `${name}/schedules`, saved[name].map(cron => ({ cron })));
}

// One run: read, judge, stop or start, keep the state (KV written only
// when something changed, or hourly for the panel: KV's 1M writes a month).
export async function guardRun(env, { fetcher = fetch, now = Date.now(), kv = env.RATE_LIMIT_KV } = {}) {
  const prev = JSON.parse((await kv.get(STATE_KEY).catch(() => null)) || 'null') || {};
  let armed = !!env.CF_GUARD_TOKEN;
  const stopAt = Number(env.STOP_AT) || STOP_AT;
  const state = { ...prev, at: now, armed, stopAt, plan: PLAN, paces: PACES };
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
      const { use, period: p, cpuWay, partial } = await readUse(env, fetcher, now);
      const j = judge(use, stopAt);
      const newPeriod = prev.period && p.start > prev.period.start;
      const pace = paceFor(projected(use, p, now, 3 * DAY), newPeriod ? 0 : prev.pace || 0);
      Object.assign(state, { use, period: p, cpuWay, partial, share: j.share, top: j.top, projected: projected(use, p, now), pace: pace.pace, paceTop: pace.top, alert: alertFor(j.share), error: null, blindSince: null });
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
        // A Worker that's gone (the old sports-proxy, deleted) has nothing to start.
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
    await kv.put(PACE_KEY, JSON.stringify({ pace: state.pace || 0, ...PACES[state.pace || 0], at: now, top: state.paceTop }));
  }
  const changed = acts.length || !!prev.stopped !== !!state.stopped || prev.error !== state.error || prev.armed !== armed || (state.pace || 0) !== (prev.pace || 0) || (state.alert || 0) !== (prev.alert || 0) || state.account !== prev.account || prev.pace === undefined;
  if (changed || !prev.at || now - (prev.saved || 0) >= 3_600_000) {
    state.saved = now;
    await kv.put(STATE_KEY, JSON.stringify(state));
  }
  return state;
}
