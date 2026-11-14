// The Workers Free plan's way through (from 2026-11-13, Jay cancelled the
// $5 plan: "the domain is the only thing I pay for"): a request or a cron
// run there gets 10 ms of CPU and 50 outside calls, a Durable Object's
// request or alarm 30 s and its own 50. So the proxy's heavy routes and every
// cron's work run inside the Runner, a Durable Object of this same Worker
// (same code, same bindings and secrets):
//
//   - routes: worker.js fetch hands a request whose route would pass 10 ms
//     (the Workers Logs' CPU by route, /ops?check=cpu) to one of SHARDS
//     objects placed near the family (`apac`), which answers it with the
//     very same route(); cheap ones (R2's files, /config, TDX's copies)
//     stay in the Worker. The Worker's request.cf goes along as a header.
//   - crons: worker.js scheduled wakes two parts ('main' and 'slow', so a
//     builder's minutes never hold the notices up), 'main' in the routes'
//     object (cronObject); each keeps the tick and runs it from its alarm,
//     the jobs exactly as before.
//   - outside calls: an invocation makes its first DIRECT itself; past
//     them (a builder reads hundreds of pages) each goes through a relay
//     object, an invocation of its own (one outside call of its own 50; a
//     call to an object is an internal subrequest, 1,000 an invocation).
//
// Nothing here changes what a route answers or what a job does.

import { AsyncLocalStorage } from 'node:async_hooks';
import { freeHeavy, freeRoutesHeavy } from './transit-free.js';
import { sourceCall, asSourceCall, flushSources } from './sources.js';

export const RUNNER_MARK = 'x-orbit-runner';
export const RELAY_MARK = 'x-orbit-relay';
// (What a relayed call was made for, so the relay counts it as its caller would: sources.js.)
const SOURCE_MARK = 'x-orbit-source-call';
const CF_HEADER = 'x-orbit-cf';
// (One: an object is billed for the time it has any request in hand, so requests waiting on the
// same sources together are billed once; four objects billed each its own wait, 11-14, when the
// routes' time was 58% of the free day's 13,000 GB-s. Their CPU is a few ms each: one keeps up.)
export const SHARDS = 1;
export const RELAYS = 16;
export const DIRECT = 40;
const HINT = 'apac';

const budget = new AsyncLocalStorage();
const direct = (...a) => globalThis.__orbitDirectFetch.apply(globalThis, a);

// fetch, counted per invocation inside the Runner (outside it, as it was).
function patchFetch() {
  if (globalThis.__orbitDirectFetch) return;
  globalThis.__orbitDirectFetch = globalThis.fetch;
  // (Past the platform's own count, which also has the calls made other ways
  // (a binding's, the AI's): the call relayed, and the rest of the invocation's
  // too. 2026-11-13: 重大訊息's lists, read last in the AI builder's run, were
  // refused "Too many subrequests" at 30-odd of ours, every run for 3 hours.)
  const relayed = (b, input, init) => {
    const req = new Request(input, init);
    const headers = new Headers(req.headers);
    headers.set(RELAY_MARK, '1');
    const call = sourceCall();
    if (call) headers.set(SOURCE_MARK, JSON.stringify(call));
    b.relayed++;
    return b.ns.get(b.ns.idFromName(`relay:${b.n % RELAYS}`)).fetch(new Request(req, { headers }));
  };
  const tooMany = e => /too many subrequests/i.test(String(e?.message || e));
  globalThis.fetch = function (input, init) {
    const b = budget.getStore();
    if (!b) return direct(input, init);
    if (++b.n > DIRECT) return relayed(b, input, init);
    return (async () => direct(input, init))().catch(e => {
      if (!tooMany(e)) throw e;
      b.n = Math.max(b.n, DIRECT);
      return relayed(b, input, init);
    });
  };
}

// The Worker's side: which requests the Runner answers.
// (Cheap in the Logs, 2026-11-07 to 10: R2's files, /config, TDX's copies,
// the notices' lists, Law's live rooms. Yahoo's quotes stay in the
// Worker too: Yahoo turned most reads from Taiwan's side away, 2026-10-14.
// Bus times and Law's pages moved in, 2026-11-10: one in eight bus times
// (the cities' own feeds read and matched) and one in twenty pages passed 10 ms.)
const STAY = /^\/(?:data\/(?!build$)|config$|sources$|guard$|transit\/tdx$|transit\/config$|transit\/status$|transit\/gtfs$|push\/|law-live$|showcase\/|store\/check$|$)/;
export function runsInRunner(request, path) {
  if (request.headers.has(RUNNER_MARK) || request.method === 'OPTIONS') return false;
  const p = path.replace(/^\/api(?=\/)/, '');
  // (A free source's list of all Taiwan, YouBike's, read and kept in the Runner: transit-free.js.)
  const q = new URL(request.url).searchParams;
  if ((p === '/transit/tdx' && freeHeavy(q.get('p'))) || freeRoutesHeavy(p, q)) return true;
  // (The bus build's TDX asks, a city's list at a time: tools/gtfs-buses.mjs, its secret in the header.)
  if (p === '/transit/tdx' && request.headers.has('Authorization')) return true;
  if (STAY.test(p)) return false;
  if (/yahoo/i.test(request.url)) return false;
  return true;
}
const shardOf = request => {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARDS;
};
const CF_KEYS = ['colo', 'country', 'latitude', 'longitude', 'city', 'region', 'regionCode', 'timezone', 'postalCode', 'asn', 'continent'];
export async function toRunner(request, env, fallback) {
  const cf = {};
  for (const k of CF_KEYS) if (request.cf?.[k] != null) cf[k] = request.cf[k];
  const headers = new Headers(request.headers);
  headers.set(RUNNER_MARK, '1');
  headers.set(CF_HEADER, JSON.stringify(cf));
  const spare = request.method === 'GET' || request.method === 'HEAD' ? null : request.clone();
  try {
    const stub = env.RUNNER.get(env.RUNNER.idFromName(`route:${shardOf(request)}`), { locationHint: HINT });
    return await stub.fetch(new Request(request, { headers }));
  } catch (e) {
    // (The Runner unreachable: answered here, as before it.)
    console.log('runner failed', String(e?.message || e).slice(0, 200));
    return fallback(spare || request);
  }
}

// The cron's side: each part woken with the tick.
export const CRON_PARTS = ['main', 'slow'];
// The object a part runs in: 'main' (light: notices, YouBike kept warm, the meter, F1's minute)
// in the routes' own, already awake whenever anyone uses the apps, so its minutes aren't billed
// twice; 'slow' (the builders' minutes of CPU) its own, never holding a route up.
// (A Durable Object is billed while awake: a request or alarm, then about ten seconds more.)
export const cronObject = part => (part === 'main' ? 'route:0' : `cron:${part}`);
const SLOW_JOBS = new Set(['store-backup', 'capacity', 'data-folders', 'weather-skill', 'radar', 'mail-alerts']);
export const partOf = job => (job.startsWith('build:') || SLOW_JOBS.has(job) ? 'slow' : 'main');
export function tickRunner(event, env, ctx, parts = CRON_PARTS) {
  for (const part of parts) {
    const body = JSON.stringify({
      cron: event.cron,
      at: event.scheduledTime || Date.now(),
      part
    });
    ctx.waitUntil(
      env.RUNNER.get(env.RUNNER.idFromName(cronObject(part)), { locationHint: HINT })
        .fetch('https://runner/__tick', { method: 'POST', body })
        .catch(e => console.log('runner tick failed', part, String(e?.message || e)))
    );
  }
}

// A context for code written for a Worker's (waitUntil kept and awaited).
function shimCtx() {
  const pending = [];
  return {
    pending,
    waitUntil: p => pending.push(Promise.resolve(p).catch(() => {})),
    passThroughOnException() {},
    async settle() {
      while (pending.length) await Promise.all(pending.splice(0));
    }
  };
}

// The Durable Object. `handle(request, env, ctx)`: the Worker's own fetch;
// `cronTick(event, env, ctx, part)`: its cron, one part.
export function makeRunner(handle, cronTick) {
  patchFetch();
  return class Runner {
    constructor(state, env) {
      this.state = state;
      this.env = env;
    }
    async fetch(request) {
      // A relay: one outside call for an invocation past its own.
      if (request.headers.has(RELAY_MARK)) {
        const headers = new Headers(request.headers);
        headers.delete(RELAY_MARK);
        let call = null;
        try {
          call = JSON.parse(headers.get(SOURCE_MARK) || 'null');
        } catch {}
        headers.delete(SOURCE_MARK);
        const req = new Request(request, { headers });
        const res = await (call ? asSourceCall(call, () => direct(req)) : direct(req));
        flushSources(this.env, this.state);
        return res;
      }
      const url = new URL(request.url);
      if (url.pathname === '/__tick' && url.hostname === 'runner') {
        const tick = await request.json().catch(() => null);
        if (tick) {
          const ticks = ((await this.state.storage.get('ticks')) || []).concat([tick]).slice(-3);
          await this.state.storage.put('ticks', ticks);
          if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now());
        }
        return new Response('ok');
      }
      // A route: the Worker's request as it came, its request.cf from the header.
      let cf = {};
      try {
        cf = JSON.parse(request.headers.get(CF_HEADER) || '{}');
      } catch {}
      const req = new Request(request);
      Object.defineProperty(req, 'cf', { value: cf, configurable: true });
      const ctx = shimCtx();
      const res = await budget.run({ n: 0, relayed: 0, ns: this.env.RUNNER }, () => handle(req, this.env, ctx));
      // (What the route left to finish runs on after the answer, as in a Worker.)
      if (ctx.pending.length) ctx.settle();
      // (Where it ran, for a look: x-orbit-ran.)
      if (res.status === 101 || res.webSocket) return res;
      const out = new Response(res.body, res);
      out.headers.set('x-orbit-ran', 'runner');
      return out;
    }
    async alarm() {
      const ticks = (await this.state.storage.get('ticks')) || [];
      await this.state.storage.put('ticks', []);
      const b = { n: 0, relayed: 0, ns: this.env.RUNNER };
      for (const t of ticks) {
        const ctx = shimCtx();
        try {
          await budget.run(b, async () => {
            await cronTick({ cron: t.cron, scheduledTime: t.at }, this.env, ctx, t.part || null);
            await ctx.settle();
          });
        } catch (e) {
          console.log('cron failed', t.part, String(e?.message || e).slice(0, 200));
        }
      }
      if (b.relayed) console.log('runner relayed', ticks.map(t => t.part).join(), b.n, b.relayed);
      // (Ticks that came while this ran: their turn now.)
      if (((await this.state.storage.get('ticks')) || []).length && !(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now());
    }
  };
}
