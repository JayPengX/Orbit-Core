// The Gemini relay (Worker gemini-relay, wrangler.gemini.toml): Orbit Class's
// photo import and plain-language edits call Google's Gemini from here, a
// Worker pinned to Taiwan ([placement] gcp:asia-east1), through the proxy's
// service binding GEMINI_RELAY. The proxy itself runs near each caller: pinned
// to Taiwan whole, Yahoo turned most of its reads away (2026-10-14: 11 of 16
// refused there, none from a Worker without placement); Gemini refuses
// Hong Kong, where a caller's colo can be (wrangler.toml's history). No
// address of its own: only the proxy reaches it. Also the county 法規 rule
// pages that serve only Taiwan (law-hosts.js), for /law-page's build key;
// and 人事行政總處's 停班停課 page (typhoon.js), for Orbit Weather. And
// TheSportsDB's CPBL day list for a game's final (push.js): its free key
// answers the proxy's shared addresses with 429 most of the time, so a
// second way out. And CPBL's own list of today's games (asia-baseball.js
// cpblToday), which cpbl.com.tw answers only in Taiwan.
import { twOnly } from './law-hosts.js';
import { DGPA_NDS } from './typhoon.js';
import { tsdbCpblDay } from './kit/catalog.mjs';
import { CPBL_TODAY, cpblTodayExchange } from './asia-baseball.js';

const GEMINI = 'https://generativelanguage.googleapis.com/';

export default {
  async fetch(request) {
    const to = new URL(request.url).searchParams.get('to') || '';
    if ((twOnly(to) || to === DGPA_NDS || tsdbCpblDay(to)) && request.method === 'GET') {
      const pick = ['User-Agent', 'Accept', 'Accept-Language'].filter(h => request.headers.get(h)).map(h => [h, request.headers.get(h)]);
      return fetch(to, { headers: Object.fromEntries(pick), redirect: 'manual' });
    }
    // CPBL's list of today's games (asia-baseball.js): the whole exchange made here, in Taiwan.
    if (to === CPBL_TODAY && request.method === 'GET') return cpblTodayExchange();
    if (!to.startsWith(GEMINI)) return new Response('', { status: 400 });
    return fetch(to, { method: request.method, headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' }, body: request.method === 'GET' ? undefined : request.body });
  }
};
