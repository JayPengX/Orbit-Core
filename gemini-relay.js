// The Gemini relay (Worker gemini-relay, wrangler.gemini.toml): Orbit Class's
// photo import and plain-language edits call Google's Gemini from here, a
// Worker pinned to Taiwan ([placement] gcp:asia-east1), through the proxy's
// service binding GEMINI_RELAY. The proxy itself runs near each caller: pinned
// to Taiwan whole, Yahoo turned most of its reads away (2026-10-14: 11 of 16
// refused there, none from a Worker without placement); Gemini refuses
// Hong Kong, where a caller's colo can be (wrangler.toml's history). No
// address of its own: only the proxy reaches it. Also the county 法規 rule
// pages that serve only Taiwan (law-hosts.js), for /law-page's build key.
import { twOnly } from './law-hosts.js';

const GEMINI = 'https://generativelanguage.googleapis.com/';

export default {
  async fetch(request) {
    const to = new URL(request.url).searchParams.get('to') || '';
    if (twOnly(to) && request.method === 'GET') {
      const pick = ['User-Agent', 'Accept', 'Accept-Language'].filter(h => request.headers.get(h)).map(h => [h, request.headers.get(h)]);
      return fetch(to, { headers: Object.fromEntries(pick), redirect: 'manual' });
    }
    if (!to.startsWith(GEMINI)) return new Response('', { status: 400 });
    return fetch(to, { method: request.method, headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' }, body: request.method === 'GET' ? undefined : request.body });
  }
};
