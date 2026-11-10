// The quota-guard Worker's entry (wrangler.guard.toml). A Worker's main
// module may export only handlers and classes, so guard.js's tables live
// there and this runs it.
//
// Its clock is a Durable Object's alarm (GuardClock), not a Cron Trigger:
// Cloudflare registered this Worker's `*/5` cron and never ran it (2026-10-13,
// hours of it; a known fault of new crons that year, on paid accounts too).
// The alarm runs the guard every five minutes and sets the next; the
// proxy's own cron (which runs) wakes it through the service binding GUARD
// every ten minutes in case it ever stopped, and it keeps running while the
// guard has the proxy stopped, to start it again in the next period.
import { guardRun, workerErrors, useByHour, cpuByRoute } from './guard.js';

const EVERY = 5 * 60_000;
const next = now => Math.floor(now / EVERY) * EVERY + EVERY;

export class GuardClock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  // The panel's reads (answered here: a Durable Object's request has 30 s
  // of CPU, a Worker's 10 ms on the Free plan), or a wake: the alarm set, if it isn't.
  async fetch(request) {
    const path = request ? new URL(request.url).pathname : '/';
    if (path !== '/') return answer(request, this.env);
    const at = await this.state.storage.getAlarm();
    if (!at) await this.state.storage.setAlarm(Date.now() + 1_000);
    return new Response(at ? 'running' : 'started');
  }
  async alarm() {
    const now = Date.now();
    try {
      const s = await guardRun(this.env, { now });
      if (s.acts.length || s.error)
        console.log(
          'guard',
          JSON.stringify({
            top: s.top,
            share: s.share?.[s.top],
            stopped: !!s.stopped,
            acts: s.acts,
            error: s.error
          })
        );
    } catch (e) {
      console.log('guard failed', String(e));
    } finally {
      await this.state.storage.setAlarm(next(Date.now()));
    }
  }
}

// /errors: each Worker's errors in 24 hours, for the admin panel; /hours:
// the last 7 days hour by hour (the panel's 容量, capacity.js); /cpu.
async function answer(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/errors')
    return workerErrors(env).then(
      r => Response.json(r),
      e => Response.json({ error: String(e?.message || e).slice(0, 200) })
    );
  if (path === '/hours')
    return useByHour(env).then(
      r => Response.json(r),
      e => Response.json({ error: String(e?.message || e).slice(0, 200) })
    );
  if (path === '/cpu') {
    const q = new URL(request.url).searchParams;
    return cpuByRoute(env, {
      hours: Number(q.get('hours')) || 24,
      group: q.get('group') || '',
      keys: q.get('keys') === '1',
      script: q.get('script') || ''
    }).then(
      r => Response.json(r),
      e => Response.json({ error: String(e?.message || e).slice(0, 300) })
    );
  }
  return new Response('', { status: 404 });
}

export default {
  // The proxy's wake (service binding): the clock started if it isn't; the
  // panel's reads answered by the clock's object.
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const clock = env.CLOCK.get(env.CLOCK.idFromName('clock'));
    if (path === '/tick') return clock.fetch('https://clock/');
    if (path === '/errors' || path === '/hours' || path === '/cpu') return clock.fetch(request);
    return new Response('', { status: 404 });
  },
  // (Kept: should the cron ever run, it's the same.)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(env.CLOCK.get(env.CLOCK.idFromName('clock')).fetch('https://clock/'));
  }
};
