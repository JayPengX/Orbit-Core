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
import { guardRun, workerErrors } from './guard.js';

const EVERY = 5 * 60_000;
const next = now => Math.floor(now / EVERY) * EVERY + EVERY;

export class GuardClock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  // A wake: the alarm set, if it isn't.
  async fetch() {
    const at = await this.state.storage.getAlarm();
    if (!at) await this.state.storage.setAlarm(Date.now() + 1_000);
    return new Response(at ? 'running' : 'started');
  }
  async alarm() {
    const now = Date.now();
    try {
      const s = await guardRun(this.env, { now });
      if (s.acts.length || s.error) console.log('guard', JSON.stringify({ top: s.top, share: s.share?.[s.top], stopped: !!s.stopped, acts: s.acts, error: s.error }));
    } catch (e) {
      console.log('guard failed', String(e));
    } finally {
      await this.state.storage.setAlarm(next(Date.now()));
    }
  }
}

export default {
  // The proxy's wake (service binding): the clock started if it isn't.
  // /errors: each Worker's errors in 24 hours, for the admin panel.
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/errors')
      return workerErrors(env).then(
        r => Response.json(r),
        e => Response.json({ error: String(e?.message || e).slice(0, 200) })
      );
    if (path !== '/tick') return new Response('', { status: 404 });
    return env.CLOCK.get(env.CLOCK.idFromName('clock')).fetch('https://clock/');
  },
  // (Kept: should the cron ever run, it's the same.)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(env.CLOCK.get(env.CLOCK.idFromName('clock')).fetch('https://clock/'));
  }
};
