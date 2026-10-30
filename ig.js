// ---- ig.js ----
// orbit-ig: a test of whether Instagram answers a Cloudflare Worker at all,
// before anything is built on it or any account goes near it (Jay 2026-10-30
// wants Orbit Instagram as a home-screen web app; a page can't load another
// site, so it would have to be served through a Worker).
//
//   GET /probe   Instagram's public pages and files as this Worker sees them:
//                status and size only, no account, no cookies. Kept a minute.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const TARGETS = {
  login: 'https://www.instagram.com/accounts/login/',
  home: 'https://www.instagram.com/',
  profile: 'https://www.instagram.com/instagram/',
  profileApi: 'https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram',
};

async function probe(fetcher = fetch) {
  const out = {};
  for (const [name, url] of Object.entries(TARGETS)) {
    const t = Date.now();
    try {
      const r = await fetcher(url, { headers: { 'user-agent': UA, accept: name === 'profileApi' ? 'application/json' : 'text/html', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8', 'x-ig-app-id': '936619743392459' }, redirect: 'manual' });
      const body = await r.text();
      out[name] = { status: r.status, bytes: body.length, ms: Date.now() - t, location: r.headers.get('location') || undefined, loginWall: /accounts\/login/.test(r.headers.get('location') || '') || undefined };
    } catch (e) {
      out[name] = { error: String(e && e.message || e) };
    }
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/probe') return new Response('Not found', { status: 404 });
    const cache = caches.default;
    const key = new Request(url.origin + '/probe');
    const kept = await cache.match(key);
    if (kept) return kept;
    const res = Response.json({ at: new Date().toISOString(), colo: request.cf && request.cf.colo, results: await probe() }, { headers: { 'cache-control': 'public, max-age=60' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};

export { probe, TARGETS };
