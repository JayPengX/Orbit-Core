// The quota-guard Worker's entry (wrangler.guard.toml): a Worker's main
// module may export only handlers, so guard.js's tables live there and this
// runs it.
import { guardRun } from './guard.js';

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
